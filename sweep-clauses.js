#!/usr/bin/env node
/**
 * sweep-clauses.js — 第九節條文異動偵測（全條文覆蓋）
 *
 * 做什麼：
 *   對 nhi-ch9-data.json 中「每一條」條文，直接向健保署條文 PDF 端點探測是否存在
 *   比現有生效日更新的版本；並探測編號更大的全新條文。
 *
 * 為什麼不用 monitor-nhi.js：
 *   那支靠開放資料 API 的 PAY_CODE 欄位，實測只涵蓋 144 條中的 10 條（約 7%），
 *   115/9～10 月那一輪 11 條真實異動它一條都沒抓到。本腳本涵蓋 100%。
 *
 * 原理：
 *   條文 PDF 檔名為 <條文代碼>._<YYYYMMDD>.pdf，生效日一律為某月 1 日。
 *   比對基準＝nhi-ch9-data.json 各條的 eff（單一事實來源，不需另存快照）。
 *   探測視窗＝[資料版本的月份, 今天+3 個月]，故視窗隨每次更新自動收斂。
 *
 * 用法：
 *   node sweep-clauses.js                # 偵測並報告（有異動退出碼 1）
 *   node sweep-clauses.js --fetch-text   # 另把異動條文 PDF 存到 clause-text/
 *
 * 做不到什麼（誠實說明）：
 *   本腳本偵測「哪一條被改了」，不會自動改寫 ind/req。
 *   把官方條文落成資料仍需人或 AI 判讀，見 JSON資料維護說明.md。
 */
const fs = require("fs");
const path = require("path");

const UA = "Mozilla/5.0 (compatible; nhi-ch9-sweep/1.0)";
const PDF = (f) => `https://info.nhi.gov.tw/api/INAE3000/INAE3000S01/getPDF?DurgFileName=${f}`;
const DATA = path.join(__dirname, "nhi-ch9-data.json");
const TEXT_DIR = path.join(__dirname, "clause-text");
const FETCH_TEXT = process.argv.includes("--fetch-text");

const CONC = 6;            // 併發數（對政府主機客氣一點）
const AHEAD_MONTHS = 3;    // 往未來探測幾個月（公告常提前生效）
const NEW_PROBE = 8;       // 往後探測幾個新條文編號

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 產生探測用的月初日期（新到舊），範圍 [startYM, 今天+AHEAD_MONTHS] */
function candidateDates(startYM) {
  const [sy, sm] = startYM.split("-").map(Number);
  const now = new Date();
  let ey = now.getUTCFullYear();
  let em = now.getUTCMonth() + 1 + AHEAD_MONTHS;
  while (em > 12) { em -= 12; ey += 1; }
  const out = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}${String(m).padStart(2, "0")}01`);
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out.reverse(); // 新 → 舊
}

async function fetchPdf(file) {
  try {
    const res = await fetch(PDF(file), { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000 || buf.subarray(0, 4).toString() !== "%PDF") return null;
    return buf;
  } catch { return null; }
}

/** 找出該條文在探測視窗內最新的 PDF */
async function newestIn(id, dates) {
  const base = id.endsWith(".") ? id : id + ".";
  for (const d of dates) {
    const f = `${base}_${d}.pdf`;
    const buf = await fetchPdf(f);
    if (buf) return { file: f, eff: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, buf };
    await sleep(40);
  }
  return null;
}

async function runPool(tasks) {
  const q = [...tasks];
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (q.length) await q.shift()();
  }));
}

(async () => {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const startYM = /^\d{4}-\d{2}/.test(data.version || "") ? data.version.slice(0, 7) : "2026-01";
  const dates = candidateDates(startYM);

  console.log(`資料版本 ${data.version}｜條文數 ${data.drugs.length}`);
  console.log(`探測視窗：${dates[dates.length - 1]} … ${dates[0]}（共 ${dates.length} 個月）\n`);

  const revised = [], added = [], noBaseline = [];

  // ---- 既有條文 ----
  await runPool(data.drugs.map((d) => async () => {
    if (!d.eff) { noBaseline.push(d.id); return; }
    const hit = await newestIn(d.id, dates);
    if (hit && hit.eff > d.eff) revised.push({ id: d.id, name: d.name, from: d.eff, to: hit.eff, file: hit.file, buf: hit.buf });
  }));

  // ---- 全新條文（編號大於現有最大者）----
  const maxN = Math.max(...data.drugs.map((d) => Number(d.id.split(".")[1]) || 0));
  const probeIds = Array.from({ length: NEW_PROBE }, (_, i) => `9.${maxN + 1 + i}`);
  await runPool(probeIds.map((id) => async () => {
    const hit = await newestIn(id, dates);
    if (hit) added.push({ id, to: hit.eff, file: hit.file, buf: hit.buf });
  }));

  revised.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  added.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  // ---- 報告 ----
  if (noBaseline.length) {
    console.log(`註：${noBaseline.join(" ")} 無生效日基準（官方原文標題未標日期），未納入自動比對。\n`);
  }

  const total = revised.length + added.length;
  if (!total) {
    console.log("✓ 無異動。nhi-ch9-data.json 不需更新。");
    process.exit(0);
  }

  console.log("=".repeat(56));
  console.log(`⚠ 偵測到 ${total} 項異動，nhi-ch9-data.json 需要更新`);
  console.log("=".repeat(56) + "\n");

  if (revised.length) {
    console.log(`【條文修訂】${revised.length} 條`);
    revised.forEach((r) => console.log(`  ${r.id.padEnd(9)} ${r.name || ""}  ${r.from} → ${r.to}`));
    console.log("");
  }
  if (added.length) {
    console.log(`【新增條文】${added.length} 條`);
    added.forEach((a) => console.log(`  ${a.id.padEnd(9)} 生效日 ${a.to}（${a.file}）`));
    console.log("");
  }

  if (FETCH_TEXT) {
    fs.mkdirSync(TEXT_DIR, { recursive: true });
    for (const r of [...revised, ...added]) {
      fs.writeFileSync(path.join(TEXT_DIR, `${r.id}.pdf`), r.buf);
    }
    console.log(`官方 PDF 已存入 clause-text/（${revised.length + added.length} 份）\n`);
  }

  console.log("下一步（人工／AI 判讀，無法自動化）：");
  console.log("  1. 閱讀 clause-text/ 下的官方 PDF");
  console.log("  2. 更新 nhi-ch9-data.json 對應條文的 ind / eff / src / req");
  console.log("  3. 推進 version（如 2026-11 → 2026-12）");
  console.log("  4. 同步兩個 HTML 的 EMBEDDED_SEED");
  console.log("  5. node validate-data.js nhi-ch9-data.json  ← 必須零錯誤");
  console.log("  6. commit + push 到 main（raw 網址即為 App 的更新來源）\n");

  if (process.env.GITHUB_OUTPUT) {
    const summary = [
      revised.length ? `修訂 ${revised.map((r) => r.id).join(" ")}` : "",
      added.length ? `新增 ${added.map((a) => a.id).join(" ")}` : "",
    ].filter(Boolean).join("；");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=true\nsummary=${summary}\n`);
  }
  process.exit(1);
})().catch((e) => {
  console.error("✗ 執行失敗:", e.message);
  process.exit(2);
});
