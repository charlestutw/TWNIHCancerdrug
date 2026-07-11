# 健保第九節抗癌瘤藥物速查表

全民健康保險藥品給付規定**第九節（抗癌瘤藥物 Antineoplastics）**的離線速查工具，
可在 iOS Safari「加入主畫面」離線使用，並自動同步本 repo 的最新資料。

> ⚠️ **免責**：本工具僅供臨床/行政查閱參考，最終給付認定一律以健保署正式公告為準。
> 其中 32 條標示「摘要（非原文）」者未經官方 PDF 逐字查證，使用前請自行核對。

---

## 檔案

| 檔案 | 作用 |
|---|---|
| `健保第九節抗癌藥物速查表.html` | 主程式（單一 HTML，離線可用，自動更新） |
| `nhi-ch9-data.json` | 資料檔（單一事實來源；HTML 自動抓取此檔） |
| `validate-data.js` | 資料驗證器，部署前必跑 |
| `harvest-official.js` | 從健保署 API 抓取官方條文 PDF 原文 |
| `monitor-nhi.js` | 每月偵測條文異動 |
| `clause-index.json` | 條文生效日快照（供 monitor 比對） |
| `official-text.json` | 已抓取的官方原文快取（供 harvest 續跑） |
| `JSON資料維護說明.md` | **維護者必讀**：欄位定義、更新流程、已知限制 |
| `.github/workflows/monthly-check.yml` | GitHub Actions：每月自動偵測並開 issue |

## 資料版本

- 目前版本：`2026-07b`
- 122 個藥品條目；其中 **90 條為官方條文原文**（逐字），32 條為人工摘要（健保署未發布獨立 PDF）
- 綠色徽章＝官方原文；黃色徽章＝摘要

## 使用（手機離線）

1. 下載 `健保第九節抗癌藥物速查表.html` 到手機
2. Safari 開啟 → 分享 → **加入主畫面**
3. 之後每次開啟會自動抓取本 repo 最新的 `nhi-ch9-data.json`；離線時使用內建/快取資料

## 自動更新原理

HTML 內 `REMOTE_DATA_URL` 指向：
```
https://raw.githubusercontent.com/charlestutw/TWNIHCancerdrug/main/nhi-ch9-data.json
```
更新資料只需改這份 JSON 並推進 `version`（如 `2026-07b` → `2026-09`），
所有裝置下次開啟即自動同步，**HTML 不必重發**。

> raw.githubusercontent.com 對公開 repo 提供穩定網址與 CORS 標頭，故 iOS Safari 可跨網域抓取。
> 新版可能因 CDN 快取延遲數分鐘生效。

## 更新資料的正確流程

```bash
# 1. 偵測官方是否有條文異動（需要時）
node monitor-nhi.js

# 2. 抓取官方原文（可中斷續跑）
node harvest-official.js

# 3. 編輯 nhi-ch9-data.json，推進 version

# 4. 驗證（必須零錯誤才可部署）
node validate-data.js nhi-ch9-data.json

# 5. commit + push；App 端自動同步
```

詳見 `JSON資料維護說明.md`。

## 資料來源

衛生福利部中央健康保險署　藥品給付規定第九節
條文原文取自 `info.nhi.gov.tw` 官方條文 PDF 端點。
