#!/usr/bin/env node
/**
 * build-extension.js — 由單一事實來源產生 Chrome 擴充功能的資料與版本號
 *
 * 為什麼需要這支：
 *   chrome-extension/data.json 是 nhi-ch9-data.json 的複本（擴充功能必須自帶離線資料）。
 *   兩份手動維護必然漂移，故一律由本腳本產生，不要手改。
 *
 * 用法：
 *   node build-extension.js          # 同步 data.json 與 manifest 版本號
 *   node build-extension.js --zip    # 另外打包成 nhi-ch9-chrome-extension.zip
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = __dirname;
const SRC = path.join(ROOT, "nhi-ch9-data.json");
const EXT = path.join(ROOT, "chrome-extension");
const DST = path.join(EXT, "data.json");
const MAN = path.join(EXT, "manifest.json");

const data = JSON.parse(fs.readFileSync(SRC, "utf8"));

// 1) 同步資料
fs.writeFileSync(DST, JSON.stringify(data, null, 2), "utf8");

// 2) 由資料版本推導 manifest 版本：2026-11 → 2026.11.0；2026-11b → 2026.11.2
const m = String(data.version || "").match(/^(\d{4})-(\d{2})([a-z])?$/);
if (!m) {
  console.error(`✗ 無法由 version "${data.version}" 推導 manifest 版本（需 YYYY-MM 或 YYYY-MMx）`);
  process.exit(1);
}
const patch = m[3] ? m[3].charCodeAt(0) - 96 : 0;   // a→1, b→2 …
const manifest = JSON.parse(fs.readFileSync(MAN, "utf8"));
manifest.version = `${m[1]}.${Number(m[2])}.${patch}`;
fs.writeFileSync(MAN, JSON.stringify(manifest, null, 2) + "\n", "utf8");

console.log(`✓ data.json 已同步（${data.drugs.length} 條，version ${data.version}）`);
console.log(`✓ manifest.json 版本 → ${manifest.version}`);

// 3) 選擇性打包
if (process.argv.includes("--zip")) {
  const zip = path.join(ROOT, "nhi-ch9-chrome-extension.zip");
  fs.rmSync(zip, { force: true });
  execFileSync("zip", ["-rq", zip, "chrome-extension"], { cwd: ROOT });
  console.log(`✓ 已打包 ${path.basename(zip)}（${(fs.statSync(zip).size / 1024).toFixed(0)} KB）`);
}
