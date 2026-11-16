import { describe, it, expect } from 'vitest'
import { defaultTemplate } from '../electron/print-model'
import { renderDocument, renderCalibration, loadSettings } from '../src/printing/document'
const order = {
  documentNo: 'X001',
  sender: '<script>bad()</script>',
  receiverAddress: '长地址'.repeat(50),
  items: [{
    productName: '超长商品',
    quantity: 3,
    amount: 6,
    price: 2
  }]
} as any
describe('shared physical document', () => {
  it('escapes business fields and keeps all dimensions in mm', () => {
    const html = renderDocument(order, defaultTemplate(), [[0]])
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('width:240mm')
    expect(html).toContain('height:95mm')
    expect(html).toContain('本页小计')
    expect(html).toContain('总计')
  })
  it('renders visible columns in configured order, including totals without fixed colspans', () => {
    const t = defaultTemplate()
    t.columns.reverse()
    t.columns.find(c => c.key === 'price')!.visible = false
    const html = renderDocument(order, t, [[0]])
    expect(html).not.toContain('data-column="price"')
    expect(html.indexOf('签收意见')).toBeLessThan(html.indexOf('序号'))
  })
  it('creates a numbered three page feed trial with a real 100 mm ruler', () => {
    const html = renderCalibration(defaultTemplate(), 3)
    expect(html.match(/class="print-sheet/g)).toHaveLength(3)
    expect(html).toContain('width:100mm')
    expect(html).toContain('3 / 3')
  })
  it('migrates the previous page height without modifying the original input', () => {
    const old = {
      printPageHeight: '105'
    }
    expect(loadSettings(old).templates[0].paperHeightMm).toBe(105)
    expect(old).toEqual({
      printPageHeight: '105'
    })
    expect(() => loadSettings({
      printProfilesV1: '{}'
    })).toThrow()
  })
})
describe('printer-specific calibration', () => {
  it('overrides only device dimensions and offsets while retaining template content', async () => {
    const {
      applyDeviceCalibration
    } = await import('../src/printing/document')
    const base = defaultTemplate(),
      profile = {
        ...defaultTemplate(),
        fontSizePt: 29,
        offsetXMm: 2,
        paperHeightMm: 100
      }
    const result = applyDeviceCalibration(base, profile)
    expect(result.offsetXMm).toBe(2)
    expect(result.paperHeightMm).toBe(100)
    expect(result.fontSizePt).toBe(base.fontSizePt)
  })
})

it('keeps the dynamic document number on preprinted stationery while hiding the static heading',()=>{
  const template=defaultTemplate();template.mode='preprinted'
  const html=renderDocument(order,template,[[0]])
  expect(html).toContain('X001')
  expect(html).not.toContain('<h1>')
})
