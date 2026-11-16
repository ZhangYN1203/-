import { columnLabels, defaultTemplate, validateTemplate, validatePrintSettings, paginateMeasurements, type PrintTemplate, type PrintSettings, type ColumnKey } from '../../electron/print-model'
import type { Order, OrderItem } from '../types'
export type PrintableOrder = Order & {
  items: OrderItem[]
}
const mmToPx = 96 / 25.4
export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]!)
export function loadSettings(stored: Record<string, string>): PrintSettings {
  if (stored.printProfilesV1) return validatePrintSettings(JSON.parse(stored.printProfilesV1))
  const template = defaultTemplate()
  const height = Number(stored.printPageHeight)
  if (Number.isFinite(height) && height >= 30 && height <= 1000) template.paperHeightMm = height
  return {
    version: 1,
    activeTemplateId: template.id,
    templates: [validateTemplate(template)],
    profiles: []
  }
}
const visible = (t: PrintTemplate) => t.columns.filter(c => c.visible)
function cell(item: OrderItem, key: ColumnKey, index: number, t: PrintTemplate): unknown {
  switch (key) {
    case 'sequence':
      return index + 1
    case 'name':
      return `${item.productName || ''}${t.showUnits && item.unit ? `（${item.unit}）` : ''}${t.showCodes && item.productCode ? ` [${item.productCode}]` : ''}`
    case 'quantity':
      return item.quantity
    case 'price':
    case 'amount':
      return Number(item[key] || 0).toFixed(2)
    case 'signature':
      return ''
    default:
      return item[key] || ''
  }
}
function table(order: PrintableOrder, t: PrintTemplate, indices: number[]) {
  const columns = visible(t)
  return `<table class="items-table"><colgroup>${columns.map(c => `<col style="width:${c.widthMm}mm">`).join('')}</colgroup><thead><tr>${columns.map(c => `<th data-column="${c.key}">${columnLabels[c.key]}</th>`).join('')}</tr></thead><tbody>${indices.map(i => `<tr data-row="${i}">${columns.map(c => `<td data-column="${c.key}" style="text-align:${c.align};white-space:${c.wrap === 'nowrap' ? 'nowrap' : 'normal'}">${escapeHtml(cell(order.items[i], c.key, i, t))}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}
function header(o: PrintableOrder, t: PrintTemplate) {
  const field = (label: string, value: unknown) => `<div><b>${label}：</b>${escapeHtml(value)}</div>`
  return `<div class="document-header">${t.showHeader && t.mode === 'blank' ? `<header><strong>${escapeHtml(o.sender)}</strong><h1>${escapeHtml(t.title)}</h1><b>No: ${escapeHtml(o.documentNo)}</b></header>` : `<div class="document-number-only">单据编号：${escapeHtml(o.documentNo)}</div>`}<div class="document-info">${field('日期', o.date)}${field('收货单位', o.receiver)}${field('发货单位', o.sender)}${field('收货地址', o.receiverAddress)}${field('电话', o.senderPhone)}${field('收货联系人', `${o.receiverContact || ''} ${o.receiverPhone || ''}`)}</div></div>`
}
function summary(label: string, items: OrderItem[], t: PrintTemplate) {
  return `<div class="summary"><b>${label}</b><span>数量：${items.reduce((n, i) => n + Number(i.quantity || 0), 0)}</span>${t.columns.some(c => c.key === 'amount' && c.visible) ? `<span>金额：${items.reduce((n, i) => n + Number(i.amount || 0), 0).toFixed(2)}</span>` : ''}</div>`
}
function lastFooter(o: PrintableOrder, t: PrintTemplate) {
  return `<div class="last-footer">${t.showTotal ? summary('总计', o.items, t) : ''}${t.showSignatures ? `<div class="document-signatures"><span>制单人：${escapeHtml(o.maker)}</span><span>复核：${escapeHtml(o.reviewer)}</span><span>承运人签字：________</span><span>收货人签字：________</span></div>` : ''}${t.showRemark && o.remark ? `<div class="document-remark">备注：${escapeHtml(o.remark)}</div>` : ''}</div>`
}
function page(t: PrintTemplate, inner: string) {
  const width = visible(t).reduce((n, c) => n + c.widthMm, 0)
  return `<section class="print-sheet ${t.mode === 'preprinted' || !t.showBorders ? 'without-borders' : ''}" style="width:${t.paperWidthMm}mm;height:${t.paperHeightMm}mm;--paper-width:${t.paperWidthMm}mm;--paper-height:${t.paperHeightMm}mm;--margin-top:${t.marginTopMm + t.offsetYMm}mm;--margin-left:${t.marginLeftMm + t.offsetXMm}mm;--margin-right:${t.marginRightMm}mm;--margin-bottom:${t.marginBottomMm}mm;--title-size:${t.titleSizePt}pt;--font-size:${t.fontSizePt}pt;--cell-padding:${t.cellPaddingMm}mm;--line-height:${t.lineHeight};--header-gap:${t.headerGapMm}mm;--table-gap:${t.tableGapMm}mm;--footer-gap:${t.footerGapMm}mm;font-family:'${escapeHtml(t.fontFamily)}',SimSun,'宋体','Noto Serif CJK SC',serif"><div class="sheet-body" style="left:${t.marginLeftMm + t.offsetXMm}mm;top:${t.marginTopMm + t.offsetYMm}mm;width:${width}mm;transform:scale(${t.actualScale})">${inner}</div></section>`
}
export function renderDocument(o: PrintableOrder, template: PrintTemplate, pages: number[][]): string {
  const t = validateTemplate(template)
  return pages.map((indices, index) => page(t, header(o, t) + table(o, t, indices) + `<div class="page-subtotal">${t.showSubtotal ? summary('本页小计', indices.map(i => o.items[i]), t) : ''}</div>` + (index === pages.length - 1 ? lastFooter(o, t) : '') + `<div class="document-page-number">${t.showPageNumbers ? `第 ${index + 1} 页 / 共 ${pages.length} 页` : ''}</div>`)).join('')
}
export function renderMeasurement(o: PrintableOrder, t: PrintTemplate): string {
  return renderDocument(o, t, [o.items.map((_, i) => i)])
}
/** Called after document.fonts.ready; the measurement DOM uses the same classes and widths. */
export function measurePages(root: HTMLElement, o: PrintableOrder, t: PrintTemplate): number[][] {
  const height = (selector: string) => root.querySelector<HTMLElement>(selector)?.getBoundingClientRect().height || 0
  const available = (t.paperHeightMm - t.marginTopMm - t.marginBottomMm - t.offsetYMm) * mmToPx
  // Collapsed border rounding and page-count digit widths get a small physical allowance.
  const body = available - height('.document-header') - height('thead') - 0.6 * mmToPx
  const regular = height('.page-subtotal') + height('.document-page-number')
  const final = regular + height('.last-footer')
  for (const td of root.querySelectorAll<HTMLElement>('td')) if (td.scrollWidth > td.clientWidth + 1) throw new Error('不换行的列内容超出列宽，请增大列宽或启用换行')
  for (const section of root.querySelectorAll<HTMLElement>('.sheet-body,.document-header,.document-info,.document-info>div,.summary,.document-signatures,.document-remark')) {
    if (section.scrollWidth > section.clientWidth + 1) throw new Error('抬头或页脚内容超出可用宽度，请调整字体、宽度或内容')
  }
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-row]')).map(el => el.getBoundingClientRect().height)
  if (rows.length !== o.items.length || rows.some(h => h <= 0)) throw new Error('商品行测量尚未完成')
  return paginateMeasurements(rows, body, regular, final, t.maxRows)
}
export function renderCalibration(template: PrintTemplate, count: 1 | 3): string {
  const t = validateTemplate(template)
  const width = visible(t).reduce((n, c) => n + c.widthMm, 0)
  const rulerWidth = Math.min(100, width)
  return Array.from({
    length: count
  }, (_, index) => page(t, `<div class="calibration"><b>连续纸定位校准 ${index + 1} / ${count}</b><div>纸张 ${t.paperWidthMm} × ${t.paperHeightMm} mm；实际比例 ${(t.actualScale * 100).toFixed(1)}%</div><div>偏移 X ${t.offsetXMm} / Y ${t.offsetYMm} mm</div><div class="calibration-ruler" style="width:${rulerWidth}mm">${rulerWidth} mm 标尺${Array.from({
    length: Math.floor(rulerWidth / 10) + 1
  }, (_, i) => `<i style="left:${i * 10}mm">${i * 10}</i>`).join('')}</div><div class="calibration-cross">＋ 左上对齐线　　请量尺并核对逐页走纸</div></div>`)).join('')
}

/** Device settings take precedence; content, fonts, columns and sections stay in the template. */
export function applyDeviceCalibration(base: PrintTemplate, device: PrintTemplate): PrintTemplate {
  const fields = ['paperWidthMm', 'paperHeightMm', 'marginTopMm', 'marginRightMm', 'marginBottomMm', 'marginLeftMm', 'offsetXMm', 'offsetYMm', 'actualScale'] as const
  const result = {
    ...base
  }
  for (const field of fields) result[field] = device[field]
  return result
}
