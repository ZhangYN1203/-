import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'

let db: SqlJsDatabase | null = null
let dbPath: string = ''

export async function initDatabase(databasePath: string): Promise<void> {
  // Locate sql-wasm.wasm - works both in dev and packaged
  const wasmPath = path.join(app.getAppPath(), 'resources', 'sql-wasm.wasm')
  const SQL = await initSqlJs({
    locateFile: (file: string) => {
      if (fs.existsSync(wasmPath)) {
        return wasmPath
      }
      // Fallback to node_modules for dev
      return path.join(__dirname, '../node_modules/sql.js/dist/', file)
    },
  })
  dbPath = databasePath

  // Ensure directory exists
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  // Open existing DB or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      documentNo TEXT NOT NULL DEFAULT '',
      orderNo TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      sender TEXT NOT NULL DEFAULT '',
      senderPhone TEXT NOT NULL DEFAULT '',
      receiver TEXT NOT NULL DEFAULT '',
      receiverContact TEXT NOT NULL DEFAULT '',
      receiverPhone TEXT NOT NULL DEFAULT '',
      receiverAddress TEXT NOT NULL DEFAULT '',
      carrierVehicle TEXT NOT NULL DEFAULT '',
      carrierName TEXT NOT NULL DEFAULT '',
      warehouse TEXT NOT NULL DEFAULT '',
      outTime TEXT NOT NULL DEFAULT '',
      tonnage TEXT NOT NULL DEFAULT '',
      mileage TEXT NOT NULL DEFAULT '',
      maker TEXT NOT NULL DEFAULT '',
      reviewer TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL DEFAULT '',
      productCode TEXT NOT NULL DEFAULT '',
      productName TEXT NOT NULL DEFAULT '',
      specification TEXT NOT NULL DEFAULT '',
      packageSpec TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS price_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      isDefault INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      contact TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      priceTableId INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId INTEGER NOT NULL,
      productCode TEXT NOT NULL DEFAULT '',
      productName TEXT NOT NULL DEFAULT '',
      specification TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT '',
      quantity REAL NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0,
      remark TEXT NOT NULL DEFAULT '',
      sortOrder INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS price_table_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      priceTableId INTEGER NOT NULL DEFAULT 0,
      productCode TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(priceTableId, productCode)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS price_change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      priceTableId INTEGER NOT NULL DEFAULT 0,
      productCode TEXT NOT NULL DEFAULT '',
      oldPrice REAL NOT NULL DEFAULT 0,
      newPrice REAL NOT NULL DEFAULT 0,
      changedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  // ── Settings table (key-value store for print settings, etc.) ──
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `)

  // ── New tables: workshops, raw materials, inventory ──

  db.run(`
    CREATE TABLE IF NOT EXISTS workshops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      manager TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS raw_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      materialCode TEXT NOT NULL DEFAULT '',
      materialName TEXT NOT NULL DEFAULT '',
      specification TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS material_inbound (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inboundNo TEXT NOT NULL DEFAULT '',
      materialId INTEGER NOT NULL DEFAULT 0,
      quantity REAL NOT NULL DEFAULT 0,
      operator TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      inboundDate TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS material_outbound (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outboundNo TEXT NOT NULL DEFAULT '',
      workshopId INTEGER NOT NULL DEFAULT 0,
      materialId INTEGER NOT NULL DEFAULT 0,
      quantity REAL NOT NULL DEFAULT 0,
      operator TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      outboundDate TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS product_inbound (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inboundNo TEXT NOT NULL DEFAULT '',
      productId INTEGER NOT NULL DEFAULT 0,
      quantity REAL NOT NULL DEFAULT 0,
      inboundType TEXT NOT NULL DEFAULT '',  -- 'purchase' 采购 / 'production' 生产
      operator TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      inboundDate TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      itemType TEXT NOT NULL DEFAULT '',  -- 'raw_material' / 'product'
      itemId INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT '',  -- 'inbound' / 'outbound'
      quantity REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      refId INTEGER NOT NULL DEFAULT 0,
      refType TEXT NOT NULL DEFAULT '',  -- 'material_inbound' / 'material_outbound' / 'product_inbound' / 'order_outbound'
      operator TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  // ── Migration: add missing columns ──
  try { db.run('ALTER TABLE customers ADD COLUMN remark TEXT NOT NULL DEFAULT \'\'') } catch {}
  try { db.run('ALTER TABLE customers ADD COLUMN priceTableId INTEGER NOT NULL DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE price_change_log ADD COLUMN priceTableId INTEGER NOT NULL DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE price_change_log ADD COLUMN productCode TEXT NOT NULL DEFAULT \'\'') } catch {}
  try { db.run('ALTER TABLE price_change_log ADD COLUMN oldPrice REAL NOT NULL DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE price_change_log ADD COLUMN newPrice REAL NOT NULL DEFAULT 0') } catch {}
  try { db.run('ALTER TABLE price_change_log ADD COLUMN changedAt TEXT NOT NULL DEFAULT (datetime(\'now\',\'localtime\'))') } catch {}
  try { db.run('ALTER TABLE products ADD COLUMN packageSpec TEXT NOT NULL DEFAULT \'\'') } catch {}
  try { db.run('ALTER TABLE products ADD COLUMN brand TEXT NOT NULL DEFAULT \'\'') } catch {}
  try { db.run('ALTER TABLE products ADD COLUMN stockQuantity REAL NOT NULL DEFAULT 0') } catch {}

  // ── Ensure default price table exists ──
  let defaultTable = queryOne('SELECT id FROM price_tables WHERE isDefault = 1')
  if (!defaultTable) {
    const r = run('INSERT INTO price_tables (name, isDefault) VALUES (?, 1)', ['默认价格表'])
    defaultTable = { id: r.lastInsertRowid }

    // Copy all base product prices into the default price table
    const products = queryAll('SELECT productCode, price FROM products')
    for (const p of products) {
      run(
        'INSERT OR IGNORE INTO price_table_items (priceTableId, productCode, price) VALUES (?, ?, ?)',
        [defaultTable.id, p.productCode, p.price]
      )
    }
  }

  // ── Migration: if any customer has priceTableId=0, assign them to default ──
  const orphans = queryAll('SELECT id FROM customers WHERE priceTableId = 0')
  for (const c of orphans) {
    run('UPDATE customers SET priceTableId = ? WHERE id = ?', [defaultTable.id, c.id])
  }

  // ── Seed default data (products & customers) ──
  const productCount = queryOne('SELECT COUNT(*) as count FROM products')?.count || 0
  if (productCount === 0) {
    seedDefaultData(defaultTable.id)
  }

  saveDb()
  console.log(`Database initialized at: ${dbPath}`)
}

function seedDefaultData(defaultTableId: number): void {
  // ── Products (价目表) ──
  const products: [string, string, string, string, string, string, number][] = [
    ['巧嘴婆', '90001', '油辣椒', '200g', '1x20', '件', 82.00],
    ['巧嘴婆', '90002', '牛肉末调味酱', '220g', '1x20', '件', 82.00],
    ['巧嘴婆', '90003', '辣子鸡调味酱', '220g', '1x20', '件', 82.00],
    ['巧嘴婆', '90004', '风味豆豉调味酱', '220g', '1x20', '件', 80.00],
    ['巧嘴婆', '90005', '油辣椒', '280g', '1x20', '件', 105.00],
    ['巧嘴婆', '90006', '牛肉末调味酱', '300g', '1x20', '件', 105.00],
    ['巧嘴婆', '90007', '辣子鸡调味酱', '300g', '1x20', '件', 105.00],
    ['巧嘴婆', '90008', '风味豆豉调味酱', '300g', '1x20', '件', 100.00],
    ['巧嘴婆', '90009', '油辣椒', '400g', '1x12', '件', 90.00],
    ['巧嘴婆', '90010', '牛肉末调味酱', '400g', '1x12', '件', 90.00],
    ['巧嘴婆', '90011', '辣子鸡调味酱', '400g', '1x12', '件', 90.00],
    ['巧嘴婆', '90012', '风味豆豉调味酱', '400g', '1x12', '件', 88.00],
    ['巧嘴婆', '90013', '袋装纯香米醋', '350ml', '1x30', '件', 18.00],
    ['巧嘴婆', '90014', '袋装天然好酱油', '350ml', '1x30', '件', 22.00],
    ['巧嘴婆', '90015', '壶装纯香米醋', '800ml', '1x12', '件', 31.00],
    ['巧嘴婆', '90016', '壶装老抽王', '800ml', '1x12', '件', 33.00],
    ['巧嘴婆', '90017', '壶装白醋', '800ml', '1x12', '件', 30.00],
    ['巧嘴婆', '90018', '桶装白醋', '5KG', '1x4', '件', 36.00],
    ['巧嘴婆', '90019', '大桶装米醋', '25KG', '', '桶', 33.00],
    ['巧嘴婆', '90020', '牛肉酱', '175g', '1x24', '件', 95.00],
    ['八鲜厨', '90021', '袋装纯香米醋', '350ml', '1x30', '件', 18.00],
    ['巧嘴婆', '90022', '五仁油辣椒', '400g', '1x12', '件', 90.00],
    ['巧嘴婆', '90050', '香酥翠叶', '108g', '1x16', '件', 100.00],
    ['解忧故里', '90060', '油辣椒240g', '1x20', '6.00', '件', 120.00],
    ['解忧故里', '90061', '五仁香辣酱240g', '1x20', '6.00', '件', 120.00],
    ['解忧故里', '90062', '蚕蛹辣酱260g', '1x20', '6.00', '件', 120.00],
    ['解忧故里', '90063', '牛肉辣酱260g', '1x20', '6.00', '件', 120.00],
    ['解忧故里', '90064', '豆豉辣酱260g', '1x20', '6.00', '件', 120.00],
    ['解忧故里', '90065', '干煸肉丝辣酱260g', '1x20', '6.00', '件', 120.00],
    ['解忧故里', '90066', '手工醋500ml', '1x12', '5.00', '件', 60.00],
    ['解忧故里', '90067', '熏醋500ml', '1x12', '5.00', '件', 60.00],
    ['解忧故里', '90068', '头道抽油500ml', '1x12', '8.00', '件', 96.00],
    ['解忧故里', '90069', '解忧故里红手提袋', '', '', '提', 48.00],
    ['解忧故里', '90070', '解忧酱园礼盒', '', '', '盒', 68.00],
  ]

  for (const [brand, code, name, spec, pkg, unit, price] of products) {
    run(
      'INSERT INTO products (brand, productCode, productName, specification, packageSpec, unit, price) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [brand, code, name, spec, pkg, unit, price]
    )
    // Also insert into default price table
    run(
      'INSERT INTO price_table_items (priceTableId, productCode, price) VALUES (?, ?, ?)',
      [defaultTableId, code, price]
    )
  }

  // ── Customers (客户信息) ──
  const customers: [string, string, string, string, string][] = [
    ['10001', '黄口张卫东', '安徽省宿州市萧县黄口镇', '', ''],
    ['10002', '丰县风雷批发部', '江苏省徐州市丰县县城', '', ''],
    ['10003', '萧县郝长军', '安徽省宿州市萧县县城', '', ''],
    ['10004', '沛县马林飞', '江苏省沛县', '', ''],
    ['10005', '新沂王秀华', '江苏省新沂市', '', ''],
    ['10006', '徐州小于', '徐州市民富园', '', ''],
    ['10007', '山西吨吨佳商贸', '山西省长治市', '', ''],
    ['10008', '徐州迦南农场', '铜山区三堡镇', '', ''],
    ['10009', '西安思念水饺', '陕西省西安市', '', ''],
    ['10010', '淮北相山诚信冷库', '淮北相山诚信冷库', '周老板', '15055093055'],
    ['10099', '零售客户', '零售', '', ''],
  ]

  for (const [code, name, address, contact, phone] of customers) {
    run(
      'INSERT INTO customers (code, name, address, contact, phone, remark, priceTableId) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, name, address, contact, phone, '', defaultTableId]
    )
  }

  console.log(`Seeded ${products.length} products and ${customers.length} customers`)
}

function saveDb(): void {
  if (db && dbPath) {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(dbPath, buffer)
  }
}

export function getDb(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export function persistDb(): void {
  saveDb()
}

// Helper: run a query and return all rows as objects
export function queryAll(sql: string, params: any[] = []): any[] {
  const stmt = getDb().prepare(sql)
  stmt.bind(params)
  const rows: any[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

// Helper: run a query and return first row as object
export function queryOne(sql: string, params: any[] = []): any | null {
  const rows = queryAll(sql, params)
  return rows.length > 0 ? rows[0] : null
}

// Helper: run an INSERT/UPDATE/DELETE and return info
export function run(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number } {
  const db = getDb()
  db.run(sql, params)
  const lastInsertRowid = (db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0] as number) || 0
  saveDb()
  return { changes: db.getRowsModified(), lastInsertRowid }
}

export function closeDatabase(): void {
  if (db) {
    saveDb()
    db.close()
    db = null
  }
}