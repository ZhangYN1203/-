import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchOrderById } from '../utils/ipc'
import { defaultTemplate, validateTemplate, validatePrintSettings, columnLabels, type PrintTemplate, type PrintSettings, type PrinterInfo, type PrintDocumentRequest, type PrintDocumentResult } from '../../electron/print-model'
import { loadSettings, renderDocument, renderMeasurement, measurePages, renderCalibration, applyDeviceCalibration, type PrintableOrder } from '../printing/document'
import printCss from '../styles/print.css?raw'
import '../styles/print.css'
interface PrintAPI {
  listPrinters(): Promise<PrinterInfo[]>
  printDocument(request: PrintDocumentRequest): Promise<PrintDocumentResult>
}
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e)
const initial = (): PrintSettings => {
  const t = defaultTemplate()
  return {
    version: 1,
    activeTemplateId: t.id,
    templates: [t],
    profiles: []
  }
}
const round = (n: number) => Math.round(n * 1000) / 1000
const toggleLabels = {
  showHeader: '抬头标题',
  showBorders: '表格线框',
  showCodes: '商品编码',
  showUnits: '单位',
  showSignatures: '签字栏',
  showRemark: '备注',
  showPageNumbers: '页码',
  showSubtotal: '每页小计',
  showTotal: '末页总计'
} as const
const OrderPrint: React.FC = () => {
  const {
    id
  } = useParams<{
    id: string
  }>(),
    navigate = useNavigate()
  const [order, setOrder] = useState<PrintableOrder | null>(null)
  const [settings, setSettings] = useState<PrintSettings>(initial)
  const [draft, setDraft] = useState<PrintTemplate>(defaultTemplate)
  const [history, setHistory] = useState<PrintTemplate[]>([])
  const [loaded, setLoaded] = useState(false),
    [fatal, setFatal] = useState(''),
    [message, setMessage] = useState('')
  const [printers, setPrinters] = useState<PrinterInfo[]>([]),
    [printer, setPrinter] = useState('')
  const [profileName, setProfileName] = useState(''),
    [activeProfile, setActiveProfile] = useState('')
  const [guides, setGuides] = useState({
    ruler: true,
    grid: false,
    paper: true,
    printable: true
  })
  const [step, setStep] = useState(0.5),
    [zoom, setZoom] = useState(100),
    [busy, setBusy] = useState(false)
  const [view, setView] = useState<'order' | 'calibration' | 'feed'>('order'),
    [currentPage, setCurrentPage] = useState(1)
  const [layout, setLayout] = useState<{
    key: string
    html: string
    pages: number[][]
  } | null>(null),
    [measureError, setMeasureError] = useState('')
  const measurement = useRef<HTMLDivElement>(null),
    preview = useRef<HTMLDivElement>(null),
    file = useRef<HTMLInputElement>(null)
  const api = window.electronAPI as typeof window.electronAPI & PrintAPI
  const key = JSON.stringify(draft) + JSON.stringify(order)
  const validation = useMemo(() => {
    try {
      return {
        template: validateTemplate(draft),
        error: ''
      }
    } catch (e) {
      return {
        template: null,
        error: errorText(e)
      }
    }
  }, [draft])
  const template = validation.template
  const measurementHtml = useMemo(() => order && template ? renderMeasurement(order, template) : '', [order, template])
  const ready = !!template && !!layout && layout.key === key && !validation.error && !measureError
  const calibrationHtml = useMemo(() => template && view !== 'order' ? renderCalibration(template, view === 'feed' ? 3 : 1) : '', [template, view])
  const html = view === 'order' ? ready ? layout!.html : '' : calibrationHtml
  const pageCount = view === 'order' ? layout?.pages.length || 1 : view === 'feed' ? 3 : 1
  const canPrint = loaded && !busy && !!html && (view !== 'order' || ready)
  useEffect(() => {
    let active = true
    setLoaded(false)
    const printerList = api.listPrinters ? api.listPrinters().catch(error => {
      if (active) setMessage(`读取打印机失败：${errorText(error)}`)
      return [] as PrinterInfo[]
    }) : Promise.resolve([] as PrinterInfo[])
    Promise.all([fetchOrderById(Number(id)), api.getPrintSettings(), printerList]).then(([data, stored, items]) => {
      if (!active) return
      if (!data) throw new Error('订单不存在')
      const next = loadSettings(stored)
      const savedTemplate = next.templates.find(t => t.id === next.activeTemplateId)!
      const defaultPrinter = items.find(p => p.isDefault)?.name || ''
      const savedProfile = [...next.profiles].reverse().find(profile =>
        profile.printerName === defaultPrinter && profile.templateId === savedTemplate.id
      )
      setPrinters(items)
      setPrinter(defaultPrinter)
      setOrder(data)
      setSettings(next)
      setDraft(savedProfile ? applyDeviceCalibration(savedTemplate, savedProfile.template) : savedTemplate)
      setActiveProfile(savedProfile?.name || '')
      if (savedProfile) setMessage(`已载入默认打印机校准：${savedProfile.name}`)
      setLoaded(true)
    }).catch(e => active && setFatal(errorText(e)))
    return () => {
      active = false
    }
  }, [id])
  useEffect(() => {
    let canceled = false
    setLayout(null)
    setMeasureError('')
    if (!order || !template || !measurement.current) return
    const root = measurement.current;
    (async () => {
      await document.fonts?.ready
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (canceled) return
      try {
        const pages = measurePages(root, order, template)
        const nextHtml = renderDocument(order, template, pages)
        if (!canceled) setLayout({
          key,
          html: nextHtml,
          pages
        })
      } catch (e) {
        if (!canceled) setMeasureError(errorText(e))
      }
    })().catch(e => !canceled && setMeasureError(errorText(e)))
    return () => {
      canceled = true
    }
  }, [key, measurementHtml])
  useEffect(() => setCurrentPage(1), [key, view])
  const edit = (patch: Partial<PrintTemplate>) => {
    setHistory(h => [...h.slice(-29), draft])
    setDraft({
      ...draft,
      ...patch
    })
    setMessage('')
  }
  const choose = (t: PrintTemplate) => {
    setHistory([])
    setActiveProfile('')
    setDraft(structuredClone(t))
    setSettings(s => ({
      ...s,
      activeTemplateId: t.id
    }))
    setMessage('')
  }
  const save = async (next: PrintSettings) => {
    const checked = validatePrintSettings(next)
    const response = await api.setPrintSettings({
      printProfilesV1: JSON.stringify(checked)
    })
    if (!response.success) throw new Error('保存打印设置失败')
    setSettings(checked)
    setMessage('设置已保存')
  }
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const withDraft = (): PrintSettings => {
    const t = validateTemplate(draft)
    return {
      ...settings,
      activeTemplateId: t.id,
      templates: settings.templates.some(x => x.id === t.id) ? settings.templates.map(x => x.id === t.id ? t : x) : [...settings.templates, t]
    }
  }
  const saveTemplate = () => run(async () => {
    await save(withDraft())
  })
  const print = async (mode: 'print' | 'pdf', current = false) => {
    if (!canPrint || !template) return
    await run(async () => {
      const documentHtml = current ? preview.current?.querySelectorAll('.print-sheet')[currentPage - 1]?.outerHTML : html
      if (!documentHtml) throw new Error('当前页面尚未就绪')
      const result = await api.printDocument({
        html: documentHtml,
        css: printCss,
        paperWidthMm: template.paperWidthMm,
        paperHeightMm: template.paperHeightMm,
        ...(printer ? {
          printerName: printer
        } : {}),
        mode,
        defaultName: `${order?.documentNo || '订单'}-${view === 'order' ? '校样' : '校准'}`
      })
      if (result.canceled) setMessage('已取消'); else if (!result.success) throw new Error(result.error || '打印失败'); else setMessage(mode === 'pdf' ? `PDF 已保存：${result.filePath}` : '打印任务已提交')
    })
  }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        void print('print')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canPrint, html, printer, template, currentPage])
  const numeric = (label: string, field: keyof PrintTemplate, min: number, max: number, increment = step) => <label key={field}>
    {label}
    <input aria-label={label} type="number" min={min} max={max} step={increment} value={draft[field] as number} onChange={e => edit({
      [field]: Number(e.target.value)
    })} />
  </label>
  const nudge = (label: string, field: 'offsetXMm' | 'offsetYMm') => <label>
    {label}
    <span>
      <button aria-label={`${label} 减少`} onClick={() => edit({
        [field]: round(draft[field] - step)
      })}>−</button>
      {draft[field]} mm
      <button aria-label={`${label} 增加`} onClick={() => edit({
        [field]: round(draft[field] + step)
      })}>＋</button>
    </span>
  </label>
  const preset = (width: number, height: number) => {
    const target = width - draft.marginLeftMm - draft.marginRightMm - 4
    const sum = draft.columns.filter(c => c.visible).reduce((s, c) => s + c.widthMm, 0)
    edit({
      paperWidthMm: width,
      paperHeightMm: height,
      offsetXMm: 0,
      offsetYMm: 0,
      actualScale: 1,
      columns: draft.columns.map(c => ({
        ...c,
        widthMm: c.visible ? round(c.widthMm * target / sum) : c.widthMm
      }))
    })
  }
  const changePrinter = (name: string) => {
    setPrinter(name)
    const profile = [...settings.profiles].reverse().find(p => p.printerName === name && p.templateId === draft.id && p.paperWidthMm === draft.paperWidthMm && p.paperHeightMm === draft.paperHeightMm)
    const base = settings.templates.find(t => t.id === draft.id) || defaultTemplate()
    setHistory(h => [...h, draft])
    setDraft(applyDeviceCalibration(draft, profile ? profile.template : base))
    setActiveProfile(profile?.name || '')
    setMessage(profile ? `已载入校准：${profile.name}` : '此设备暂无匹配校准，已恢复模板纸张与定位值')
  }
  const exportJson = () => {
    try {
      const checked = validatePrintSettings(withDraft())
      const url = URL.createObjectURL(new Blob([JSON.stringify(checked, null, 2)], {
        type: 'application/json'
      }))
      const a = document.createElement('a')
      a.href = url
      a.download = '打印模板与校准.json'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setMessage(errorText(e))
    }
  }
  const importJson = (selected: File | undefined) => {
    if (!selected) return
    void run(async () => {
      if (selected.size > 1_000_000) throw new Error('模板文件超过 1 MB')
      const imported = validatePrintSettings(JSON.parse(await selected.text()))
      await save(imported)
      choose(imported.templates.find(t => t.id === imported.activeTemplateId)!)
      setMessage('模板已导入并保存')
    })
    if (file.current) file.current.value = ''
  }
  if (fatal) return <div className="page-container">
    <p role="alert">
      {fatal}
    </p>
    <button onClick={() => navigate('/')}>返回列表</button>
  </div>
  if (!loaded || !order) return <div className="page-container">加载订单和打印设置...</div>
  const layoutError = validation.error || measureError
  return <div className="print-workspace">
    <div className="no-print print-toolbar">
      <button onClick={() => navigate('/')}>← 返回列表</button>
      <button onClick={() => navigate(`/orders/${id}`)}>编辑订单</button>
      <button disabled={!canPrint} onClick={() => void print('print')}>打印 (Ctrl+P)</button>
      <button disabled={!canPrint} onClick={() => void print('pdf')}>导出 PDF</button>
      <label>当前页
        <input aria-label="当前页" style={{
          width: 50
        }} type="number" min={1} max={pageCount} value={currentPage} onChange={e => setCurrentPage(Math.max(1, Math.min(pageCount, Number(e.target.value))))} />
      </label>
      <button disabled={!canPrint} onClick={() => void print('print', true)}>打印当前页</button>
    </div>
    {order.items.some(item => (item as typeof item & {
      snapshotNeedsReview?: boolean
    }).snapshotNeedsReview) && <div className="no-print print-status">历史商品整箱规格未留存，请核对后补充；打印时保留空白。</div>}
    {layoutError && view === 'order' && <div className="print-status print-error" role="alert">
      {layoutError}
    </div>}
    {validation.error && view !== 'order' && <div className="print-status print-error" role="alert">
      {validation.error}
    </div>}
    {message && <div className="print-status" role="status">
      {message}
    </div>}
    <div className="print-layout">
      <aside className="no-print print-settings">
        <h3>打印设置与校准</h3>
        <label>模板
          <select aria-label="模板" value={settings.templates.some(t => t.id === draft.id) ? draft.id : ''} onChange={e => choose(settings.templates.find(t => t.id === e.target.value)!)}>
            {!settings.templates.some(t => t.id === draft.id) && <option value="">新建（未保存）</option>}
            {settings.templates.map(t => <option key={t.id} value={t.id}>
              {t.name}
            </option>)}
          </select>
        </label>
        <label>模板名称
          <input aria-label="模板名称" value={draft.name} maxLength={100} onChange={e => edit({
            name: e.target.value
          })} />
        </label>
        <div className="setting-buttons">
          <button disabled={busy} onClick={saveTemplate}>保存模板</button>
          <button onClick={() => {
            const t = {
              ...structuredClone(draft),
              id: `template-${Date.now()}`,
              name: `${draft.name} 副本`
            }
            setHistory([])
            setDraft(t)
          }}>新建 / 另存</button>
          <button disabled={busy || settings.templates.length === 1 || !settings.templates.some(t => t.id === draft.id)} onClick={() => void run(async () => {
            const next = settings.templates.filter(t => t.id !== draft.id)
            await save({
              ...settings,
              templates: next,
              activeTemplateId: next[0].id,
              profiles: settings.profiles.filter(p => p.templateId !== draft.id)
            })
            choose(next[0])
          })}>删除模板</button>
        </div>
        <div className="setting-buttons">
          <button disabled={!history.length} onClick={() => {
            setDraft(history[history.length - 1])
            setHistory(h => h.slice(0, -1))
          }}>撤销</button>
          <button onClick={() => {
            const saved = settings.templates.find(t => t.id === draft.id)
            if (saved) {
              setHistory(h => [...h, draft])
              setDraft(structuredClone(saved))
              setActiveProfile('')
            }
          }}>恢复上次保存</button>
          <button onClick={() => edit({
            ...defaultTemplate(),
            id: draft.id,
            name: draft.name
          })}>恢复默认</button>
          <button onClick={exportJson}>导出 JSON</button>
          <button onClick={() => file.current?.click()}>导入 JSON</button>
          <input ref={file} hidden type="file" accept=".json,application/json" onChange={e => importJson(e.target.files?.[0])} />
        </div>
        <label>打印机
          <select aria-label="打印机" value={printer} onChange={e => changePrinter(e.target.value)}>
            <option value="">系统默认 / 打印对话框选择</option>
            {printers.map(p => <option key={p.name} value={p.name}>
              {p.displayName || p.name}
            </option>)}
          </select>
        </label>
        <label>校准配置名称
          <input aria-label="校准配置名称" value={profileName} maxLength={100} placeholder="例如：仓库针打 · 三联纸" onChange={e => setProfileName(e.target.value)} />
        </label>
        <div className="setting-buttons">
          <button disabled={!printer || busy || !!validation.error} onClick={() => void run(async () => {
            const next = withDraft()
            const storedTemplate = settings.templates.find(t => t.id === draft.id)
            if (storedTemplate) next.templates = next.templates.map(t => t.id === draft.id ? applyDeviceCalibration(t, storedTemplate) : t)
            const profile = {
              name: profileName.trim() || `${draft.name} · ${printer}`,
              printerName: printer,
              templateId: draft.id,
              paperWidthMm: draft.paperWidthMm,
              paperHeightMm: draft.paperHeightMm,
              template: validateTemplate(draft)
            }
            await save({
              ...next,
              profiles: [...next.profiles.filter(p => !(p.printerName === printer && p.templateId === draft.id && p.paperWidthMm === draft.paperWidthMm && p.paperHeightMm === draft.paperHeightMm && p.name === profile.name)), profile]
            })
            setActiveProfile(profile.name)
          })}>保存该打印机校准</button>
        </div>
        {settings.profiles.length > 0 && <label>已存校准
          <select aria-label="已存校准" value="" onChange={e => {
            const p = settings.profiles[Number(e.target.value)]
            if (p) {
              setPrinter(p.printerName)
              const base = settings.templates.find(t => t.id === p.templateId)!
              choose(applyDeviceCalibration(base, p.template))
              setActiveProfile(p.name)
              setProfileName(p.name)
            }
          }}>
            <option value="">选择打印机 + 纸型 + 模板</option>
            {settings.profiles.map((p, i) => <option key={i} value={i}>
              {p.name} (
              {p.paperWidthMm}×
              {p.paperHeightMm})
            </option>)}
          </select>
        </label>}
        <p className="hint">当前校准：
          {activeProfile || '模板默认 / 当前草稿'}。设备配置优先覆盖纸张、边距、比例与偏移；字体与商品列使用当前模板。最终生效：
          {draft.paperWidthMm}×
          {draft.paperHeightMm} mm，X
          {draft.offsetXMm} / Y
          {draft.offsetYMm} mm，
          {round(draft.actualScale * 100)}%。
        </p>
        <h3>纸张与定位（mm）</h3>
        <div className="setting-buttons">
          <button onClick={() => preset(240, 95)}>连续纸 240×95</button>
          <button onClick={() => preset(210, 297)}>A4 竖</button>
          <button onClick={() => preset(297, 210)}>A4 横</button>
        </div>
        {numeric('纸宽 mm', 'paperWidthMm', 50, 500)}
        {numeric('纸高 mm', 'paperHeightMm', 30, 1000)}
        <label>纸张模式
          <select aria-label="纸张模式" value={draft.mode} onChange={e => edit({
            mode: e.target.value as PrintTemplate['mode']
          })}>
            <option value="blank">空白纸（抬头与框线）</option>
            <option value="preprinted">预印套打（隐藏抬头与框线）</option>
          </select>
        </label>
        <label>微调步长
          <select aria-label="微调步长" value={step} onChange={e => setStep(Number(e.target.value))}>
            <option value={0.1}>0.1 mm</option>
            <option value={0.5}>0.5 mm</option>
            <option value={1}>1 mm</option>
          </select>
        </label>
        {numeric('上边距 mm', 'marginTopMm', 0, 100)}
        {numeric('下边距 mm', 'marginBottomMm', 0, 100)}
        {numeric('左边距 mm', 'marginLeftMm', 0, 100)}
        {numeric('右边距 mm', 'marginRightMm', 0, 100)}
        {numeric('横向偏移 mm', 'offsetXMm', -100, 100)}
        {nudge('左右微调', 'offsetXMm')}
        <label>横向滑块（＋向右）
          <input aria-label="横向滑块" type="range" min={-20} max={20} step={step} value={draft.offsetXMm} onChange={e => edit({
            offsetXMm: Number(e.target.value)
          })} />
        </label>
        {numeric('纵向偏移 mm', 'offsetYMm', -100, 100)}
        {nudge('上下微调', 'offsetYMm')}
        <label>纵向滑块（＋向下）
          <input aria-label="纵向滑块" type="range" min={-20} max={20} step={step} value={draft.offsetYMm} onChange={e => edit({
            offsetYMm: Number(e.target.value)
          })} />
        </label>
        <label>实际打印比例 %
          <input aria-label="实际打印比例 %" type="number" min={50} max={150} step={0.1} value={round(draft.actualScale * 100)} onChange={e => edit({
            actualScale: Number(e.target.value) / 100
          })} />
        </label>
        <label>预览缩放
          <input aria-label="预览缩放" type="range" min={30} max={150} step={5} value={zoom} onChange={e => setZoom(Number(e.target.value))} />
          {zoom}%
        </label>
        <p className="hint">预览缩放只改变屏幕显示；实际比例会改变纸上内容，默认 100%。校准顺序：先调驱动纸型及纸高走纸长度，再调横纵偏移，最后调版式。驱动不可打印边距仍需实机核对。</p>
        <div className="setting-buttons">
          <button onClick={() => setView('order')}>订单预览</button>
          <button onClick={() => setView('calibration')}>100mm 校准页</button>
          <button onClick={() => setView('feed')}>连续 3 页试打</button>
        </div>
        <h3>预览辅助线</h3>
        {Object.entries({
          ruler: '标尺',
          grid: '网格',
          paper: '纸张边界',
          printable: '可打印范围'
        }).map(([field, label]) => <label key={field}>
          {label}
          <input aria-label={label} type="checkbox" checked={guides[field as keyof typeof guides]} onChange={e => setGuides({
            ...guides,
            [field]: e.target.checked
          })} />
        </label>)}
        <p className="hint">有效宽高：
          {round((draft.paperWidthMm - draft.marginLeftMm - draft.marginRightMm - draft.offsetXMm) / draft.actualScale)} ×
          {round((draft.paperHeightMm - draft.marginTopMm - draft.marginBottomMm - draft.offsetYMm) / draft.actualScale)} mm。辅助线仅显示于预览。
        </p>
        <h3>字体、行距与区块</h3>
        <label>字体
          <input aria-label="字体" value={draft.fontFamily} onChange={e => edit({
            fontFamily: e.target.value
          })} list="print-fonts" />
          <datalist id="print-fonts">
            <option>SimSun</option>
            <option>Microsoft YaHei</option>
            <option>Noto Serif CJK SC</option>
            <option>Arial</option>
          </datalist>
        </label>
        {numeric('字号 pt', 'fontSizePt', 5, 30, 0.5)}
        {numeric('标题字号 pt', 'titleSizePt', 5, 40, 0.5)}
        {numeric('行距倍数', 'lineHeight', 1, 3, 0.05)}
        {numeric('单元格边距 mm', 'cellPaddingMm', 0, 5)}
        {numeric('每页最多商品行', 'maxRows', 1, 200, 1)}
        {numeric('抬头后间距 mm', 'headerGapMm', 0, 20)}
        {numeric('表格后间距 mm', 'tableGapMm', 0, 20)}
        {numeric('页脚前间距 mm', 'footerGapMm', 0, 20)}
        <label>单据标题
          <input aria-label="单据标题" maxLength={200} value={draft.title} onChange={e => edit({
            title: e.target.value
          })} />
        </label>
        {Object.entries(toggleLabels).map(([field, label]) => <label key={field}>
          {label}
          <input aria-label={label} type="checkbox" checked={draft[field as keyof typeof toggleLabels]} onChange={e => edit({
            [field]: e.target.checked
          })} />
        </label>)}
        <h3>商品列（顺序 / 宽度 mm）</h3>
        {draft.columns.map((c, i) => <div key={c.key} className="column-control">
          <label>
            {columnLabels[c.key]}
            <input aria-label={`显示${columnLabels[c.key]}`} type="checkbox" checked={c.visible} disabled={c.key === 'name' || c.key === 'quantity'} onChange={e => edit({
              columns: draft.columns.map(x => x.key === c.key ? {
                ...x,
                visible: e.target.checked
              } : x)
            })} />
            <input aria-label={`${columnLabels[c.key]}列宽 mm`} type="number" min={3} max={450} step={step} value={c.widthMm} onChange={e => edit({
              columns: draft.columns.map(x => x.key === c.key ? {
                ...x,
                widthMm: Number(e.target.value)
              } : x)
            })} />
            <button aria-label={`${columnLabels[c.key]}上移`} disabled={i === 0} onClick={() => {
              const cols = [...draft.columns];
              [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]
              edit({
                columns: cols
              })
            }}>↑</button>
            <button aria-label={`${columnLabels[c.key]}下移`} disabled={i === 7} onClick={() => {
              const cols = [...draft.columns];
              [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]]
              edit({
                columns: cols
              })
            }}>↓</button>
          </label>
          <label>对齐 / 换行
            <select aria-label={`${columnLabels[c.key]}对齐`} value={c.align} onChange={e => edit({
              columns: draft.columns.map(x => x.key === c.key ? {
                ...x,
                align: e.target.value as typeof c.align
              } : x)
            })}>
              <option value="left">靠左</option>
              <option value="center">居中</option>
              <option value="right">靠右</option>
            </select>
            <select aria-label={`${columnLabels[c.key]}换行`} value={c.wrap} onChange={e => edit({
              columns: draft.columns.map(x => x.key === c.key ? {
                ...x,
                wrap: e.target.value as typeof c.wrap
              } : x)
            })}>
              <option value="wrap">自动换行</option>
              <option value="nowrap">不换行</option>
            </select>
          </label>
        </div>)}
        <p className="hint">列总宽
          {round(draft.columns.filter(c => c.visible).reduce((n, c) => n + c.widthMm, 0))} mm。自动测量完整行，放不下时停止打印。模板仅影响打印，不改变订单。
        </p>
      </aside>
      <main className="print-preview">
        <div className="no-print hint">
          {view === 'order' ? `订单 ${order.documentNo} · ${ready ? `${pageCount} 页` : '等待字体与分页测量'}` : view === 'feed' ? '连续三页走纸校准' : '标尺定位校准'} · 预览
          {zoom}%
        </div>
        {guides.ruler && <div className="preview-screen-ruler" style={{
          width: `${100 * 96 / 25.4 * zoom / 100}px`
        }}>0 ├──────── 100 mm ┤</div>}
        <div style={{
          width: `${draft.paperWidthMm * 96 / 25.4 * zoom / 100}px`,
          height: `${pageCount * (draft.paperHeightMm * 96 / 25.4 + 16) * zoom / 100}px`
        }}>
          <div ref={preview} className={`preview-zoom ${guides.paper ? 'show-paper' : ''} ${guides.grid ? 'show-grid' : ''} ${guides.printable ? 'show-printable' : ''}`} style={{
            transform: `scale(${zoom / 100})`
          }} dangerouslySetInnerHTML={{
            __html: html
          }} />
        </div>
      </main>
    </div>
    <div ref={measurement} className="print-measurement" aria-hidden="true" dangerouslySetInnerHTML={{
      __html: measurementHtml
    }} />
  </div>
}
export default OrderPrint
