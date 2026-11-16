// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { defaultTemplate } from '../electron/print-model'
import { measurePages, renderMeasurement } from '../src/printing/document'
function fixture(extraGapPx = 0, scale = 1) {
  const t = {
    ...defaultTemplate(),
    actualScale: scale
  }
  const order = {
    items: [{
      productName: 'A',
      quantity: 1
    }, {
      productName: 'B',
      quantity: 1
    }]
  } as any
  const root = document.createElement('div')
  root.innerHTML = renderMeasurement(order, t)
  const sizes: Record<string, number> = {
    '.document-header': 40 + extraGapPx,
    'thead': 10,
    '.page-subtotal': 20 + extraGapPx,
    '.document-page-number': 10,
    '.last-footer': 50 + extraGapPx
  }
  for (const [selector, h] of Object.entries(sizes)) root.querySelector(selector)!.getBoundingClientRect = () => ({
    height: h * scale
  }) as DOMRect
  root.querySelectorAll('[data-row]').forEach(row => {
    row.getBoundingClientRect = () => ({
      height: 100 * scale
    }) as DOMRect
  })
  return {
    root,
    t,
    order
  }
}
describe('physical DOM measurements', () => {
  it('accounts for measured header, subtotal and last footer padding', () => {
    const a = fixture()
    expect(measurePages(a.root, a.order, a.t)).toEqual([[0, 1]])
    const b = fixture(30)
    expect(measurePages(b.root, b.order, b.t)).toEqual([[0], [1]])
  })
  it('consumes scaled measurements once against unscaled physical paper', () => {
    const a = fixture(0, 0.5)
    expect(measurePages(a.root, a.order, a.t)).toEqual([[0, 1]])
  })
  it('refuses nowrap content that exceeds its physical column', () => {
    const a = fixture()
    const td = a.root.querySelector('td')!
    Object.defineProperty(td, 'scrollWidth', {
      value: 120
    })
    Object.defineProperty(td, 'clientWidth', {
      value: 50
    })
    expect(() => measurePages(a.root, a.order, a.t)).toThrow(/超出列宽/)
  })
  it('refuses a signature or remark that overflows horizontally', () => {
    const a = fixture()
    const footer = a.root.querySelector('.document-signatures')!
    Object.defineProperty(footer, 'scrollWidth', {
      value: 1200
    })
    Object.defineProperty(footer, 'clientWidth', {
      value: 200
    })
    expect(() => measurePages(a.root, a.order, a.t)).toThrow(/超出/)
  })
})
