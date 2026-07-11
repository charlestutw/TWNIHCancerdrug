#!/usr/bin/env node
/**
 * harvest-official.js — 為每個第九節條文找出「目前生效」的官方 PDF 並抽出全文
 *
 * 原理：條文 PDF 檔名格式 = <條文代碼>._<YYYYMMDD>.pdf，生效日一律為某月 1 日。
 *       每條文只有一份現行 PDF，故由新到舊掃描，命中即停。
 *
 * 產出：official-text.json  { "9.80": {file, eff, text}, ... }
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const UA = "Mozilla/5.0 (compatible; nhi-ch9-harvest/1.0)";
const PDF = (f) => `https://info.nhi.gov.tw/api/INAE3000/INAE3000S01/getPDF?DurgFileName=${f}`;
const OUT = path.join(__dirname, "official-text.json");
const PDFDIR = path.join(__dirname, "official-pdf");

const START_Y = 2026, START_M = 7;   // 由此往回掃
const END_Y = 2015;                  // 掃到此年為止
const CONC = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 由新到舊產生候選日期 */
function candidates() {
  const out = [];
  for (let y = START_Y; y >= END_Y; y--) {
    const mMax = y === START_Y ? START_M : 12;
    for (let m = mMax; m >= 1; m--) out.push(`${y}${String(m).padStart(2, "0")}01`);
  }
  return out;
}

async function tryFetch(file) {
  try {
    const res = await fetch(PDF(file), { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000 || buf.subarray(0, 4).toString() !== "%PDF") return null;
    return buf;
  } catch { return null; }
}

/** 對單一條文代碼，找出現行 PDF。找不到時退回上層條文（如 9.1.1 → 9.1） */
async function findClause(code) {
  const tryCodes = [code];
  const parts = code.split(".");
  if (parts.length > 2) tryCodes.push(parts.slice(0, -1).join(".")); // 9.1.1 → 9.1

  for (const c of tryCodes) {
    const base = c.endsWith(".") ? c : c + ".";
    for (const d of candidates()) {
      const f = `${base}_${d}.pdf`;
      const buf = await tryFetch(f);
      if (buf) return { file: f, eff: d, buf, matched: c };
      await sleep(60);
    }
  }
  return null;
}

function extractText(pdfPath) {
  try {
    return execFileSync("python3", ["-c", `
from pypdf import PdfReader
import sys
r=PdfReader(sys.argv[1])
print("\\n".join((p.extract_text() or "") for p in r.pages))
`, pdfPath], { encoding: "utf8", maxBuffer: 20e6 });
  } catch (e) { return ""; }
}

/** 清理抽出的文字：合併被硬換行切斷的行，保留條列結構 */
function cleanText(t) {
  return t
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l.length)
    .join("\n")
    // 行尾若非句末標點，且下一行不是新編號，視為同一句 → 接起來
    .replace(/([^。：；)\d])\n(?![0-9]+[.、(]|\([0-9一二三四五六七八九十]+\)|★)/g, "$1")
    .trim();
}

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "nhi-ch9-data.json"), "utf8"));
  const ids = data.drugs.map((d) => d.id);
  fs.mkdirSync(PDFDIR, { recursive: true });

  const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const todo = ids.filter((id) => !prev[id]);
  console.log(`共 ${ids.length} 條，已完成 ${ids.length - todo.length}，待處理 ${todo.length}\n`);

  const results = { ...prev };
  let done = 0;

  async function worker(queue) {
    while (queue.length) {
      const id = queue.shift();
      const hit = await findClause(id);
      done++;
      if (!hit) {
        results[id] = { file: null, eff: null, text: "" };
        console.log(`[${done}/${todo.length}] ✗ ${id} 找不到 PDF`);
      } else {
        const p = path.join(PDFDIR, `${id}.pdf`);
        fs.writeFileSync(p, hit.buf);
        const text = cleanText(extractText(p));
        results[id] = { file: hit.file, eff: hit.eff, matched: hit.matched, text };
        console.log(`[${done}/${todo.length}] ✓ ${id} → ${hit.file} (${text.length} 字)${hit.matched !== id ? " [上層條文]" : ""}`);
      }
      fs.writeFileSync(OUT, JSON.stringify(results, null, 2), "utf8"); // 隨做隨存，可中斷續跑
    }
  }

  const q = [...todo];
  await Promise.all(Array.from({ length: CONC }, () => worker(q)));

  const ok = Object.values(results).filter((r) => r.text).length;
  console.log(`\n完成：${ok}/${ids.length} 條取得官方原文`);
  const miss = Object.entries(results).filter(([, r]) => !r.text).map(([k]) => k);
  if (miss.length) console.log(`缺漏（需人工處理）：${miss.join(" ")}`);
})();
