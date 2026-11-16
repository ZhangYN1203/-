import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase, closeDatabase, withTransaction, getDatabaseRecoveryNotice } from './database'
import { printDocument, listPrinters } from './print-service'
import { initProductionStore, getProductionStatus, migrateProductionData, getProductionRecords, getProductionRecord, applyProductionOperations } from './production-store'
import {
  createOrder,
  saveOrderWithItems,
  getOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  getOrderItems,
  createOrderItem,
  updateOrderItem,
  deleteOrderItem,
  generateDocumentNo,
  searchProducts,
  createProduct,
  deleteProduct,
  updateProduct,
  searchCustomers,
  getCustomerByCode,
  getCustomerPrices,
  initCustomerPrices,
  updateCustomerPrice,
  undoLastPriceChangeByCustomer,
  getPriceChangeLogsByCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerById,
  getCustomersByPriceTableId,
  addCustomerProduct,
  removeCustomerProduct,
  searchCustomerPrices,
  importExcelFromFile,
  getPriceTables,
  createPriceTable,
  deletePriceTable,
  renamePriceTable,
  getPriceTableItems,
  updatePriceTableItem,
  addPriceTableProduct,
  removePriceTableProduct,
  undoLastPriceChange,
  getPriceChangeLogs,
  getOrderSummary,
  // ── New handlers ──
  getWorkshops,
  createWorkshop,
  updateWorkshop,
  deleteWorkshop,
  getRawMaterials,
  searchRawMaterials,
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
  generateInboundNo,
  generateOutboundNo,
  generateProductInboundNo,
  createMaterialInbound,
  getMaterialInbounds,
  createMaterialOutbound,
  getMaterialOutbounds,
  createProductInbound,
  getProductInbounds,
  getInventoryLogs,
  getRawMaterialReport,
  getProductReport,
  // ── Print Settings ──
  getPrintSettings,
  setPrintSettings,
} from './handlers'

let mainWindow: BrowserWindow | null = null
// sql.js is an in-memory database: only one process may own this user's file.
const ownsInstance = app.requestSingleInstanceLock()
if (!ownsInstance) app.quit()
else app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: '商品装具调拨单打印工具',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devServer = process.env.VITE_DEV_SERVER_URL || (!app.isPackaged ? 'http://127.0.0.1:5173' : undefined)
  if (devServer) {
    mainWindow.loadURL(devServer)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

}

