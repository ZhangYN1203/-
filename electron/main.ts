import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase } from './database'
import {
  createOrder,
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

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Inject print settings UI (页面高度滑杆)
  function injectPrintSettings() {
    mainWindow!.webContents.executeJavaScript(`if(!window.__pd){(function(){window.__pd={};var o=new MutationObserver(function(){if(!window.location.pathname.match(/\\/orders\\/\\d+\\/print/))return;var t=document.querySelector('.no-print.toolbar');if(!t||document.querySelector('.print-height-control'))return;(async function(){var s={};try{s=await window.electronAPI.getPrintSettings()}catch(e){}var h=parseInt(s.printPageHeight||'95',10);document.documentElement.style.setProperty('--page-height',h+'mm');var g=document.createElement('span');g.className='print-height-control';g.style.cssText='display:inline-flex;align-items:center;gap:8px;margin-left:auto;font-size:13px;';var l=document.createElement('span');l.textContent='页面高度:';l.style.cssText='color:#666;white-space:nowrap;';var s2=document.createElement('input');s2.type='range';s2.min='70';s2.max='150';s2.step='1';s2.value=h;s2.style.cssText='width:100px;height:20px;margin:0;cursor:pointer;';var d=document.createElement('span');d.textContent=h+'mm';d.style.cssText='color:#333;font-weight:600;min-width:45px;text-align:right;';var db=null;s2.addEventListener('input',function(){var v=parseInt(this.value,10);d.textContent=v+'mm';document.documentElement.style.setProperty('--page-height',v+'mm');if(db)clearTimeout(db);db=setTimeout(function(){try{window.electronAPI.setPrintSettings({printPageHeight:String(v)})}catch(e){}},300)});g.appendChild(l);g.appendChild(s2);g.appendChild(d);t.appendChild(g)})()});o.observe(document.body,{childList:true,subtree:true})})()}`).catch(function() {})
  }
  mainWindow.webContents.on('did-finish-load', function() { injectPrintSettings() })
  mainWindow.webContents.on('did-navigate-in-page', function() { injectPrintSettings() })
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
    return createOrder(data)
  })

  ipcMain.handle('db:updateOrder', async (_event, id: number, data: any) => {
    return updateOrder(id, data)
  })

  ipcMain.handle('db:deleteOrder', async (_event, id: number) => {
    return deleteOrder(id)
  })

  // Order items handlers
  ipcMain.handle('db:getOrderItems', async (_event, orderId: number) => {
    return getOrderItems(orderId)
  })

  ipcMain.handle('db:createOrderItem', async (_event, data: any) => {
    return createOrderItem(data)
  })

  ipcMain.handle('db:updateOrderItem', async (_event, id: number, data: any) => {
    return updateOrderItem(id, data)
  })

  ipcMain.handle('db:deleteOrderItem', async (_event, id: number) => {
    return deleteOrderItem(id)
  })

  // Document number generation
  ipcMain.handle('db:generateDocumentNo', async (_event, date?: string) => {
    return generateDocumentNo(date)
  })

  // Print handler
  ipcMain.handle('print:window', async (_event, _data?: any) => {
    if (mainWindow) {
      const settings = getPrintSettings()
      const heightMm = parseInt(settings.printPageHeight || '95', 10)
      const height = Math.round(heightMm * 1000)
      mainWindow.webContents.print({
        landscape: false,
        pageSize: { width: 240000, height },
        margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
        printBackground: true,
        silent: false,
      })
    }
  })

  // Products & Customers
  ipcMain.handle('db:searchProducts', async (_event, keyword?: string) => {
    return searchProducts(keyword)
  })

  ipcMain.handle('db:createProduct', async (_event, data: any) => {
    return createProduct(data)
  })

  ipcMain.handle('db:deleteProduct', async (_event, id: number) => {
    return deleteProduct(id)
  })

  ipcMain.handle('db:updateProduct', async (_event, id: number, data: any) => {
    return updateProduct(id, data)
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
    return initCustomerPrices(customerCode)
  })

  ipcMain.handle('db:updateCustomerPrice', async (_event, customerCode: string, productCode: string, newPrice: number) => {
    return updateCustomerPrice(customerCode, productCode, newPrice)
  })

  ipcMain.handle('db:undoLastPriceChange', async (_event, customerCode: string) => {
    return undoLastPriceChangeByCustomer(customerCode)
  })

  ipcMain.handle('db:getPriceChangeLogs', async (_event, customerCode: string) => {
    return getPriceChangeLogsByCustomer(customerCode)
  })

  // Customer Management
  ipcMain.handle('db:createCustomer', async (_event, data: any) => {
    return createCustomer(data)
  })

  ipcMain.handle('db:updateCustomer', async (_event, id: number, data: any) => {
    return updateCustomer(id, data)
  })

  ipcMain.handle('db:deleteCustomer', async (_event, id: number) => {
    return deleteCustomer(id)
  })

  ipcMain.handle('db:getCustomerById', async (_event, id: number) => {
    return getCustomerById(id)
  })

  ipcMain.handle('db:getCustomersByPriceTableId', async (_event, priceTableId: number) => {
    return getCustomersByPriceTableId(priceTableId)
  })

  // Customer Products (legacy aliases)
  ipcMain.handle('db:addCustomerProduct', async (_event, customerCode: string, productCode: string) => {
    return addCustomerProduct(customerCode, productCode)
  })

  ipcMain.handle('db:removeCustomerProduct', async (_event, customerCode: string, productCode: string) => {
    return removeCustomerProduct(customerCode, productCode)
  })

  ipcMain.handle('db:searchCustomerPrices', async (_event, customerCode: string, keyword?: string) => {
    return searchCustomerPrices(customerCode, keyword)
  })

  // Price Tables
  ipcMain.handle('db:getPriceTables', async () => {
    return getPriceTables()
  })

  ipcMain.handle('db:createPriceTable', async (_event, name: string) => {
    return createPriceTable(name)
  })

  ipcMain.handle('db:deletePriceTable', async (_event, id: number) => {
    return deletePriceTable(id)
  })

  ipcMain.handle('db:renamePriceTable', async (_event, id: number, name: string) => {
    return renamePriceTable(id, name)
  })

  ipcMain.handle('db:getPriceTableItems', async (_event, priceTableId: number) => {
    return getPriceTableItems(priceTableId)
  })

  ipcMain.handle('db:updatePriceTableItem', async (_event, priceTableId: number, productCode: string, newPrice: number) => {
    return updatePriceTableItem(priceTableId, productCode, newPrice)
  })

  ipcMain.handle('db:addPriceTableProduct', async (_event, priceTableId: number, productCode: string) => {
    return addPriceTableProduct(priceTableId, productCode)
  })

  ipcMain.handle('db:removePriceTableProduct', async (_event, priceTableId: number, productCode: string) => {
    return removePriceTableProduct(priceTableId, productCode)
  })

  ipcMain.handle('db:undoPriceTableChange', async (_event, priceTableId: number) => {
    return undoLastPriceChange(priceTableId)
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
    return importExcelFromFile(result.filePaths[0])
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

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'orders.db')
  await initDatabase(dbPath)
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})