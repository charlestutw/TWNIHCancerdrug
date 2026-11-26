# 健保第九節抗癌瘤藥物速查表

全民健康保險藥品給付規定**第九節（抗癌瘤藥物 Antineoplastics）**的離線速查工具，
可在 iOS Safari「加入主畫面」離線使用，並自動同步本 repo 的最新資料。

> ⚠️ **免責**：本工具僅供臨床/行政查閱參考，最終給付認定一律以健保署正式公告為準。
> 全 144 條均採健保署官方條文原文逐字呈現，異動條文更新至 115/10/1。

---

## 檔案

| 檔案 | 作用 |
|---|---|
| `健保第九節抗癌藥物速查表.html` | 主程式（單一 HTML，離線可用，自動更新） |
| `nhi-ch9-data.json` | 資料檔（單一事實來源；HTML 自動抓取此檔） |
| `validate-data.js` | 資料驗證器，部署前必跑 |
| `harvest-official.js` | 從健保署 API 抓取官方條文 PDF 原文 |
| `sweep-clauses.js` | **每週偵測條文異動（全 144 條覆蓋）** |
| `monitor-nhi.js` | 已淘汰：舊的 API 偵測（僅涵蓋 7%），保留供參考 |
| `clause-index.json` | 舊 monitor 的生效日快照（已不再使用） |
| `official-text.json` | API 抓取的官方原文快取（僅涵蓋 90 條，已被 DOCX 全量取代，保留供比對） |
| `chrome-extension/` | **Chrome 擴充功能**（側邊欄常駐版） |
| `build-extension.js` | 由 `nhi-ch9-data.json` 產生擴充功能的 data.json 與版本號 |
| `JSON資料維護說明.md` | **維護者必讀**：欄位定義、更新流程、已知限制 |
| `.github/workflows/Weekly-check.yml` | GitHub Actions：每週五自動偵測，有異動開 issue（已有未結案則留言） |

## 資料版本

- 目前版本：`2026-11`
- **144 個藥品條目，全數為官方條文原文**（基礎為 `chap9_1150723.docx` 115/7/23 公告版；11 條異動更新至 115/9/1–115/10/1 官方條文 PDF）
- 介面全部顯示綠色「官方原文」徽章

## 使用（手機離線）

1. 下載 `健保第九節抗癌藥物速查表.html` 到手機
2. Safari 開啟 → 分享 → **加入主畫面**
3. 之後每次開啟會自動抓取本 repo 最新的 `nhi-ch9-data.json`；離線時使用內建/快取資料

## Chrome 擴充功能（側邊欄）

`chrome-extension/` 是同一套速查表的 Chrome 版，點工具列圖示會在右側開啟**側邊欄**，可邊看其他系統邊查；也可切換成全頁分頁。

安裝：解壓／取得資料夾後 → `chrome://extensions` → 開啟開發人員模式 → **載入未封裝項目** → 選 `chrome-extension/`。
詳見 `chrome-extension/安裝說明.md`。需 Chrome 114 以上。

權限只有 `storage`、`sidePanel` 與 `raw.githubusercontent.com`，不讀取任何網頁內容。

> ⚠️ `chrome-extension/data.json` 是 `nhi-ch9-data.json` 的複本（擴充功能需自帶離線資料），
> **不要手改**：一律執行 `node build-extension.js` 同步。
> `validate-data.js` 會在兩者不一致時直接報錯，避免悄悄漂移。

```bash
node build-extension.js          # 同步資料與 manifest 版本號
node build-extension.js --zip    # 另外打包成 zip
```

## 自動更新原理

HTML 內 `REMOTE_DATA_URL` 指向：
```
https://raw.githubusercontent.com/charlestutw/TWNIHCancerdrug/main/nhi-ch9-data.json
```
更新資料只需改這份 JSON 並推進 `version`（如 `2026-11` → `2026-12`），
所有裝置下次開啟即自動同步，**HTML 不必重發**。

> raw.githubusercontent.com 對公開 repo 提供穩定網址與 CORS 標頭，故 iOS Safari 可跨網域抓取。
> 新版可能因 CDN 快取延遲數分鐘生效。

## 更新資料的正確流程

```bash
# 1. 偵測官方是否有條文異動（需要時）
node sweep-clauses.js

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
條文原文取自官方 Word 公告 `chap9_1150723.docx`（115/7/23）與官方條文 PDF（異動條文，至 115/10/1）；
每月異動偵測另輔以 `info.nhi.gov.tw` 開放資料 API。
