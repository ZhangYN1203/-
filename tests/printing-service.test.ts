import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({
  windows: [] as any[],
  printSuccess: true,
  reason: '',
  save: {
    canceled: true,
    filePath: undefined as string | undefined
  },
  pdf: Buffer.from('pdf')
}))
vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents: any
    closed = false;
    constructor(public options: any) {
      fixture.windows.push(this)
      this.webContents = {
        session: {
          webRequest: {
            onBeforeRequest: vi.fn()
          }
        },
        setWindowOpenHandler: vi.fn(),
        on: vi.fn(),
        executeJavaScript: vi.fn().mockResolvedValue(true),
        print: vi.fn((_o: any, cb: any) => cb(fixture.printSuccess, fixture.reason)),
        printToPDF: vi.fn().mockImplementation(() => Promise.resolve(fixture.pdf))
      }
    }
    on() { }
    async loadURL() { }
    isDestroyed() {
      return this.closed
    }
    close() {
      this.closed = true
    }
  },
  dialog: {
    showSaveDialog: vi.fn(async () => fixture.save)
  }
}))
import { printDocument } from '../electron/print-service'
describe('isolated native printing', () => {
  beforeEach(() => {
    fixture.windows.length = 0
    fixture.printSuccess = true
    fixture.reason = ''
    fixture.save = {
      canceled: true,
      filePath: undefined
    }
  })
  const request = {
    html: '<div>订单</div>',
    css: '',
    paperWidthMm: 240,
    paperHeightMm: 95,
    mode: 'print' as const
  }
  it('uses a sandboxed window without preload and closes after success', async () => {
    expect(await printDocument(request)).toEqual({
      success: true
    })
    const w = fixture.windows[0]
    expect(w.options.webPreferences).toMatchObject({
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    })
    expect(w.options.webPreferences.preload).toBeUndefined()
    expect(w.closed).toBe(true)
  })
  it('returns driver cancellation and always closes the window', async () => {
    fixture.printSuccess = false
    fixture.reason = 'cancelled'
    expect(await printDocument(request)).toMatchObject({
      success: false,
      canceled: true
    })
    expect(fixture.windows[0].closed).toBe(true)
  })
  it('keeps actual driver failure separate from cancellation', async () => {
    fixture.printSuccess = false
    fixture.reason = 'Printer offline'
    expect(await printDocument(request)).toMatchObject({
      success: false,
      error: 'Printer offline',
      canceled: false
    })
  })
  it('does not create a print window or write a file when PDF dialog is canceled', async () => {
    expect(await printDocument({
      ...request,
      mode: 'pdf'
    })).toEqual({
      success: false,
      canceled: true
    })
    expect(fixture.windows).toHaveLength(0)
  })
})
