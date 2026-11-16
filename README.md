# 商品装具调拨单打印工具

基于 Electron + React + TypeScript + Vite + SQLite 的 Windows 桌面应用程序，用于录入订单信息、添加商品明细、预览并打印"商品装具调拨单"。

## 技术栈

| 模块 | 技术 |
|------|------|
| 桌面框架 | Electron 33 |
| 前端框架 | React 18 |
| 语言 | TypeScript |
| 构建工具 | Vite 6 |
| 数据库 | SQLite (better-sqlite3) |
| 路由 | React Router 6 |
| 二维码 | qrcode |
| 打包 | electron-builder |

## 项目结构

```
order-print-tool/
├── electron/             # Electron 主进程
│   ├── main.ts           # 主进程入口
│   ├── preload.ts        # 预加载脚本（IPC 桥接）
│   ├── database.ts       # SQLite 数据库初始化
│   └── handlers.ts       # IPC 处理器（CRUD 操作）
├── src/                  # React 渲染进程
│   ├── main.tsx          # 应用入口
│   ├── App.tsx           # 路由配置
│   ├── index.css         # 全局样式
│   ├── types/            # TypeScript 类型定义
│   │   └── index.ts
│   ├── utils/            # 工具函数
│   │   └── ipc.ts        # IPC 调用封装
│   ├── components/       # 可复用组件
│   │   └── ConfirmDialog.tsx
│   ├── pages/            # 页面组件
│   │   ├── OrderList.tsx   # 订单列表页
│   │   ├── OrderEdit.tsx   # 订单编辑页
│   │   └── OrderPrint.tsx  # 打印预览页
│   └── styles/           # 样式文件
│       └── print.css     # 打印模板样式
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.electron.json
└── dev.bat
```

## 功能

1. **订单列表** - 查看所有订单，支持搜索（订单号、客户名称、交货号）
2. **新增/编辑订单** - 填写基础信息、添加商品明细、自动计算金额
3. **打印预览** - 生成符合"商品装具调拨单"格式的 A4 横向打印页面
4. **二维码** - 打印单自动生成含订单信息的二维码
5. **打印** - 调用系统打印，支持选择打印机
6. **打包 exe** - 可打包为 Windows 安装包

## 打印格式

- 标题：商品装具调拨单（22px 加粗居中）
- 基础信息区：日期、发货单位、电话、承运车号、出厂时间、订单号、收货单位、收货地址、吨位、里程
- 商品表格：序号、商品名称及规格（单位）、数量、单价、金额、签收意见
- 底部：合计数量、二维码、制单人、复核、承运人签字、收货人签字
- 联次说明：白色(1)-存根 红色-运费 蓝色-仓库 黄色-回执 绿色-客户留存 白色(2)-出门证
- 字体：SimSun/宋体
- 页尺寸：A4 landscape (@page { size: A4 landscape })

## 开发

### 环境要求

- Node.js >= 18
- npm >= 8

### 启动开发模式

```bash
# 方式 1：Windows 批处理（推荐）
双击 dev.bat

# 方式 2：手动
npm install
npx tsc -p tsconfig.electron.json
npx concurrently -k "vite" "wait-on tcp:5173 && electron ."
```

### 访问页面

开发模式下：
- Vite 开发服务器：http://localhost:5173
- Electron 窗口会自动打开

## 构建与打包

### 构建前端

```bash
npm run build:vite
```

### 编译 Electron 主进程

```bash
npx tsc -p tsconfig.electron.json
```

### 打包为 Windows exe

```bash
npm run electron:build
```

打包完成后，安装包位于 `release/` 目录下。

### 仅打包到目录（不压缩）

```bash
npm run electron:build:dir
```

## 数据库

使用 SQLite，数据库文件存储在用户数据目录：
- 开发环境：`%APPDATA%/order-print-tool/orders.db`
- 生产环境：`%APPDATA%/商品装具调拨单打印工具/orders.db`

## License

MIT