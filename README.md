# 健保第九節抗癌瘤藥物速查表

全民健康保險藥品給付規定**第九節（抗癌瘤藥物 Antineoplastics）**的離線速查工具，
可在 iOS Safari「加入主畫面」離線使用，並自動同步本 repo 的最新資料。

> ⚠️ **免責**：本工具僅供臨床/行政查閱參考，最終給付認定一律以健保署正式公告為準。
> 全 140 條均採健保署官方條文原文（115/6/23 公告版）逐字呈現。

---

## 檔案

| 檔案 | 作用 |
|---|---|
| `健保第九節抗癌藥物速查表.html` | 主程式（單一 HTML，離線可用，自動更新） |
| `nhi-ch9-data.json` | 資料檔（單一事實來源；HTML 自動抓取此檔） |
| `validate-data.js` | 資料驗證器，部署前必跑 |
| `harvest-official.js` | 從健保署 API 抓取官方條文 PDF 原文 |
| `monitor-nhi.js` | 偵測條文異動（由排程每週執行，亦可手動跑） |
| `clause-index.json` | 條文生效日快照（供 monitor 比對） |
| `official-text.json` | API 抓取的官方原文快取（僅涵蓋 90 條，已被 DOCX 全量取代，保留供比對） |
| `JSON資料維護說明.md` | **維護者必讀**：欄位定義、更新流程、已知限制 |
| `.github/workflows/weekly-check.yml` | GitHub Actions：每週自動偵測並開 issue 通知 |

## 資料版本

- 目前版本：`2026-07d`
- **140 個藥品條目，全數為官方條文原文**（逐字，來源 `chap9_1150623.docx`，115/6/23 公告版）
- 介面全部顯示綠色「官方原文」徽章

## 使用（手機離線）

1. 下載 `健保第九節抗癌藥物速查表.html` 到手機
2. Safari 開啟 → 分享 → **加入主畫面**
3. 之後每次開啟會自動抓取本 repo 最新的 `nhi-ch9-data.json`；離線時使用內建/快取資料

## 自動更新原理

HTML 內 `REMOTE_DATA_URL` 指向：
```
https://raw.githubusercontent.com/charlestutw/TWNIHCancerdrug/main/nhi-ch9-data.json
```
更新資料只需改這份 JSON 並推進 `version`（如 `2026-07d` → `2026-09`），
所有裝置下次開啟即自動同步，**HTML 不必重發**。

> raw.githubusercontent.com 對公開 repo 提供穩定網址與 CORS 標頭，故 iOS Safari 可跨網域抓取。
> 新版可能因 CDN 快取延遲數分鐘生效。

## 自動異動偵測（GitHub Actions）

`.github/workflows/weekly-check.yml` 於**每週六台灣時間清晨 07:05**（週五 23:05 UTC）自動執行：

1. `validate-data.js` 確認現有資料仍合法
2. `monitor-nhi.js --fetch-text` 比對官方條文生效日
3. **偵測到異動時**：
   - 若已有開著的 `nhi-update` issue（前次異動尚未處理完）→ 在該 issue **留言**附上本次偵測報告，不重複開單
   - 若沒有 → 開新 issue，附偵測報告與待辦清單
4. 異動快照與官方 PDF 自動 commit 回 repo（`clause-text/`、`monitor-report.txt`）

> ⚠ 偵測到異動**不代表資料已自動更新** —— 仍需人工或 AI 判讀官方 PDF 後修改
> `nhi-ch9-data.json`，依 issue 內的待辦清單逐項完成。
>
> ⚠ 本監測僅涵蓋開放資料中帶有 `PAY_CODE` 的條文（目前約 10 / 118 條，多為口服藥）。
> 注射劑與多數標靶／免疫藥品不在其中，仍須人工核對健保署公告。

也可隨時在 Actions 頁面以 `workflow_dispatch` 手動觸發。
（注意：公開 repo 若 60 天無任何 commit，GitHub 會自動停用排程，需至 Actions 頁面重新啟用。）

## 更新資料的正確流程

```bash
# 1. 偵測官方是否有條文異動（排程已每週自動跑，需要時可手動）
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

衛生福利部中央健康保險署　藥品給付規定第九節（115/6/23 公告版）
條文原文取自官方 Word 公告 `chap9_1150623.docx`；
每週異動偵測另輔以 `info.nhi.gov.tw` 開放資料 API。
