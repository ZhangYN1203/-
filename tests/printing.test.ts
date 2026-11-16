import { describe, expect, it } from 'vitest'
import { defaultTemplate, validateTemplate, paginateMeasurements, validatePrintSettings, buildNativeOptions, validatePrintRequest } from '../electron/print-model'
describe('physical printing model', () => {
  it('defaults to real 240 × 95 mm and refuses dimensions and hidden required fields', () => {
    const t = defaultTemplate()
    expect([t.paperWidthMm, t.paperHeightMm]).toEqual([240, 95])
    expect(() => validateTemplate({
      ...t,
      paperHeightMm: NaN
    })).toThrow()
    expect(() => validateTemplate({
      ...t,
      columns: t.columns.map(c => ({
        ...c,
        visible: false
      }))
    })).toThrow()
    expect(() => validateTemplate({
      ...t,
      marginLeftMm: 200
    })).toThrow()
    expect(() => validateTemplate({
      ...t,
      unknown: 'script'
    })).toThrow()
    expect(t.columns[0].align).toBe('center')
    expect(t.columns[0].wrap).toBe('wrap')
    expect(t.headerGapMm).toBe(0.5)
    expect(() => validateTemplate({
      ...t,
      footerGapMm: Infinity
    })).toThrow()
  })
  it('keeps whole measured rows and reserves the last footer', () => {
    expect(paginateMeasurements([20, 20, 20], 60, 10, 30, 10)).toEqual([[0, 1], [2]])
    expect(paginateMeasurements([45], 60, 10, 30, 10)).toEqual([[0], []])
    expect(() => paginateMeasurements([51], 60, 10, 30, 10)).toThrow(/第 1/)
    expect(() => paginateMeasurements([], 10, 0, 11, 10)).toThrow()
  })
  it('enforces row limit without losing items', () => {
    expect(paginateMeasurements([3, 3, 3], 50, 0, 0, 2)).toEqual([[0, 1], [2]])
  })
  it('validates profiles atomically and bounds documents', () => {
    const t = defaultTemplate()
    expect(validatePrintSettings({
      version: 1,
      activeTemplateId: t.id,
      templates: [t],
      profiles: []
    })).toHaveProperty('version', 1)
    expect(() => validatePrintSettings({
      version: 1,
      activeTemplateId: 'missing',
      templates: [t],
      profiles: []
    })).toThrow()
    expect(() => validatePrintRequest({
      html: '<script>alert(1)</script>',
      css: '',
      paperWidthMm: 240,
      paperHeightMm: 95,
      mode: 'pdf'
    })).toThrow()
    expect(() => validatePrintRequest({
      html: '<div onload="foo()">x</div>',
      css: '',
      paperWidthMm: 240,
      paperHeightMm: 95,
      mode: 'pdf'
    })).toThrow()
  })
  it('uses zero margins and exact units for native print and PDF', () => {
    const request = {
      html: '<div>校样</div>',
      css: '',
      paperWidthMm: 240,
      paperHeightMm: 95,
      mode: 'print' as const,
      printerName: '针式'
    }
    expect(buildNativeOptions(request, 'print')).toMatchObject({
      pageSize: {
        width: 240000,
        height: 95000
      },
      scaleFactor: 100,
      deviceName: '针式',
      margins: {
        marginType: 'none'
      }
    })
    expect(buildNativeOptions(request, 'pdf')).toMatchObject({
      pageSize: {
        width: 240 / 25.4,
        height: 95 / 25.4
      },
      scale: 1,
      preferCSSPageSize: true,
      margins: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    })
  })
})
