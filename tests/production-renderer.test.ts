import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'
const script = fs.readFileSync(path.resolve('public/new-modules.js'), 'utf8')
let dom: JSDOM
const tick = () => new Promise(resolve => setTimeout(resolve, 20))
async function mount(overrides: Record<string, any> = {}) {
  dom = new JSDOM('<div id="root"></div>', { runScripts: 'outside-only', url: 'http://localhost/' })
  const api = {
    getProductionStatus: vi.fn(async () => ({ migrated: true })),
    getProductionRecords: vi.fn(async (store: string) => store === 'materials' ? [{ id: 1, name: '原料', quantity: 10 }] : []),
    applyProductionOperations: vi.fn(async () => ({ results: [1, 1, 1] })),
    getOrders: vi.fn(async () => [{ id: 5, documentNo: 'SQL-ORDER', receiver: '客户' }]),
    getOrderById: vi.fn(async () => ({ id: 5, documentNo: 'SQL-ORDER' })),
    ...overrides,
  }
  if (overrides.indexedDB) (dom.window as any).indexedDB = overrides.indexedDB
  ;(dom.window as any).electronAPI = api
  dom.window.eval(script)
  await tick()
  return { api, module: (dom.window as any).__newModule, document: dom.window.document }
}
afterEach(() => dom?.window.close())
describe('production renderer IPC integration', () => {
  it('loads the migrated SQLite records without opening IndexedDB', async () => {
    const { api, document } = await mount()
    expect(api.getProductionStatus).toHaveBeenCalled()
    expect(document.getElementById('new-modules-content')?.textContent).toContain('原料')
  })
  it('reads all legacy stores in one snapshot and retains the original IndexedDB', async () => {
    const legacy: Record<string, any[]> = { materials: [{ id: 7, name: '旧原料', quantity: 3 }] }
    const transactions: string[][] = []
    const closed = vi.fn()
    const indexedDB = { open: vi.fn(() => {
      const request: any = {}
      queueMicrotask(() => request.onsuccess({ target: { result: {
        close: closed,
        transaction: (stores: string[], mode: string) => {
          transactions.push(stores)
          expect(mode).toBe('readonly')
          const tx: any = { objectStore: (store: string) => ({ getAll: () => {
            const read: any = { result: legacy[store] || [] }
            queueMicrotask(() => read.onsuccess())
            return read
          } }) }
          setTimeout(() => tx.oncomplete(), 0)
          return tx
        },
      } } }))
      return request
    }) }
    const migrate = vi.fn(async (data: any) => {
      expect(Object.keys(data.stores)).toHaveLength(10)
      expect(data.stores.materials).toEqual(legacy.materials)
      return { migrated: true }
    })
    await mount({ indexedDB, getProductionStatus: vi.fn(async () => ({ migrated: false })), migrateProductionData: migrate })
    expect(migrate).toHaveBeenCalledTimes(1)
    expect(transactions).toHaveLength(1)
    expect(transactions[0]).toHaveLength(10)
    expect(legacy.materials[0].quantity).toBe(3)
    expect(closed).toHaveBeenCalled()
  })
  it('commits material inbound, stock and log in one IPC batch', async () => {
    const { api, module, document } = await mount()
    module.showInboundDialog(1)
    ;(document.getElementById('inbound-qty') as HTMLInputElement).value = '2'
    module.confirmInbound()
    await tick()
    expect(api.applyProductionOperations).toHaveBeenCalledTimes(1)
    const operations = api.applyProductionOperations.mock.calls[0][0]
    expect(operations.map((op: any) => op.store)).toEqual(['materials', 'material_inbound', 'stock_logs'])
    expect(operations[0]).toMatchObject({ expectedQuantity: 10, data: { quantity: 12 } })
  })
  it('creates new tasks from real SQLite order choices', async () => {
    const { api, module, document } = await mount()
    module.showCreateProductionDialog()
    await tick()
    expect(api.getOrders).toHaveBeenCalled()
    const select = document.getElementById('prod-order-id') as HTMLSelectElement
    expect(select).not.toBeNull()
    select.value = '5'
    ;(document.getElementById('prod-manager') as HTMLInputElement).value = '负责人'
    module.confirmCreateProduction()
    await tick()
    expect(api.applyProductionOperations.mock.calls[0][0][0].data.orderId).toBe(5)
  })
  it('displays unmatched legacy tasks as unlinked and escapes imported status text', async () => {
    const { module, document } = await mount({ getProductionRecords: vi.fn(async (store: string) => store === 'productions' ? [
      { id: 1, order_no: '历史手填单', orderId: null, status: '<img src=x>', manager: '旧负责人' },
    ] : []) })
    module.navigateTo('productions')
    const content = document.getElementById('new-modules-content')!
    expect(content.textContent).toContain('未关联历史任务')
    expect(content.querySelector('img') === null).toBe(true)
  })
  it('shows migration errors and retries without rendering an empty production store', async () => {
    const status = vi.fn().mockRejectedValueOnce(new Error('备份失败')).mockResolvedValue({ migrated: true })
    const { api, module, document } = await mount({ getProductionStatus: status })
    expect(document.getElementById('new-modules-content')?.textContent).toContain('备份失败')
    expect(api.getProductionRecords).not.toHaveBeenCalled()
    module.navigateTo('productions')
    expect(document.getElementById('new-modules-content')?.textContent).toContain('备份失败')
    module.navigateTo('materials')
    module.retryStorage()
    await tick()
    expect(document.getElementById('new-modules-content')?.textContent).toContain('原料')
  })
})

it('ignores a rapid second warehouse confirmation instead of adding stock twice',async()=>{
  const finished:any[]=[]
  const task={id:1,orderId:5,order_id:5,order_no:'SQL-ORDER',status:'completed'}
  const {module,document}=await mount({
    getProductionRecords:async(store:string)=>store==='productions'?[task]:store==='finished_products'?structuredClone(finished):[],
    applyProductionOperations:async(ops:any[])=>{
      for(const op of ops) if(op.store==='finished_products'&&op.type==='add') finished.push({...op.data,id:finished.length+1})
      return{results:[1,1,1,1]}
    },
  })
  module.showWarehouseDialog(1)
  ;(document.getElementById('fp-name') as HTMLInputElement).value='成品'
  ;(document.getElementById('fp-qty') as HTMLInputElement).value='5'
  module.confirmWarehouse(1);module.confirmWarehouse(1)
  await tick()
  expect(finished.reduce((sum,row)=>sum+row.quantity,0)).toBe(5)
})
