import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { backupDatabase, queryAll, queryOne, run, withTransaction } from './database'

export const PRODUCTION_STORES = ['workshops', 'materials', 'material_inbound', 'material_outbound', 'suppliers', 'productions', 'production_materials', 'finished_products', 'finished_product_logs', 'stock_logs'] as const
export type ProductionRecord = Record<string, any>
export interface ProductionBundle { version: 1; stores: Record<string, ProductionRecord[]> }
export interface ProductionOperation { type: 'add' | 'put' | 'delete'; store: string; data?: ProductionRecord; id?: number; expectedQuantity?: number; expectedStatus?: string }
export interface ProductionStatus { version: 1; migrated: boolean; backupPath: string | null }

export function initProductionStore(): void {
  withTransaction(() => {
    run('CREATE TABLE IF NOT EXISTS production_records (store TEXT NOT NULL, id INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(store,id))')
    run('CREATE TABLE IF NOT EXISTS production_sequences (store TEXT PRIMARY KEY, next_id INTEGER NOT NULL)')
    run('CREATE TABLE IF NOT EXISTS production_migrations (version INTEGER PRIMARY KEY, backup_path TEXT NOT NULL, migrated_at TEXT NOT NULL)')
  })
}
function assertStore(store: string): void {
  if (!(PRODUCTION_STORES as readonly string[]).includes(store)) throw new Error('无效的生产数据表')
}
function assertId(id: any): asserts id is number {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('记录编号必须是正整数')
}
function validateJson(value: any, depth = 0): void {
  if (depth > 50) throw new Error('数据嵌套过深')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (Array.isArray(value)) { value.forEach(item => validateJson(item, depth + 1)); return }
  if (value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    Object.entries(value).forEach(([key, item]) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('无效数据字段')
      validateJson(item, depth + 1)
    })
    return
  }
  throw new Error('数据必须为有效 JSON，数值必须有限')
}
function validateRecord(data: any, requireId: boolean): asserts data is ProductionRecord {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('记录必须是对象')
  validateJson(data)
  if (requireId || data.id !== undefined) assertId(data.id)
  if (JSON.stringify(data).length > 5_000_000) throw new Error('单条记录过大')
}
export function getProductionStatus(): ProductionStatus {
  const marker = queryOne('SELECT backup_path FROM production_migrations WHERE version=1')
  return { version: 1, migrated: !!marker, backupPath: marker?.backup_path || null }
}
export function getProductionRecords(store: string): ProductionRecord[] {
  assertStore(store)
  return queryAll('SELECT data FROM production_records WHERE store=? ORDER BY id', [store]).map(row => JSON.parse(row.data))
}
export function getProductionRecord(store: string, id: number): ProductionRecord | null {
  assertStore(store); assertId(id)
  const row = queryOne('SELECT data FROM production_records WHERE store=? AND id=?', [store, id])
  return row ? JSON.parse(row.data) : null
}
export function hasLinkedProductionOrder(orderId: number): boolean {
  assertId(orderId)
  return getProductionRecords('productions').some(record => record.orderId === orderId)
}
function orderSnapshot(orderId: number): ProductionRecord {
  assertId(orderId)
  const order = queryOne('SELECT * FROM orders WHERE id=?', [orderId])
  if (!order) throw new Error('关联订单不存在，请刷新后选择')
  return { ...order, items: queryAll('SELECT * FROM order_items WHERE orderId=? ORDER BY sortOrder,id', [orderId]) }
}
function linkLegacyTask(record: ProductionRecord): ProductionRecord {
  // Legacy numeric IDs came from a different database and cannot establish identity.
  const number = typeof record.order_no === 'string' ? record.order_no.trim() : ''
  const matches = number ? queryAll('SELECT id FROM orders WHERE documentNo=? OR orderNo=?', [number, number]) : []
  if (matches.length !== 1) return { ...record, orderId: null, orderDocumentSnapshot: null }
  const snapshot = orderSnapshot(matches[0].id)
  return { ...record, orderId: snapshot.id, orderDocumentSnapshot: snapshot }
}
function insertRecord(store: string, record: ProductionRecord): number {
  const id = record.id
  run('INSERT INTO production_records(store,id,data) VALUES(?,?,?)', [store, id, JSON.stringify(record)])
  run('INSERT INTO production_sequences(store,next_id) VALUES(?,?) ON CONFLICT(store) DO UPDATE SET next_id=MAX(next_id,excluded.next_id)', [store, id + 1])
  return id
}
export function migrateProductionData(bundle: ProductionBundle): ProductionStatus {
  if (getProductionStatus().migrated) return getProductionStatus()
  if (!bundle || bundle.version !== 1 || !bundle.stores || typeof bundle.stores !== 'object') throw new Error('迁移数据格式无效')
  if (Object.keys(bundle.stores).length !== PRODUCTION_STORES.length) throw new Error('迁移必须包含全部十类数据')
  for (const store of PRODUCTION_STORES) {
    if (!Object.prototype.hasOwnProperty.call(bundle.stores, store) || !Array.isArray(bundle.stores[store])) throw new Error('迁移必须包含全部十类数据')
    const ids = new Set<number>()
    for (const record of bundle.stores[store]) {
      validateRecord(record, true)
      if (ids.has(record.id)) throw new Error('迁移数据包含重复编号')
      ids.add(record.id)
    }
  }
  // Both backups complete before a single document is imported. Source IndexedDB stays intact.
  backupDatabase('production-migration')
  const backupDir = path.join(app.getPath('userData'), 'production-backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `indexeddb-v1-${Date.now()}-${randomUUID()}.json`)
  fs.writeFileSync(backupPath, JSON.stringify(bundle, null, 2), { flag: 'wx', encoding: 'utf8', mode: 0o600 })
  const fd = fs.openSync(backupPath, 'r')
  try { fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  withTransaction(() => {
    if (queryOne('SELECT id FROM production_records LIMIT 1')) throw new Error('目标数据库已有生产记录，迁移已停止以免覆盖')
    for (const store of PRODUCTION_STORES) {
      for (const source of bundle.stores[store]) insertRecord(store, store === 'productions' ? linkLegacyTask(source) : source)
    }
    run('INSERT INTO production_migrations(version,backup_path,migrated_at) VALUES(1,?,?)', [backupPath, new Date().toISOString()])
  })
  return getProductionStatus()
}
// A value {$result: n} refers to the ID returned by an earlier add in the same transaction.
function resolveResults(value: any, results: (number | null)[]): any {
  if (Array.isArray(value)) return value.map(item => resolveResults(item, results))
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, '$result')) {
      const index = value.$result
      if (!Number.isInteger(index) || index < 0 || index >= results.length || results[index] === null) throw new Error('无效的批次记录引用')
      return results[index]
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveResults(item, results)]))
  }
  return value
}
export function applyProductionOperations(operations: ProductionOperation[]): { results: (number | null)[] } {
  if (!getProductionStatus().migrated) throw new Error('生产数据尚未迁移，请重试迁移')
  if (!Array.isArray(operations) || !operations.length || operations.length > 1000) throw new Error('无效的生产数据批次')
  return withTransaction(() => {
    const results: (number | null)[] = []
    for (const op of operations) {
      if (!op || !['add', 'put', 'delete'].includes(op.type)) throw new Error('无效的生产操作')
      assertStore(op.store)
      if (op.type === 'delete') {
        assertId(op.id)
        run('DELETE FROM production_records WHERE store=? AND id=?', [op.store, op.id])
        results.push(null)
        continue
      }
      validateRecord(op.data, op.type === 'put')
      let data = resolveResults(op.data, results)
      const previous = data.id ? getProductionRecord(op.store, data.id) : null
      if (op.type === 'put' && !previous) throw new Error('记录不存在，请刷新重试')
      if (op.expectedStatus !== undefined && (typeof op.expectedStatus !== 'string' || previous?.status !== op.expectedStatus)) throw new Error('生产任务状态已变化，请刷新后重试')
      if (op.store === 'productions' && op.type === 'put' && data.status === 'warehoused' && previous?.status !== 'completed') throw new Error('生产任务状态不允许重复入库')
      if (op.expectedQuantity !== undefined && (!Number.isFinite(op.expectedQuantity) || (previous?.quantity || 0) !== op.expectedQuantity)) throw new Error('库存已变化，请刷新后重试')
      if (['materials', 'finished_products'].includes(op.store) && (typeof data.quantity !== 'number' || !Number.isFinite(data.quantity) || data.quantity < 0)) throw new Error('库存必须为有限非负数值')
      if (op.store === 'productions') {
        if (op.type === 'add') {
          const snapshot = orderSnapshot(data.orderId)
          data = { ...data, orderId: snapshot.id, order_id: snapshot.id, order_no: snapshot.documentNo, orderDocumentSnapshot: snapshot }
        } else {
          // State transitions cannot silently change a task's order or its historical snapshot.
          data = { ...data, orderId: previous!.orderId ?? null, order_id: previous!.order_id || 0, order_no: previous!.order_no, orderDocumentSnapshot: previous!.orderDocumentSnapshot ?? null }
        }
      }
      if (op.type === 'add') {
        const id = data.id || queryOne('SELECT next_id FROM production_sequences WHERE store=?', [op.store])?.next_id || 1
        assertId(id)
        if (id >= Number.MAX_SAFE_INTEGER) throw new Error('记录编号超出范围')
        results.push(insertRecord(op.store, { ...data, id }))
      } else {
        run('UPDATE production_records SET data=? WHERE store=? AND id=?', [JSON.stringify(data), op.store, data.id])
        results.push(data.id)
      }
    }
    return { results }
  })
}
