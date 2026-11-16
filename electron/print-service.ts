import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { buildNativeOptions, validatePrintRequest, type PrintDocumentRequest, type PrintDocumentResult, type PrinterInfo } from './print-model'
export async function listPrinters(window: BrowserWindow): Promise<PrinterInfo[]> {
  return (await window.webContents.getPrintersAsync()).map(({
    name,
    displayName,
    isDefault
  }) => ({
    name,
    displayName,
    isDefault
  }))
}

/** Dedicated, unprivileged document window. No application preload or external resources. */
export async function printDocument(input: PrintDocumentRequest, parent?: BrowserWindow): Promise<PrintDocumentResult> {
  let window: BrowserWindow | undefined
  try {
    const request = validatePrintRequest(input)
    let filePath: string | undefined
    if (request.mode === 'pdf') {
      const options = {
        title: '导出打印校样 PDF',
        defaultPath: (request.defaultName || '订单校样').replace(/[<>:"/\\|?*]/g, '_').replace(/\.pdf$/i, '') + '.pdf',
        filters: [{
          name: 'PDF',
          extensions: ['pdf']
        }]
      }
      const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return {
        success: false,
        canceled: true
      }
      filePath = result.filePath
    }
    window = new BrowserWindow({
      show: false,
      width: 1100,
      height: 700,
      ...(parent ? {
        parent
      } : {}),
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        partition: `print-${Date.now()}-${Math.random()}`
      }
    })
    const contents = window.webContents
    contents.setWindowOpenHandler(() => ({
      action: 'deny'
    }))
    contents.on('will-navigate', event => event.preventDefault())
    contents.session.webRequest.onBeforeRequest((details, callback) => callback({
      cancel: !details.url.startsWith('data:text/html')
    }))
    const csp = "default-src 'none'; style-src 'unsafe-inline'; font-src 'none'; img-src 'none'; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'"
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${request.css}\n@page{size:${request.paperWidthMm}mm ${request.paperHeightMm}mm;margin:0}html,body{padding:0;margin:0;background:white}.print-sheet{box-shadow:none!important;margin:0!important}</style></head><body>${request.html}</body></html>`
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    // Font metrics are finalized before handing the very same DOM to either output backend.
    const fits = await contents.executeJavaScript(`
      (async () => {
        await document.fonts.ready
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        return Array.from(document.querySelectorAll('.print-sheet')).every(sheet => {
          const body = sheet.querySelector('.sheet-body')
          if (!body) return true
          const paperBounds = sheet.getBoundingClientRect()
          const bodyBounds = body.getBoundingClientRect()
          const descendants = Array.from(body.querySelectorAll(
            'table,tr,td,th,.document-header,.document-info>div,.summary,.document-signatures,.document-remark'
          ))
          const withinPaper = bounds =>
            bounds.bottom <= paperBounds.bottom + 0.5 &&
            bounds.right <= paperBounds.right + 0.5 &&
            bounds.left >= paperBounds.left - 0.5 &&
            bounds.top >= paperBounds.top - 0.5
          return withinPaper(bodyBounds) && descendants.every(element =>
            withinPaper(element.getBoundingClientRect()) &&
            element.scrollWidth <= element.clientWidth + 1
          )
        })
      })()
    `)
    if (!fits) throw new Error('打印窗口测得内容超出纸张，请调整模板后重试')
    if (request.mode === 'pdf') {
      const pdf = await contents.printToPDF(buildNativeOptions(request, 'pdf') as Electron.PrintToPDFOptions)
      await writeFile(filePath!, pdf)
      return {
        success: true,
        filePath
      }
    }
    return await new Promise<PrintDocumentResult>(resolve => {
      let settled = false
      const finish = (result: PrintDocumentResult) => {
        if (!settled) {
          settled = true
          resolve(result)
        }
      }
      window!.on('closed', () => finish({
        success: false,
        canceled: true
      }))
      contents.print(buildNativeOptions(request, 'print') as Electron.WebContentsPrintOptions, (success, reason) => finish(success ? {
        success: true
      } : {
        success: false,
        canceled: /cancel/i.test(reason || ''),
        error: reason || '打印机未完成打印'
      }))
    })
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  } finally {
    if (window && !window.isDestroyed()) window.close()
  }
}
