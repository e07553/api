# 手机支持 / 移动端适配更新记录

## 更新日期
2026-04-28

## 变更范围
frontend（Vue 3 SPA）

---

## 1. PWA 支持

**文件：**
- `frontend/index.html`
- `frontend/public/manifest.json`（新建）
- `frontend/public/icon.svg`（新建）

**内容：**
- 添加 `viewport-fit=cover` + `user-scalable=no`，适配 iPhone 刘海屏
- 添加 Apple PWA meta 标签（`apple-mobile-web-app-capable`、`apple-mobile-web-app-status-bar-style`）
- 添加 Web App Manifest，支持"添加到主屏幕"
- 创建 SVG 图标作为 PWA 图标占位

---

## 2. 底部安全区适配

**文件：** `frontend/src/assets/main.css`

**内容：**
- `padding-bottom: env(safe-area-inset-bottom)` — 适配 iPhone Home Bar
- `.pb-safe` class 用于移动端底部导航
- `.btn-sm` 间距微调（`px-3 py-1.5` → `px-2.5 py-1.5`）

---

## 3. Dashboard 统计卡片响应式

**文件：** `frontend/src/views/DashboardView.vue`

**内容：**
- 缩小间距：`gap-4` → `gap-3`，`p-4` → `p-3 sm:p-4`
- 字号响应式：`text-xs` → `text-[10px] sm:text-xs`

---

## 4. 日志筛选器响应式

**文件：** `frontend/src/views/LogsView.vue`

**内容：**
- 5列 → 3列（sm时3列，lg时恢复5列）
- `grid-cols-2 lg:grid-cols-5` → `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`

---

## 5. 按钮组 flex-wrap

**文件：**
- `frontend/src/views/DashboardView.vue`
- `frontend/src/views/ProvidersView.vue`
- `frontend/src/views/SettingsView.vue`
- `frontend/src/views/StrategiesView.vue`

**内容：**
- 多处 `flex gap-2` 改为 `flex flex-wrap gap-1.5`，防止小屏幕按钮溢出

---

## 6. 编辑模态框按钮固定（关键修复）

### Strategies（策略）编辑

**文件：** `frontend/src/views/StrategiesView.vue`

**改动：**
- 取消/保存按钮从模态框底部移到"选择供应商"标题**同一行右侧**
- 始终可见，不受滚动影响

```html
<!-- 修改前：按钮在模态框底部 -->
<div class="flex justify-end gap-2 mt-5">
  <button>取消</button>
  <button>保存</button>
</div>

<!-- 修改后：按钮在 Select Providers 同一行 -->
<div class="flex items-center justify-between mb-2">
  <label>选择供应商</label>
  <div class="flex gap-2">
    <button>取消</button>
    <button>保存</button>
  </div>
</div>
```

### Providers（供应商）编辑

**文件：** `frontend/src/views/ProvidersView.vue`

**改动：**
- 取消/保存按钮从模态框底部移到"供应商名称"标签**同一行右侧**

---

## Git 提交记录

```
d2fb405 Fix mobile: move cancel/save buttons next to provider name field
d5b4946 Fix mobile: move cancel/save buttons next to Select Providers header
80752d8 Add mobile/PWA support
```

---

## 部署服务器

| 服务器 | IP | 说明 |
|--------|-----|------|
| 主服务器 | 193.112.101.212:3060 | 已在运行 |
| 新服务器 | 43.155.130.168:3060 | 刚更新 |

---

## 注意事项

- `better-sqlite3` 需要在目标服务器执行 `npm rebuild better-sqlite3`
- PM2 需要在部署后执行 `pm2 save` 持久化
- 新服务器若端口被占用，需先停止旧进程（`pm2 stop akdn && pm2 delete akdn`）
