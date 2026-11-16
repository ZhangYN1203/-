import * as XLSX from 'xlsx'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
vi.mock('electron', () => ({ app: { getAppPath: () => process.cwd(), getPath: () => os.tmpdir() } }))
import { initDatabase, closeDatabase, queryOne, queryAll, run, withTransaction } from '../electron/database'
import * as orders from '../electron/handlers'
import { initProductionStore } from '../electron/production-store'
let dir: string, file: string, customer: any, product: any
const request = () => ({ order: { customerId: customer.id, receiver: customer.name, receiverAddress: customer.address, date: '2026-11-16', documentNo: 'DB-20261116-001' }, items: [{ productCode: product.productCode, productName: product.productName, specification: '200g', packageSpec: '1x12', unit: '箱', quantity: 2.5, price: 3.49, amount: 99999 }] })
beforeEach(async () => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'order-save-')); file = path.join(dir, 'orders.db'); await initDatabase(file); initProductionStore(); customer = queryOne('SELECT * FROM customers LIMIT 1'); product = queryOne('SELECT * FROM products LIMIT 1') })
afterEach(() => { vi.restoreAllMocks(); closeDatabase(); fs.rmSync(dir, { recursive: true, force: true }) })
describe('whole-order save', () => {
  it('saves header and details together and calculates money in the main process', () => {
    const saved = orders.saveOrderWithItems(request())
    const order = orders.getOrderById(saved.id)
    expect(order.receiver).toBe(customer.name)
    expect(order.items).toHaveLength(1)
    expect(order.items[0].quantity).toBe(2.5)
    expect(order.items[0].amount).toBe(8.73)
  })
  it('preserves the previous complete order after a failed edit on disk', () => {
    const saved = orders.saveOrderWithItems(request()), before = orders.getOrderById(saved.id), disk = fs.readFileSync(file), rename = fs.renameSync
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => { if (to === file) throw new Error('Disk full'); return rename(from, to) })
    expect(() => orders.saveOrderWithItems({ ...request(), id: saved.id, items: [{ ...request().items[0], quantity: 100 }] })).toThrow('Disk full')
    expect(orders.getOrderById(saved.id)).toEqual(before)
    expect(fs.readFileSync(file)).toEqual(disk)
  })
  it('keeps historical packing specs when the product catalog changes', () => {
    const saved = orders.saveOrderWithItems(request())
    run('UPDATE products SET packageSpec = ? WHERE id = ?', ['1x999', product.id])
    expect(orders.getOrderById(saved.id).items[0].packageSpec).toBe('1x12')
  })
  it('allocates distinct numbers at save time even with identical draft numbers', () => {
    const a = orders.saveOrderWithItems(request()), b = orders.saveOrderWithItems(request())
    expect(a.documentNo).toBe('DB-20261116-001')
    expect(b.documentNo).toBe('DB-20261116-002')
    orders.saveOrderWithItems({ ...request(), id: a.id, order: { ...request().order, date: '2026-11-17' } })
    expect(orders.getOrderById(a.id).documentNo).toBe(a.documentNo)
  })
  it.each([NaN, Infinity, -1])('rejects invalid quantity %s without creating a header', quantity => {
    expect(() => orders.saveOrderWithItems({ ...request(), items: [{ ...request().items[0], quantity }] })).toThrow(/数量/)
    expect(queryAll('SELECT * FROM orders')).toHaveLength(0)
  })
  it('preserves fractional quantities in exports', () => {
    orders.saveOrderWithItems(request())
    expect(orders.getOrderSummary('2026-11-16', '2026-11-16').details[0].quantity).toBe(2.5)
  })
  it('marks legacy unknown packing specs instead of borrowing the current catalog', () => {
    const header = orders.createOrder({ date: '2026-11-16', receiver: customer.name })
    run('INSERT INTO order_items(orderId,productCode,productName) VALUES (?,?,?)', [header.id, product.productCode, product.productName])
    const detail = orders.getOrderById(header.id).items[0]
    expect(detail.packageSpec).toBeNull()
    expect(detail.snapshotNeedsReview).toBe(true)
  })
  it('protects linked production orders through whole-order and legacy mutation APIs', () => {
    const saved = orders.saveOrderWithItems(request()), before = orders.getOrderById(saved.id)
    run('INSERT INTO production_records(store,id,data) VALUES(?,?,?)', ['productions', 1, JSON.stringify({ id:1, orderId:saved.id })])
    expect(() => orders.saveOrderWithItems({ ...request(), id:saved.id, items:[{...request().items[0],quantity:50}] })).toThrow(/关联生产/)
    expect(() => orders.deleteOrder(saved.id)).toThrow(/关联生产/)
    expect(() => orders.deleteOrderItem(before.items[0].id)).toThrow(/关联生产/)
    expect(() => orders.updateOrderItem(before.items[0].id,{quantity:50})).toThrow(/关联生产/)
    expect(() => orders.updateOrder(saved.id,{...request().order,receiver:'变更客户'})).toThrow(/关联生产/)
    expect(orders.getOrderById(saved.id)).toEqual(before)
  })
  it('rejects sub-micro-unit quantities instead of silently rounding their money to zero', () => {
    expect(() => orders.saveOrderWithItems({...request(),items:[{...request().items[0],quantity:0.0000001}]})).toThrow(/数量/)
  })
  it('validates legacy line writes and recalculates their amount', () => {
    const saved=orders.saveOrderWithItems(request())
    expect(() => orders.createOrderItem({...request().items[0],orderId:saved.id,quantity:-1})).toThrow(/数量/)
    const id=orders.createOrderItem({...request().items[0],orderId:saved.id}).id
    expect(orders.getOrderById(saved.id).items.find((item:any)=>item.id===id).amount).toBe(8.73)
  })
})

it('preserves the replacement customer identity when an unlinked order changes customer', () => {
  const saved=orders.saveOrderWithItems(request())
  const replacement=queryOne('SELECT * FROM customers WHERE id<>? LIMIT 1',[customer.id])
  const updated={...request(),id:saved.id,order:{...request().order,customerId:replacement.id,receiver:replacement.name,receiverAddress:replacement.address}}
  orders.saveOrderWithItems(updated)
  expect(orders.getOrderById(saved.id).customerId).toBe(replacement.id)
  run('INSERT INTO production_records(store,id,data) VALUES(?,?,?)',['productions',1,JSON.stringify({id:1,orderId:saved.id})])
  expect(()=>orders.saveOrderWithItems(updated)).not.toThrow()
})
it('rolls back the entire Excel import even when its error is returned through the IPC wrapper', () => {
  const workbook=XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet([{'产品编码':'P1','产品名称':'产品一','单位':'箱'},{'产品编码':'P2','产品名称':'产品二','单位':'箱'}]),'商品')
  const input=path.join(dir,'import.xlsx');XLSX.writeFile(workbook,input)
  const productsBefore=queryAll('SELECT * FROM products'), customersBefore=queryAll('SELECT * FROM customers'), pricesBefore=queryAll('SELECT * FROM price_table_items')
  run("CREATE TRIGGER fail_second BEFORE INSERT ON products WHEN NEW.productCode='P2' BEGIN SELECT RAISE(ABORT,'injected second row failure'); END")
  const result=withTransaction(()=>orders.importExcelFromFile(input))
  expect(result.success).toBe(false)
  expect(queryAll('SELECT * FROM products')).toEqual(productsBefore)
  expect(queryAll('SELECT * FROM customers')).toEqual(customersBefore)
  expect(queryAll('SELECT * FROM price_table_items')).toEqual(pricesBefore)
})
