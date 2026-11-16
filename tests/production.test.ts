import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const locations = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd(), getPath: () => locations.userData } }))
import { closeDatabase, getDb, initDatabase, queryOne, run } from '../electron/database'
import * as production from '../electron/production-store'
const stores = ['workshops', 'materials', 'material_inbound', 'material_outbound', 'suppliers', 'productions', 'production_materials', 'finished_products', 'finished_product_logs', 'stock_logs']
function bundle() { return { version: 1 as const, stores: Object.fromEntries(stores.map(store => [store, [] as any[]])) } }
let dir: string
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'production-tests-'))
  locations.userData = dir
  await initDatabase(path.join(dir, 'orders.db'))
  production.initProductionStore()
})
afterEach(() => { vi.restoreAllMocks(); closeDatabase(); fs.rmSync(dir, { recursive: true, force: true }) })
describe('production SQLite migration', () => {
  it('backs up all ten stores, isolates IDs, preserves records, and survives reopen', async () => {
    const data = bundle()
    data.stores.materials.push({ id: 1, name: '原料', quantity: 10 })
    data.stores.workshops.push({ id: 1, name: '旧车间' })
    const status = production.migrateProductionData(data)
    expect(status.migrated).toBe(true)
    expect(JSON.parse(fs.readFileSync(status.backupPath!, 'utf8'))).toEqual(data)
    expect(production.getProductionRecord('materials', 1)).toEqual(data.stores.materials[0])
    expect(queryOne('SELECT name FROM workshops WHERE id=1')).toBeNull()
    closeDatabase()
    await initDatabase(path.join(dir, 'orders.db'))
    production.initProductionStore()
    expect(production.getProductionRecords('materials')).toEqual(data.stores.materials)
    expect(production.getProductionStatus().migrated).toBe(true)
  })
  it('does not reimport legacy data after SQLite edits', () => {
    const data = bundle(); data.stores.materials.push({ id: 1, quantity: 10 })
    production.migrateProductionData(data)
    production.applyProductionOperations([{ type: 'put', store: 'materials', data: { id: 1, quantity: 8 } }])
    production.migrateProductionData(data)
    expect(production.getProductionRecord('materials', 1)?.quantity).toBe(8)
  })
  it('completes an empty first-run migration and allocates IDs separately per store', () => {
    production.migrateProductionData(bundle())
    expect(production.applyProductionOperations([{ type: 'add', store: 'materials', data: { quantity: 0 } }, { type: 'add', store: 'suppliers', data: { name: '供货商' } }])).toEqual({ results: [1, 1] })
  })
  it('rejects incomplete bundles, invalid stores, duplicate identifiers, and non-JSON values', () => {
    expect(() => production.migrateProductionData({ version: 1, stores: {} })).toThrow()
    const data = bundle(); data.stores.materials.push({ id: 1 }, { id: 1 })
    expect(() => production.migrateProductionData(data)).toThrow()
    expect(() => production.getProductionRecords('orders')).toThrow()
    expect(production.getProductionStatus().migrated).toBe(false)
    data.stores.materials = [{ id: 1, quantity: Infinity }]
    expect(() => production.migrateProductionData(data)).toThrow()
  })
  it('never marks migration complete on backup failure and permits retry', () => {
    const original = fs.writeFileSync
    vi.spyOn(fs, 'writeFileSync').mockImplementation(((file: any, ...args: any[]) => {
      if (String(file).endsWith('.json')) throw new Error('backup disk full')
      return (original as any)(file, ...args)
    }) as any)
    expect(() => production.migrateProductionData(bundle())).toThrow('backup disk full')
    expect(production.getProductionStatus().migrated).toBe(false)
    vi.restoreAllMocks()
    expect(production.migrateProductionData(bundle()).migrated).toBe(true)
  })
  it('rolls back every imported record when an SQL write fails, then retries', () => {
    const data = bundle(); data.stores.materials.push({ id: 1, quantity: 1 }); data.stores.stock_logs.push({ id: 1 })
    getDb().run("CREATE TRIGGER reject_import BEFORE INSERT ON production_records WHEN NEW.store = 'stock_logs' BEGIN SELECT RAISE(ABORT, 'injected import failure'); END")
    expect(() => production.migrateProductionData(data)).toThrow('injected import failure')
    expect(production.getProductionStatus().migrated).toBe(false)
    expect(production.getProductionRecords('materials')).toEqual([])
    getDb().run('DROP TRIGGER reject_import')
    expect(production.migrateProductionData(data).migrated).toBe(true)
  })
  it('links legacy task numbers only when uniquely matched to actual orders', () => {
    run("INSERT INTO orders(documentNo) VALUES('MATCH')")
    const id = queryOne("SELECT id FROM orders WHERE documentNo='MATCH'").id
    const data = bundle(); data.stores.productions.push({ id: 1, order_no: 'MATCH', order_id: 999 }, { id: 2, order_no: 'missing', order_id: id })
    production.migrateProductionData(data)
    expect(production.getProductionRecord('productions', 1)?.orderId).toBe(id)
    expect(production.getProductionRecord('productions', 2)?.orderId).toBeNull()
  })
})
describe('atomic production operations', () => {
  beforeEach(() => { const data = bundle(); data.stores.materials.push({ id: 1, quantity: 10 }); production.migrateProductionData(data) })
  it('rolls back stock changes when a later log insert fails', () => {
    getDb().run("CREATE TRIGGER reject_log BEFORE INSERT ON production_records WHEN NEW.store='stock_logs' BEGIN SELECT RAISE(ABORT, 'log failed'); END")
    expect(() => production.applyProductionOperations([{ type: 'put', store: 'materials', data: { id: 1, quantity: 8 }, expectedQuantity: 10 }, { type: 'add', store: 'stock_logs', data: { quantity: -2 } }])).toThrow('log failed')
    expect(production.getProductionRecord('materials', 1)?.quantity).toBe(10)
    expect(production.getProductionRecords('stock_logs')).toEqual([])
  })
  it('commits stock and log together and rejects stale stock, negatives and unknown IDs', () => {
    production.applyProductionOperations([{ type: 'put', store: 'materials', data: { id: 1, quantity: 8 }, expectedQuantity: 10 }, { type: 'add', store: 'stock_logs', data: { quantity: -2 } }])
    expect(production.getProductionRecords('stock_logs')).toHaveLength(1)
    expect(() => production.applyProductionOperations([{ type: 'put', store: 'materials', data: { id: 1, quantity: 7 }, expectedQuantity: 10 }])).toThrow()
    expect(() => production.applyProductionOperations([{ type: 'put', store: 'materials', data: { id: 1, quantity: -1 } }])).toThrow()
    expect(() => production.applyProductionOperations([{ type: 'put', store: 'materials', data: { id: 999, quantity: 0 } }])).toThrow()
    expect(production.getProductionRecord('materials', 1)?.quantity).toBe(8)
  })
  it('rolls back earlier records when a later business validation rejects stale or negative stock', () => {
    for (const invalid of [
      { type: 'put' as const, store: 'materials', data: { id: 1, quantity: 8 }, expectedQuantity: 9 },
      { type: 'put' as const, store: 'materials', data: { id: 1, quantity: -1 }, expectedQuantity: 10 },
    ]) {
      expect(() => production.applyProductionOperations([
        { type: 'add', store: 'stock_logs', data: { quantity: -2 } }, invalid,
      ])).toThrow()
      expect(production.getProductionRecords('stock_logs')).toEqual([])
      expect(production.getProductionRecord('materials', 1)?.quantity).toBe(10)
    }
  })
  it('exposes canonical linked-order protection without trusting legacy IDs', () => {
    const result = run("INSERT INTO orders(documentNo) VALUES('PROTECTED')")
    expect((production as any).hasLinkedProductionOrder(result.lastInsertRowid)).toBe(false)
    production.applyProductionOperations([{ type: 'add', store: 'productions', data: { orderId: result.lastInsertRowid } }])
    expect((production as any).hasLinkedProductionOrder(result.lastInsertRowid)).toBe(true)
  })
  it('resolves new finished-product IDs in both logs within one atomic batch', () => {
    const result = production.applyProductionOperations([
      { type: 'add', store: 'finished_products', data: { quantity: 4, product_name: '成品' } },
      { type: 'add', store: 'finished_product_logs', data: { product_id: { $result: 0 }, quantity: 4 } },
      { type: 'add', store: 'stock_logs', data: { item_id: { $result: 0 }, quantity: 4 } },
    ])
    expect(production.getProductionRecord('finished_product_logs', result.results[1]!)?.product_id).toBe(result.results[0])
    expect(production.getProductionRecord('stock_logs', result.results[2]!)?.item_id).toBe(result.results[0])
  })
  it('requires a real order for new tasks and snapshots its document in main', () => {
    expect(() => production.applyProductionOperations([{ type: 'add', store: 'productions', data: { order_no: 'manual' } }])).toThrow()
    const result = run("INSERT INTO orders(documentNo,receiver) VALUES('DOC-1','客户甲')")
    const { results } = production.applyProductionOperations([{ type: 'add', store: 'productions', data: { orderId: result.lastInsertRowid, order_no: 'forged' } }])
    const task = production.getProductionRecord('productions', results[0]!)!
    expect(task.order_no).toBe('DOC-1')
    expect(task.orderDocumentSnapshot.receiver).toBe('客户甲')
  })
})

it('rejects replayed warehouse batches before a second stock addition can commit',()=>{
  production.migrateProductionData(bundle())
  const order=run("INSERT INTO orders(documentNo) VALUES('WAREHOUSE')").lastInsertRowid
  const taskId=production.applyProductionOperations([{type:'add',store:'productions',data:{orderId:order,status:'completed'}}]).results[0]!
  const task=production.getProductionRecord('productions',taskId)!
  const ops=[{type:'add',store:'finished_products',data:{quantity:5,product_name:'成品',production_id:taskId}}, {type:'put',store:'productions',data:{...task,status:'warehoused'},expectedStatus:'completed'}, {type:'add',store:'stock_logs',data:{quantity:5}}] as any
  production.applyProductionOperations(ops)
  expect(()=>production.applyProductionOperations(ops)).toThrow(/状态/)
  expect(production.getProductionRecords('finished_products')).toHaveLength(1)
  expect(production.getProductionRecords('stock_logs')).toHaveLength(1)
})
