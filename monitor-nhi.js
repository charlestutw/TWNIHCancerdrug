#!/usr/bin/env node
/**
 * monitor-nhi.js — 健保第九節條文異動偵測器
 *
 * 做什麼：
 *   1. 從健保署開放資料 API 撈「健保用藥品項」全表（每月更新）
 *   2. 取出所有第九節（PAY_CODE 以 9. 開頭）的條文代碼
 *   3. 每個條文對應一份官方 PDF，檔名內含生效日期（如 9.22._20240601.pdf）
 *   4. 與上次快照 clause-index.json 比對，找出：新增條文 / 生效日變動 / 消失的條文
 *   5. 有異動 → 印出報告、退出碼 1（供 CI 判斷是否開 issue）
 *
 * 做不到什麼（誠實說明）：
 *   本腳本偵測「哪一條被改了」，不會自動改寫 nhi-ch9-data.json 的 ind/req 文字。
 *   把官方條文濃縮成速查表用語需要人（或 AI）判讀，見 README 的人工步驟。
 *
 * 用法：
 *   node monitor-nhi.js              # 比對並報告
 *   node monitor-nhi.js --init       # 首次建立快照（不報異動）
 *   node monitor-nhi.js --fetch-text # 另外抓取異動條文的 PDF 全文到 clause-text/
 *
 * 需求：Node 18+（內建 fetch）。無第三方套件。
 */

const fs = require("fs");
const path = require("path");

const RESOURCE_ID = "A21030000I-E41001-001"; // 健保用藥品項（每月更新）
const API = `https://info.nhi.gov.tw/api/iode0010/v1/rest/datastore/${RESOURCE_ID}`;
const UA = "Mozilla/5.0 (compatible; nhi-ch9-monitor/1.0)";
const PAGE = 1000;
const MAX_PAGES = 60; // 安全上限，避免無限迴圈
const INDEX_FILE = path.join(__dirname, "clause-index.json");
const TEXT_DIR = path.join(__dirname, "clause-text");

const argv = process.argv.slice(2);
const INIT = argv.includes("--init");
const FETCH_TEXT = argv.includes("--fetch-text");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === tries) throw e;
      await sleep(1000 * i);
    }
  }
}

/** 撈完整品項表，以 Q1_ID 去重 */
async function fetchAllRecords() {
  const seen = new Map();
  for (let p = 0; p < MAX_PAGES; p++) {
    const url = `${API}?limit=${PAGE}&offset=${p * PAGE}`;
    const j = await getJSON(url);
    const recs = (j && j.result && j.result.records) || [];
    if (!recs.length) break;
    let fresh = 0;
    for (const r of recs) {
      if (r.Q1_ID && !seen.has(r.Q1_ID)) { seen.set(r.Q1_ID, r); fresh++; }
    }
    process.stderr.write(`  page ${p + 1}: +${fresh} 新品項 (累計 ${seen.size})\n`);
    if (recs.length < PAGE) break;
  }
  return [...seen.values()];
}

/** PAY_CODE 可能是 "9.22." 或 "1.1.8.,1.2.1."，拆出第九節代碼 */
function ninthCodes(payCode) {
  return String(payCode || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^9\./.test(s));
}

/** 從 PAYCODE_URL_LIST 抽出 {code -> {file, date}} */
function parseUrlList(urlList) {
  const out = {};
  const re = /DurgFileName=(\d+(?:\.\d+)*\.)_?(\d{8})?\.pdf/g;
  let m;
  while ((m = re.exec(String(urlList || "")))) {
    const code = m[1];
    if (!/^9\./.test(code)) continue;
    out[code] = { file: m[0].replace("DurgFileName=", ""), date: m[2] || "" };
  }
  return out;
}

function buildIndex(records) {
  const idx = {}; // code -> {date, file, ingredients:[], items:n}
  for (const r of records) {
    const codes = ninthCodes(r.PAY_CODE);
    if (!codes.length) continue;
    const urls = parseUrlList(r.PAYCODE_URL_LIST);
    for (const c of codes) {
      if (!idx[c]) idx[c] = { date: "", file: "", ingredients: [], items: 0 };
      idx[c].items++;
      const ing = (r.CLASSGROUPNAME || "").trim();
      if (ing && !idx[c].ingredients.includes(ing) && idx[c].ingredients.length < 8) {
        idx[c].ingredients.push(ing);
      }
      if (urls[c]) {
        // 取最新的生效日
        if (!idx[c].date || urls[c].date > idx[c].date) {
          idx[c].date = urls[c].date;
          idx[c].file = urls[c].file;
        }
      }
    }
  }
  for (const c of Object.keys(idx)) idx[c].ingredients.sort();
  return idx;
}

