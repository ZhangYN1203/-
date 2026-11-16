/** Pure, versioned print contract shared by the renderer and Electron. All distances are mm. */
export const columnLabels = {
  sequence: '序号',
  name: '商品名称',
  specification: '规格',
  packageSpec: '整箱规格',
  quantity: '数量',
  price: '单价',
  amount: '金额',
  signature: '签收意见'
} as const
export type ColumnKey = keyof typeof columnLabels
export interface PrintColumn {
  key: ColumnKey
  widthMm: number
  visible: boolean
  align: 'left' | 'center' | 'right'
  wrap: 'wrap' | 'nowrap'
}
export interface PrintTemplate {
  version: 1
  id: string
  name: string
  paperWidthMm: number
  paperHeightMm: number
  marginTopMm: number
  marginRightMm: number
  marginBottomMm: number
  marginLeftMm: number
  offsetXMm: number
  offsetYMm: number
  actualScale: number
  fontFamily: string
  fontSizePt: number
  titleSizePt: number
  cellPaddingMm: number
  headerGapMm: number
  tableGapMm: number
  footerGapMm: number
  lineHeight: number
  maxRows: number
  title: string
  mode: 'blank' | 'preprinted'
  showHeader: boolean
  showBorders: boolean
  showCodes: boolean
  showUnits: boolean
  showSignatures: boolean
  showRemark: boolean
  showPageNumbers: boolean
  showSubtotal: boolean
  showTotal: boolean
  columns: PrintColumn[]
}
export interface PrinterInfo {
  name: string
  displayName?: string
  isDefault?: boolean
}
export interface PrinterProfile {
  name: string
  printerName: string
  templateId: string
  paperWidthMm: number
  paperHeightMm: number
  template: PrintTemplate
}
export interface PrintSettings {
  version: 1
  activeTemplateId: string
  templates: PrintTemplate[]
  profiles: PrinterProfile[]
}
export interface PrintDocumentRequest {
  html: string
  css: string
  paperWidthMm: number
  paperHeightMm: number
  printerName?: string
  mode: 'print' | 'pdf'
  defaultName?: string
}
export interface PrintDocumentResult {
  success: boolean
  canceled?: boolean
  error?: string
  filePath?: string
}
export function defaultTemplate(): PrintTemplate {
  return {
    version: 1,
    id: 'continuous-240-95',
    name: '连续纸 240×95',
    paperWidthMm: 240,
    paperHeightMm: 95,
    marginTopMm: 3,
    marginRightMm: 5,
    marginBottomMm: 3,
    marginLeftMm: 5,
    offsetXMm: 0,
    offsetYMm: 0,
    actualScale: 1,
    fontFamily: 'SimSun',
    fontSizePt: 10,
    titleSizePt: 14,
    cellPaddingMm: 0.5,
    headerGapMm: 0.5,
    tableGapMm: 0.5,
    footerGapMm: 0.5,
    lineHeight: 1.25,
    maxRows: 10,
    title: '商品装具调拨单',
    mode: 'blank',
    showHeader: true,
    showBorders: true,
    showCodes: true,
    showUnits: true,
    showSignatures: true,
    showRemark: true,
    showPageNumbers: true,
    showSubtotal: true,
    showTotal: true,
    columns: ([['sequence', 10], ['name', 52], ['specification', 28], ['packageSpec', 25], ['quantity', 20], ['price', 25], ['amount', 28], ['signature', 32]] as [ColumnKey, number][]).map(([key, widthMm]) => ({
      key,
      widthMm,
      visible: true,
      align: key === 'name' ? 'left' : 'center',
      wrap: 'wrap'
    }))
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('设置必须为对象')
  return value as Record<string, unknown>
}
function exactKeys(v: Record<string, unknown>, keys: string[]) {
  if (Object.keys(v).some(k => !keys.includes(k))) throw new Error('设置含未知字段')
}
function numeric(v: unknown, min: number, max: number, label: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${label}须为 ${min}–${max} 范围的有限数字`)
  return v
}
function string(v: unknown, max: number, label: string): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`${label}无效`)
  return v
}
export function validateTemplate(value: unknown): PrintTemplate {
  const t = object(value),
    base = defaultTemplate()
  exactKeys(t, Object.keys(base))
  if (t.version !== 1) throw new Error('不支持的模板版本')
  string(t.id, 100, '模板编号')
  string(t.name, 100, '模板名称')
  string(t.title, 200, '标题')
  if (typeof t.fontFamily !== 'string' || !/^[\w\s\u3400-\u9fff-]{1,80}$/.test(t.fontFamily)) throw new Error('字体名称无效')
  numeric(t.paperWidthMm, 50, 500, '纸宽')
  numeric(t.paperHeightMm, 30, 1000, '纸高')
  for (const k of ['marginTopMm', 'marginRightMm', 'marginBottomMm', 'marginLeftMm']) numeric(t[k], 0, 100, k)
  numeric(t.offsetXMm, -100, 100, '横向偏移')
  numeric(t.offsetYMm, -100, 100, '纵向偏移')
  numeric(t.actualScale, 0.5, 1.5, '实际比例')
  for (const k of ['headerGapMm', 'tableGapMm', 'footerGapMm']) numeric(t[k], 0, 20, k)
  numeric(t.fontSizePt, 5, 30, '字号')
  numeric(t.titleSizePt, 5, 40, '标题字号')
  numeric(t.cellPaddingMm, 0, 5, '单元格边距')
  numeric(t.lineHeight, 1, 3, '行距')
  numeric(t.maxRows, 1, 200, '最大行数')
  if (!Number.isInteger(t.maxRows)) throw new Error('最大行数须为整数')
  if (t.mode !== 'blank' && t.mode !== 'preprinted') throw new Error('纸张模式无效')
  for (const k of Object.keys(base).filter(k => k.startsWith('show'))) if (typeof t[k] !== 'boolean') throw new Error(`${k}须为布尔值`)
  if (!Array.isArray(t.columns) || t.columns.length !== 8) throw new Error('须包含八个列定义')
  const keys = new Set<string>()
  let width = 0
  for (const v of t.columns) {
    const c = object(v)
    exactKeys(c, ['key', 'widthMm', 'visible', 'align', 'wrap'])
    if (typeof c.key !== 'string' || !Object.prototype.hasOwnProperty.call(columnLabels, c.key) || keys.has(c.key)) throw new Error('列定义无效')
    keys.add(c.key)
    if (!['left', 'center', 'right'].includes(c.align as string) || !['wrap', 'nowrap'].includes(c.wrap as string)) throw new Error('列对齐或换行方式无效')
    numeric(c.widthMm, 3, 450, '列宽')
    if (typeof c.visible !== 'boolean') throw new Error('列可见性无效')
    if (c.visible) width += c.widthMm as number
  }
  for (const key of ['name', 'quantity']) if (!t.columns.some(c => c.key === key && c.visible)) throw new Error('必须显示商品名称和数量')
  const typed = t as unknown as PrintTemplate
  const usableW = typed.paperWidthMm - typed.marginLeftMm - typed.marginRightMm
  const usableH = typed.paperHeightMm - typed.marginTopMm - typed.marginBottomMm
  // Offsets consume the physically available area; content may never be silently clipped.
  if (usableW < 20 || usableH < 10 || width * typed.actualScale > usableW + 0.01) throw new Error('列总宽超过纸张可用宽度，请缩窄列宽或调整纸张')
  if (typed.marginLeftMm + typed.offsetXMm < 0 || typed.marginTopMm + typed.offsetYMm < 0 || typed.marginLeftMm + typed.offsetXMm + width * typed.actualScale > typed.paperWidthMm - typed.marginRightMm + 0.01 || typed.marginTopMm + typed.offsetYMm >= typed.paperHeightMm - typed.marginBottomMm) throw new Error('偏移后超出可打印区域')
  return JSON.parse(JSON.stringify(typed))
}
export function validatePrintSettings(value: unknown): PrintSettings {
  const s = object(value)
  exactKeys(s, ['version', 'activeTemplateId', 'templates', 'profiles'])
  if (s.version !== 1 || !Array.isArray(s.templates) || !s.templates.length || s.templates.length > 100 || !Array.isArray(s.profiles) || s.profiles.length > 200) throw new Error('模板集合无效')
  const templates = s.templates.map(validateTemplate)
  if (new Set(templates.map(t => t.id)).size !== templates.length || !templates.some(t => t.id === s.activeTemplateId)) throw new Error('当前模板或编号无效')
  const profiles = s.profiles.map(v => {
    const p = object(v)
    exactKeys(p, ['name', 'printerName', 'templateId', 'paperWidthMm', 'paperHeightMm', 'template'])
    string(p.name, 100, '校准名称')
    string(p.printerName, 200, '打印机')
    const template = validateTemplate(p.template)
    if (!templates.some(t => t.id === p.templateId) || template.id !== p.templateId || p.paperWidthMm !== template.paperWidthMm || p.paperHeightMm !== template.paperHeightMm) throw new Error('打印机校准纸型无效')
    return {
      ...p,
      template
    } as unknown as PrinterProfile
  })
  return {
    version: 1,
    activeTemplateId: s.activeTemplateId as string,
    templates,
    profiles
  }
}
/** All arguments use one consistent unit. The final page may contain only totals/signatures. */
export function paginateMeasurements(rows: number[], bodyHeight: number, regularFooter: number, lastFooter: number, maxRows: number): number[][] {
  for (const n of [bodyHeight, regularFooter, lastFooter, ...rows]) if (!Number.isFinite(n) || n < 0) throw new Error('页面测量无效')
  if (maxRows < 1 || !Number.isInteger(maxRows) || lastFooter > bodyHeight || regularFooter > bodyHeight) throw new Error('页脚超过纸张可用高度')
  const pages: number[][] = []
  let cursor = 0
  while (cursor < rows.length) {
    let used = 0
    const page: number[] = []
    while (cursor < rows.length && page.length < maxRows && used + rows[cursor] <= bodyHeight - regularFooter) {
      used += rows[cursor]
      page.push(cursor++)
    }
    if (!page.length) throw new Error(`第 ${cursor + 1} 条商品无法完整放入一页，请增大纸高、缩小字号或缩短内容`)
    pages.push(page)
  }
  if (!pages.length) pages.push([])
  // Move trailing rows to the next page until the final totals/footer fit; preserve order.
  const last = pages[pages.length - 1]
  let sum = last.reduce((n, i) => n + rows[i], 0)
  if (sum + lastFooter > bodyHeight) {
    const tail: number[] = []
    while (last.length && sum + lastFooter > bodyHeight) {
      const i = last.pop()!
      sum -= rows[i]
      tail.unshift(i)
    }
    if (!last.length) {
      pages[pages.length - 1] = tail
      pages.push([])
    } else {
      pages.push(tail)
      const h = tail.reduce((n, i) => n + rows[i], 0)
      if (h + lastFooter > bodyHeight) pages.push([])
    }
  }
  return pages
}
export function validatePrintRequest(value: unknown): PrintDocumentRequest {
  const r = object(value)
  exactKeys(r, ['html', 'css', 'paperWidthMm', 'paperHeightMm', 'printerName', 'mode', 'defaultName'])
  numeric(r.paperWidthMm, 50, 500, '纸宽')
  numeric(r.paperHeightMm, 30, 1000, '纸高')
  if (r.mode !== 'print' && r.mode !== 'pdf') throw new Error('打印方式无效')
  if (typeof r.html !== 'string' || r.html.length > 10_000_000 || typeof r.css !== 'string' || r.css.length > 100_000) throw new Error('打印内容无效或过大')
  if (/<\s*\/?\s*(?:script|iframe|frame|object|embed|link|base|meta|img|svg|math|video|audio|form)\b|\bon\w+\s*=|\b(?:href|src|srcdoc)\s*=/i.test(r.html) || /<\s*\/\s*style|@import|url\s*\(|expression\s*\(/i.test(r.css) || /url\s*\(|expression\s*\(/i.test(r.html)) throw new Error('打印内容含不允许的活动或外部资源')
  if (r.printerName !== undefined) string(r.printerName, 200, '打印机')
  if (r.defaultName !== undefined) string(r.defaultName, 200, '文件名')
  return r as unknown as PrintDocumentRequest
}
export function buildNativeOptions(r: PrintDocumentRequest, mode: 'print' | 'pdf') {
  validatePrintRequest(r)
  if (mode === 'pdf') return {
    pageSize: {
      width: r.paperWidthMm / 25.4,
      height: r.paperHeightMm / 25.4
    },
    scale: 1,
    preferCSSPageSize: true,
    printBackground: true,
    margins: {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    },
    landscape: false
  }
  return {
    pageSize: {
      width: Math.round(r.paperWidthMm * 1000),
      height: Math.round(r.paperHeightMm * 1000)
    },
    scaleFactor: 100,
    margins: {
      marginType: 'none' as const
    },
    printBackground: true,
    landscape: false,
    silent: false,
    ...(r.printerName ? {
      deviceName: r.printerName
    } : {})
  }
}
