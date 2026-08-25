# Flow-Worker 專案指令

## ⚠️ 踩過的雷 — spread 覆蓋陷阱

`src/storage/job-store.ts` 的 `updateStatus` 函數曾經有 bug：

```typescript
// ❌ 錯誤寫法 — outputAssetIds 被硬寫回舊值
const updated = { ...existing, ...patch, status, updatedAt: ..., outputAssetIds: existing.outputAssetIds };

// ✅ 正確寫法 — patch 裡的值才能正確覆蓋
const updated = { ...existing, ...patch, status, updatedAt: ... };
```

### 教訓
- 物件展開 (`...patch`) 後面再寫同名屬性會覆蓋 patch 的值
- 如果你要保護某個欄位不被清空，不需要硬寫舊值 — 當 patch 沒帶該欄位時，`...existing` 已經提供預設值了
- 改完這類邏輯一定要跑測試：`npx vitest run`

---

## 專案結構速覽

| 目錄 | 幹嘛的 |
| --- | --- |
| `src/background/` | service-worker，處理 auto-flow 事件 |
| `src/flow/automation/` | 自動流程狀態機、批次協議 |
| `src/flow/dom/` | 操作 Flow 頁面 DOM 的適配器 |
| `src/flow/media/` | 結果擷取、素材觀察 |
| `src/storage/` | IndexedDB 存取層（job-store, asset-store） |
| `src/sidepanel/` | 側邊欄 UI（React） |
| `src/domain/` | 專案資料結構、門檻檢查 |

---

## 常用指令

```bash
# 跑全部測試
npx vitest run

# 只跑某個測試檔
npx vitest run src/storage/job-store.test.ts

# 打包
pnpm build
```

---

## 通用規則

- 改完 code 先跑測試，確認沒壞
- 用中文寫 commit message
- 改 `auto-flow-free.js` 記得同步改 `dist/` 裡的版本（或確認 build 流程會自動複製）