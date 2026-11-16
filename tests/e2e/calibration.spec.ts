import { test, expect } from '@playwright/test'
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any
    w.__printRequests = []; w.__stored = {}
    const order = { id: 1, documentNo: 'DB-20261116-001', orderNo: 'TEST-1', date: '2026-11-16', sender: '测试发货单位', receiver: '测试客户', receiverAddress: '测试地址一号仓库收货区', senderPhone:'123', receiverContact:'测试员', maker:'制单员', reviewer:'复核员', remark:'请核对数量并签收', items: Array.from({length:23},(_,i)=>({id:i+1,orderId:1,productCode:'P'+i,productName:i===4?'多行商品名称测试'.repeat(6):'测试商品'+i,specification:'200g',packageSpec:'1x20',unit:'箱',quantity:2.5,price:3.49,amount:8.73,remark:'',sortOrder:i})) }
    w.electronAPI = {
      getOrderById: async()=>structuredClone(order), getOrders:async()=>[order],
      getPrintSettings:async()=>structuredClone(w.__stored), setPrintSettings:async(data:any)=>{Object.assign(w.__stored,data);return{success:true}},
      listPrinters:async()=>[{name:'test-dot-matrix',displayName:'针式测试机',isDefault:true},{name:'other-printer',displayName:'另一台打印机'}],
      printDocument:async(request:any)=>{w.__printRequests.push(request);return{success:true,filePath:'test.pdf'}},
      getProductionStatus:async()=>({version:1,migrated:true,backupPath:'test'}), getProductionRecords:async()=>[],
    }
  })
})
test('physical preview paginates long rows and keeps preview zoom out of output', async ({page})=>{
  await page.goto('/#/orders/1/print')
  const print = page.getByRole('button',{name:'打印 (Ctrl+P)',exact:true})
  await expect(print).toBeEnabled()
  const sheets = page.locator('.print-preview .print-sheet')
  expect(await sheets.count()).toBeGreaterThan(1)
  const bounds = await sheets.evaluateAll(elements=>elements.map(e=>{const p=e.getBoundingClientRect(), b=e.querySelector('.sheet-body')!.getBoundingClientRect();return{w:p.width,h:p.height,fits:b.bottom<=p.bottom+0.5&&b.right<=p.right+0.5&&b.left>=p.left-0.5}}))
  for(const p of bounds){expect(p.w).toBeCloseTo(907.09,0);expect(p.h).toBeCloseTo(359.06,0);expect(p.fits).toBe(true)}
  const rowIndices = await sheets.locator('tbody tr').evaluateAll(rows=>rows.map(row=>Number(row.getAttribute('data-row'))))
  expect(rowIndices).toEqual(Array.from({length:23},(_,i)=>i))
  await page.getByLabel('预览缩放',{exact:true}).fill('50')
  await print.click()
  const request=await page.evaluate(()=>(window as any).__printRequests[0])
  expect(request.paperWidthMm).toBe(240);expect(request.paperHeightMm).toBe(95)
  expect(request.html).toContain('transform:scale(1)')
  expect(request.html).not.toContain('show-grid')
  await page.getByRole('button',{name:'导出 PDF',exact:true}).click()
  const pdfRequest=await page.evaluate(()=>(window as any).__printRequests[1])
  expect(pdfRequest.mode).toBe('pdf')
  const proof=await page.context().newPage()
  await proof.setContent(`<style>${pdfRequest.css}\n@page{size:240mm 95mm;margin:0}html,body{padding:0;margin:0}</style>${pdfRequest.html}`)
  await proof.evaluate(()=>document.fonts.ready)
  const pdf=await proof.pdf({path:test.info().outputPath('order-proof.pdf'),width:'240mm',height:'95mm',printBackground:true,preferCSSPageSize:true})
  const box=pdf.toString('latin1').match(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/)
  expect(box).not.toBeNull()
  expect(Math.abs(Number(box![1])-680.315)).toBeLessThan(1)
  expect(Math.abs(Number(box![2])-269.291)).toBeLessThan(1)
  await proof.close()
  await page.screenshot({path:'test-results/print-calibration-preview.png',fullPage:true})
})
test('calibration can be nudged, saved per device, and emits exactly three physical trial pages',async({page})=>{
  await page.goto('/#/orders/1/print')
  await expect(page.getByRole('button',{name:'打印 (Ctrl+P)',exact:true})).toBeEnabled()
  await page.getByLabel('微调步长',{exact:true}).selectOption('0.1')
  await page.getByRole('button',{name:'左右微调 增加',exact:true}).click()
  await page.getByLabel('校准配置名称',{exact:true}).fill('仓库三联纸')
  await page.getByRole('button',{name:'保存该打印机校准',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('保存')
  const stored = await page.evaluate(()=>JSON.parse((window as any).__stored.printProfilesV1))
  expect(stored.profiles[0].template.offsetXMm).toBe(0.1)
  await page.getByRole('button',{name:'连续 3 页试打',exact:true}).click()
  await expect(page.locator('.print-preview .print-sheet')).toHaveCount(3)
  await page.getByRole('button',{name:'打印 (Ctrl+P)',exact:true}).click()
  const request=await page.evaluate(()=>(window as any).__printRequests[0])
  expect((request.html.match(/<section/g)||[]).length).toBe(3)
  await page.getByLabel('打印机',{exact:true}).selectOption('other-printer')
  await expect(page.getByText('此设备暂无匹配校准，已恢复模板纸张与定位值')).toBeVisible()
})
test('invalid columns and long nowrap content block output without losing the editable template',async({page})=>{
  await page.goto('/#/orders/1/print')
  const print=page.getByRole('button',{name:'打印 (Ctrl+P)',exact:true})
  await expect(print).toBeEnabled()
  await page.getByLabel('商品名称列宽 mm',{exact:true}).fill('400')
  await expect(print).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('列总宽')
  await page.getByLabel('商品名称列宽 mm',{exact:true}).fill('52')
  await expect(print).toBeEnabled()
  await page.getByLabel('商品名称换行',{exact:true}).selectOption('nowrap')
  await expect(print).toBeDisabled()
  await expect(page.getByRole('alert')).toContainText('换行')
})
