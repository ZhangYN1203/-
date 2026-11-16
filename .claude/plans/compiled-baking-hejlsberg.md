# 拆分价格管理页面为商品管理 + 客户管理

## 问题
当前 `PriceManager.tsx` 把价格表管理、商品管理、客户管理混在一起，页面混乱。

## 方案
拆分出三个独立页面，每个聚焦一个功能：

| 路由 | 页面 | 功能 |
|------|------|------|
| `/` | OrderList | 右上角按钮改为：新建订单、商品管理、客户管理 |
| `/product-manager` | ProductManager (新) | 选择价格表 → 管理商品和价格 |
| `/customer-manager` | CustomerManager (新) | 管理客户信息 |

## 改动步骤

### 1. 后端：新增 `getCustomersByPriceTableId` 函数
**文件：** `electron/handlers.ts`（在 `getCustomerById` 后面加）
- 查询指定价格表下有哪些客户，用于删除价格表时提示受影响客户
- 同时需要在 `electron/main.ts`、`electron/preload.ts`、`src/types/index.ts`、`src/utils/ipc.ts` 添加对应的 IPC 桥接

### 2. 新建 `src/pages/ProductManager.tsx`
从 PriceManager 提取出：
- 价格表选择（选项卡形式）、创建/重命名/删除
- 删除价格表时，查询受影响的客户并列表提示，确认后删除并将客户切换到默认价格表
- 价格明细表（显示商品价格，可内联编辑）
- 添加/移除价格表商品
- 修改记录查看
- 商品目录管理（编辑/删除基础商品）
- 添加新商品到目录

### 3. 新建 `src/pages/CustomerManager.tsx`
从 PriceManager 提取出：
- 客户列表搜索
- 新增/编辑/删除客户（含价格表选择下拉框）
- 不加载价格数据，只管理客户信息

### 4. 修改 `src/App.tsx`
- 新增 `/product-manager` 和 `/customer-manager` 路由
- 移除 `/price-manager` 路由

### 5. 修改 `src/pages/OrderList.tsx`
- 右上角按钮改为三个：新建订单、商品管理(`/product-manager`)、客户管理(`/customer-manager`)

### 6. 修改 `src/pages/OrderEdit.tsx`
- 两处 `navigate('/price-manager')` 改为 `navigate('/product-manager')`

### 7. 删除 `src/pages/PriceManager.tsx`
- 不再使用

## 验证方式
1. 启动应用，主页右上角看到"商品管理"和"客户管理"按钮
2. 点击"商品管理" → 选择价格表 → 看到商品列表，可编辑价格
3. 点击"客户管理" → 搜索/新增/编辑/删除客户
4. 删除非默认价格表时弹出受影响客户列表提示