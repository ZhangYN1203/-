// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import OrderPrint from '../src/pages/OrderPrint'
import { defaultTemplate } from '../electron/print-model'
const order = {
  id: 1,
  documentNo: 'TEST1',
  sender: '甲',
  receiver: '乙',
  date: '2026-11-16',
  items: [{
    id: 1,
    productName: '测试商品',
    quantity: 2,
    price: 3,
    amount: 6
  }]
}
const printDocument = vi.fn().mockResolvedValue({
  success: true
})
vi.mock('../src/utils/ipc', () => ({
  fetchOrderById: vi.fn(async () => order)
}))
beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      ready: Promise.resolve()
    }
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    height: 12,
    width: 200,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 12,
    right: 200,
    toJSON() { }
  }))
  window.electronAPI = {
    getPrintSettings: vi.fn().mockResolvedValue({}),
    setPrintSettings: vi.fn().mockResolvedValue({
      success: true
    }),
    listPrinters: vi.fn().mockResolvedValue([{
      name: '针式机'
    }]),
    printDocument
  } as any
})
function mount() {
  return render(<MemoryRouter future={{
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }} initialEntries={['/orders/1/print']}><Routes><Route path="/orders/:id/print" element={<OrderPrint />} /></Routes></MemoryRouter>)
}
describe('in-app print calibration', () => {
  it('keeps preview zoom out of physical output and routes printing through native IPC', async () => {
    mount()
    await screen.findByText('打印设置与校准')
    await waitFor(() => expect((screen.getByRole('button', {
      name: '打印 (Ctrl+P)'
    }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.change(screen.getByLabelText('预览缩放'), {
      target: {
        value: '70'
      }
    })
    fireEvent.click(screen.getByRole('button', {
      name: '打印 (Ctrl+P)'
    }))
    await waitFor(() => expect(printDocument).toHaveBeenCalledOnce())
    expect(printDocument.mock.calls[0][0]).toMatchObject({
      paperWidthMm: 240,
      paperHeightMm: 95,
      mode: 'print'
    })
    expect(printDocument.mock.calls[0][0].html).not.toContain('scale(0.7)')
  })
  it('blocks printing immediately after an invalid physical width change', async () => {
    mount()
    await screen.findByText('打印设置与校准')
    fireEvent.change(screen.getByLabelText('纸宽 mm'), {
      target: {
        value: '50'
      }
    })
    await screen.findByText(/列总宽超过/)
    expect((screen.getByRole('button', {
      name: '打印 (Ctrl+P)'
    }) as HTMLButtonElement).disabled).toBe(true)
    expect(printDocument).not.toHaveBeenCalled()
  })
  it('restores the default printer calibration on reopening without replacing template typography', async () => {
    const t = defaultTemplate()
    const settings = {
      version: 1,
      activeTemplateId: t.id,
      templates: [t],
      profiles: [{
        name: '仓库针打',
        printerName: '针式机',
        templateId: t.id,
        paperWidthMm: 240,
        paperHeightMm: 100,
        template: {
          ...t,
          paperHeightMm: 100,
          offsetXMm: 2,
          fontSizePt: 29
        }
      }]
    }
    vi.mocked(window.electronAPI.getPrintSettings).mockResolvedValue({
      printProfilesV1: JSON.stringify(settings)
    })
    vi.mocked((window.electronAPI as any).listPrinters).mockResolvedValue([{
      name: '针式机',
      isDefault: true
    }])
    mount()
    await screen.findByText('打印设置与校准')
    await waitFor(() => expect((screen.getByLabelText('纸高 mm') as HTMLInputElement).value).toBe('100'))
    expect((screen.getByLabelText('字号 pt') as HTMLInputElement).value).toBe('10')
    expect((screen.getByLabelText('横向偏移 mm') as HTMLInputElement).value).toBe('2')
  })
})