function registerIpcHandlers() {
  // Order handlers
  ipcMain.handle('db:getOrders', async (_event, filters?: { search?: string }) => {
    return getOrders(filters)
  })

  ipcMain.handle('db:getOrderById', async (_event, id: number) => {
    return getOrderById(id)
  })

  ipcMain.handle('db:createOrder', async (_event, data: any) => {
    return withTransaction(() => createOrder(data))
  })

  ipcMain.handle('db:updateOrder', async (_event, id: number, data: any) => {
    return withTransaction(() => updateOrder(id, data))
  })

  ipcMain.handle('db:deleteOrder', async (_event, id: number) => {
    return withTransaction(() => deleteOrder(id))
  })

  // Order items handlers
  ipcMain.handle('db:getOrderItems', async (_event, orderId: number) => {
    return getOrderItems(orderId)
  })

  ipcMain.handle('db:createOrderItem', async (_event, data: any) => {
    return withTransaction(() => createOrderItem(data))
  })

  ipcMain.handle('db:updateOrderItem', async (_event, id: number, data: any) => {
    return withTransaction(() => updateOrderItem(id, data))
  })

  ipcMain.handle('db:deleteOrderItem', async (_event, id: number) => {
    return withTransaction(() => deleteOrderItem(id))
  })

  // Document number generation
  ipcMain.handle('db:generateDocumentNo', async (_event, date?: string) => {
    return generateDocumentNo(date)
  })

  ipcMain.handle('db:saveOrderWithItems', (_event, request) => saveOrderWithItems(request))
  ipcMain.handle('print:document', (_event, request) => printDocument(request, mainWindow || undefined))
  ipcMain.handle('print:listPrinters', () => mainWindow ? listPrinters(mainWindow) : [])
  ipcMain.handle('print:window', () => { throw new Error('请在订单打印预览页使用打印按钮，以应用当前模板和校准设置。') })
  ipcMain.handle('production:status', () => getProductionStatus())
  ipcMain.handle('production:migrate', (_event, bundle) => migrateProductionData(bundle))
  ipcMain.handle('production:list', (_event, store) => getProductionRecords(store))
  ipcMain.handle('production:get', (_event, store, id) => getProductionRecord(store, id))
  ipcMain.handle('production:apply', (_event, operations) => applyProductionOperations(operations))

  // Products & Customers
  ipcMain.handle('db:searchProducts', async (_event, keyword?: string) => {
    return searchProducts(keyword)
  })

  ipcMain.handle('db:createProduct', async (_event, data: any) => {
    return withTransaction(() => createProduct(data))
  })

  ipcMain.handle('db:deleteProduct', async (_event, id: number) => {
    return withTransaction(() => deleteProduct(id))
  })

  ipcMain.handle('db:updateProduct', async (_event, id: number, data: any) => {
    return withTransaction(() => updateProduct(id, data))
  })

  ipcMain.handle('db:searchCustomers', async (_event, keyword?: string) => {
    return searchCustomers(keyword)
  })

  ipcMain.handle('db:getCustomerByCode', async (_event, code: string) => {
    return getCustomerByCode(code)
  })

  // Customer Prices (legacy aliases for OrderEdit compatibility)
  ipcMain.handle('db:getCustomerPrices', async (_event, customerCode: string) => {
    return getCustomerPrices(customerCode)
  })

  ipcMain.handle('db:initCustomerPrices', async (_event, customerCode: string) => {
    return withTransaction(() => initCustomerPrices(customerCode))
  })

  ipcMain.handle('db:updateCustomerPrice', async (_event, customerCode: string, productCode: string, newPrice: number) => {
    return withTransaction(() => updateCustomerPrice(customerCode, productCode, newPrice))
  })

  ipcMain.handle('db:undoLastPriceChange', async (_event, customerCode: string) => {
    return withTransaction(() => undoLastPriceChangeByCustomer(customerCode))
  })

  ipcMain.handle('db:getPriceChangeLogs', async (_event, customerCode: string) => {
    return getPriceChangeLogsByCustomer(customerCode)
  })

  // Customer Management
  ipcMain.handle('db:createCustomer', async (_event, data: any) => {
    return withTransaction(() => createCustomer(data))
  })

  ipcMain.handle('db:updateCustomer', async (_event, id: number, data: any) => {
    return withTransaction(() => updateCustomer(id, data))
  })

  ipcMain.handle('db:deleteCustomer', async (_event, id: number) => {
    return withTransaction(() => deleteCustomer(id))
  })

  ipcMain.handle('db:getCustomerById', async (_event, id: number) => {
    return getCustomerById(id)
  })

  ipcMain.handle('db:getCustomersByPriceTableId', async (_event, priceTableId: number) => {
    return getCustomersByPriceTableId(priceTableId)
  })

  // Customer Products (legacy aliases)
  ipcMain.handle('db:addCustomerProduct', async (_event, customerCode: string, productCode: string) => {
    return withTransaction(() => addCustomerProduct(customerCode, productCode))
  })

  ipcMain.handle('db:removeCustomerProduct', async (_event, customerCode: string, productCode: string) => {
    return withTransaction(() => removeCustomerProduct(customerCode, productCode))
  })

  ipcMain.handle('db:searchCustomerPrices', async (_event, customerCode: string, keyword?: string) => {
    return searchCustomerPrices(customerCode, keyword)
  })

  // Price Tables
  ipcMain.handle('db:getPriceTables', async () => {
    return getPriceTables()
  })

  ipcMain.handle('db:createPriceTable', async (_event, name: string) => {
    return withTransaction(() => createPriceTable(name))
  })

  ipcMain.handle('db:deletePriceTable', async (_event, id: number) => {
    return withTransaction(() => deletePriceTable(id))
  })

  ipcMain.handle('db:renamePriceTable', async (_event, id: number, name: string) => {
    return renamePriceTable(id, name)
  })

  ipcMain.handle('db:getPriceTableItems', async (_event, priceTableId: number) => {
    return getPriceTableItems(priceTableId)
  })

  ipcMain.handle('db:updatePriceTableItem', async (_event, priceTableId: number, productCode: string, newPrice: number) => {
    return withTransaction(() => updatePriceTableItem(priceTableId, productCode, newPrice))
  })

  ipcMain.handle('db:addPriceTableProduct', async (_event, priceTableId: number, productCode: string) => {
    return withTransaction(() => addPriceTableProduct(priceTableId, productCode))
  })

  ipcMain.handle('db:removePriceTableProduct', async (_event, priceTableId: number, productCode: string) => {
    return withTransaction(() => removePriceTableProduct(priceTableId, productCode))
  })

  ipcMain.handle('db:undoPriceTableChange', async (_event, priceTableId: number) => {
    return withTransaction(() => undoLastPriceChange(priceTableId))
  })

  ipcMain.handle('db:getPriceTableLogs', async (_event, priceTableId: number) => {
    return getPriceChangeLogs(priceTableId)
  })

  // Import Excel
  ipcMain.handle('db:importExcelData', async () => {
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: '已取消选择文件' }
    }
    return withTransaction(() => importExcelFromFile(result.filePaths[0]))
  })

  // Order Summary
  ipcMain.handle('db:getOrderSummary', async (_event, dateFrom: string, dateTo: string) => {
    return getOrderSummary(dateFrom, dateTo)
  })

  // Save file dialog
  ipcMain.handle('dialog:saveFile', async (_event, options: { defaultName: string; buffer: number[] }) => {
    const { dialog } = require('electron')
    const result = await dialog.showSaveDialog({
      defaultPath: options.defaultName,
      filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
    })
    if (result.canceled || !result.filePath) return false
    fs.writeFileSync(result.filePath, Buffer.from(options.buffer))
    return true
  })

  // ── Workshop handlers ──
  ipcMain.handle('db:getWorkshops', async () => getWorkshops())
  ipcMain.handle('db:createWorkshop', async (_event, data: any) => createWorkshop(data))
  ipcMain.handle('db:updateWorkshop', async (_event, id: number, data: any) => updateWorkshop(id, data))
  ipcMain.handle('db:deleteWorkshop', async (_event, id: number) => deleteWorkshop(id))

  // ── Raw Material handlers ──
  ipcMain.handle('db:getRawMaterials', async () => getRawMaterials())
  ipcMain.handle('db:searchRawMaterials', async (_event, keyword?: string) => searchRawMaterials(keyword))
  ipcMain.handle('db:createRawMaterial', async (_event, data: any) => createRawMaterial(data))
  ipcMain.handle('db:updateRawMaterial', async (_event, id: number, data: any) => updateRawMaterial(id, data))
  ipcMain.handle('db:deleteRawMaterial', async (_event, id: number) => deleteRawMaterial(id))

  // ── Material Inbound handlers ──
  ipcMain.handle('db:generateInboundNo', async (_event, date?: string) => generateInboundNo(date))
  ipcMain.handle('db:createMaterialInbound', async (_event, data: any) => createMaterialInbound(data))
  ipcMain.handle('db:getMaterialInbounds', async (_event, filters?: any) => getMaterialInbounds(filters))

  // ── Material Outbound handlers ──
  ipcMain.handle('db:generateOutboundNo', async (_event, date?: string) => generateOutboundNo(date))
  ipcMain.handle('db:createMaterialOutbound', async (_event, data: any) => createMaterialOutbound(data))
  ipcMain.handle('db:getMaterialOutbounds', async (_event, filters?: any) => getMaterialOutbounds(filters))

  // ── Product Inbound handlers ──
  ipcMain.handle('db:generateProductInboundNo', async (_event, date?: string) => generateProductInboundNo(date))
  ipcMain.handle('db:createProductInbound', async (_event, data: any) => createProductInbound(data))
  ipcMain.handle('db:getProductInbounds', async (_event, filters?: any) => getProductInbounds(filters))

  // ── Inventory Log handlers ──
  ipcMain.handle('db:getInventoryLogs', async (_event, filters?: any) => getInventoryLogs(filters))

  // ── Warehouse Report handlers ──
  ipcMain.handle('db:getRawMaterialReport', async (_event, dateFrom: string, dateTo: string) => getRawMaterialReport(dateFrom, dateTo))
  ipcMain.handle('db:getProductReport', async (_event, dateFrom: string, dateTo: string) => getProductReport(dateFrom, dateTo))

  // ── Settings handlers ──
  ipcMain.handle('settings:get', async () => getPrintSettings())
  ipcMain.handle('settings:set', async (_event, data: Record<string, string | number>) => setPrintSettings(data))
}

if (ownsInstance) app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'orders.db')
  await initDatabase(dbPath)
  initProductionStore()
  registerIpcHandlers()
  createWindow()
  const recovery = getDatabaseRecoveryNotice()
  if (recovery && mainWindow) await dialog.showMessageBox(mainWindow, { type: 'warning', title: '数据库备份恢复', message: recovery })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
}).catch(error => {
  dialog.showErrorBox('软件启动失败', error instanceof Error ? error.message : String(error))
  app.quit()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => closeDatabase())