function diffIndex(oldIdx, newIdx) {
  const added = [], changed = [], removed = [];
  for (const c of Object.keys(newIdx)) {
    if (!(c in oldIdx)) added.push(c);
    else if (oldIdx[c].date !== newIdx[c].date) {
      changed.push({ code: c, from: oldIdx[c].date, to: newIdx[c].date });
    }
  }
  for (const c of Object.keys(oldIdx)) if (!(c in newIdx)) removed.push(c);
  return { added: added.sort(), changed, removed: removed.sort() };
}

async function fetchClauseText(file, code) {
  const url = `https://info.nhi.gov.tw/api/INAE3000/INAE3000S01/getPDF?DurgFileName=${file}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(TEXT_DIR, { recursive: true });
  const out = path.join(TEXT_DIR, `${code}pdf`.replace(/\.pdf$/, "") + ".pdf");
  fs.writeFileSync(out, buf);
  return out;
}

(async () => {
  console.log("正在抓取健保署開放資料（健保用藥品項）…");
  const records = await fetchAllRecords();
  console.log(`✓ 取得 ${records.length} 筆唯一品項\n`);

  const newIdx = buildIndex(records);
  const codes = Object.keys(newIdx).sort();
  console.log(`✓ 偵測到 ${codes.length} 個第九節條文代碼`);
  console.log(`  ${codes.join(" ")}\n`);

  if (INIT || !fs.existsSync(INDEX_FILE)) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(newIdx, null, 2), "utf8");
    console.log(`✓ 已建立初始快照 ${INDEX_FILE}`);
    console.log("  下次執行才會開始比對異動。");
    process.exit(0);
  }

  const oldIdx = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  const { added, changed, removed } = diffIndex(oldIdx, newIdx);
  const total = added.length + changed.length + removed.length;

  if (!total) {
    console.log("✓ 無異動。nhi-ch9-data.json 不需更新。");
    process.exit(0);
  }

  console.log("=".repeat(56));
  console.log(`⚠ 偵測到 ${total} 項異動，nhi-ch9-data.json 可能需要更新`);
  console.log("=".repeat(56) + "\n");

  if (changed.length) {
    console.log(`【條文修訂】${changed.length} 條（生效日改變）`);
    for (const c of changed) {
      console.log(`  ${c.code.padEnd(10)} ${c.from || "(無)"} → ${c.to}`);
      console.log(`    成分: ${newIdx[c.code].ingredients.slice(0, 3).join(", ") || "—"}`);
    }
    console.log("");
  }
  if (added.length) {
    console.log(`【新增條文】${added.length} 條`);
    for (const c of added) {
      console.log(`  ${c.padEnd(10)} 生效日 ${newIdx[c].date || "—"}`);
      console.log(`    成分: ${newIdx[c].ingredients.slice(0, 3).join(", ") || "—"}`);
    }
    console.log("");
  }
  if (removed.length) {
    console.log(`【消失條文】${removed.length} 條（可能已刪除或改代碼，需人工確認）`);
    removed.forEach((c) => console.log(`  ${c}`));
    console.log("");
  }

  if (FETCH_TEXT) {
    console.log("正在下載異動條文的官方 PDF…");
    const targets = [...changed.map((c) => c.code), ...added];
    for (const c of targets) {
      const f = newIdx[c].file;
      if (!f) { console.log(`  ${c}: 無 PDF 連結，略過`); continue; }
      try {
        const p = await fetchClauseText(f, c);
        console.log(`  ✓ ${c} → ${path.basename(p)}`);
      } catch (e) {
        console.log(`  ✗ ${c}: ${e.message}`);
      }
      await sleep(400); // 對政府網站客氣一點
    }
    console.log("");
  }

  console.log("下一步（人工／AI 判讀，無法自動化）：");
  console.log("  1. 閱讀上列條文的官方 PDF");
  console.log("  2. 更新 nhi-ch9-data.json 對應藥品的 ind / req");
  console.log("  3. 推進 version（如 2025-06b → 2025-09）");
  console.log("  4. node validate-data.js nhi-ch9-data.json  ← 必須零錯誤");
  console.log("  5. 更新 clause-index.json 快照後 commit\n");

  // 供 CI 讀取
  if (process.env.GITHUB_OUTPUT) {
    const summary = [
      changed.length ? `修訂 ${changed.map((c) => c.code).join(" ")}` : "",
      added.length ? `新增 ${added.join(" ")}` : "",
      removed.length ? `消失 ${removed.join(" ")}` : "",
    ].filter(Boolean).join("；");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=true\nsummary=${summary}\n`);
  }
  // 寫入新快照供 CI commit（人工確認後才生效）
  fs.writeFileSync(INDEX_FILE + ".new", JSON.stringify(newIdx, null, 2), "utf8");
  console.log(`新快照已寫入 ${INDEX_FILE}.new（確認後改名覆蓋）`);
  process.exit(1);
})().catch((e) => {
  console.error("✗ 執行失敗:", e.message);
  process.exit(2);
});
