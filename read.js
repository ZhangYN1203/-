const XLSX = require('xlsx');
  const wb = XLSX.readFileSync('价格表及客户信息.xlsx');
  console.log('Sheet名称:', JSON.stringify(wb.SheetNames));
  wb.SheetNames.forEach(n => {
    const d = XLSX.utils.sheet_to_json(wb.Sheets[n], {defval:''});
    console.log('\n' + n + ' (' + d.length + '行)');
    console.log(JSON.stringify(d.slice(0,3), null, 2));
  });