#!/usr/bin/env node
/**
 * nhi-ch9-data.json 驗證器
 * 用法: node validate-data.js nhi-ch9-data.json
 * 退出碼 0 = 通過, 1 = 有錯誤
 */
const fs = require("fs");

const VALID_TYPES = ["TARGETED", "CHEMO", "HORMONE", "IMMUNO", "CART"];
const REQUIRED_KEYS = ["id", "name", "brand", "type", "cancers", "ind", "req", "verbatim", "eff", "src"];
const TOP_KEYS = ["version", "updated", "source", "groups", "drugs"];

// GROUPS 不再硬編碼於此。單一事實來源 = JSON 的 "groups" 欄位。
// HTML 與本驗證器都從該欄位讀取，因此不可能再互相漂移。
let GROUPS = {};
let MAPPED = new Set();

const errors = [];
const warnings = [];
const E = (m) => errors.push(m);
const W = (m) => warnings.push(m);

const path = process.argv[2] || "nhi-ch9-data.json";
let raw, data;

try {
  raw = fs.readFileSync(path, "utf8");
} catch (e) {
  console.error(`✗ 讀不到檔案: ${path}`);
  process.exit(1);
}

// 中文引號誤用偵測（在 parse 之前，因為會直接讓 parse 失敗）
if (/[“”]/.test(raw)) {
  E('偵測到中文引號 “ 或 ”，JSON 只能用半形 "');
}

try {
  data = JSON.parse(raw);
} catch (e) {
  console.error(`✗ JSON 語法錯誤: ${e.message}`);
  if (errors.length) errors.forEach((m) => console.error("  ✗ " + m));
  process.exit(1);
}

// ---- 頂層欄位 ----
for (const k of TOP_KEYS) {
  if (!(k in data)) E(`頂層缺少欄位 "${k}"`);
}
for (const k of Object.keys(data)) {
  if (!TOP_KEYS.includes(k)) W(`頂層有非預期的欄位 "${k}"`);
}
if (typeof data.version === "string" && !/^\d{4}-\d{2}[a-z]?$/.test(data.version)) {
  E(`version 格式應為 YYYY-MM 或 YYYY-MMx（目前: "${data.version}"）`);
}

// ---- groups 區塊（單一事實來源）----
if (typeof data.groups !== "object" || data.groups === null || Array.isArray(data.groups)) {
  E("groups 必須是物件（分群名稱 → 癌別標籤陣列）");
} else if (Object.keys(data.groups).length === 0) {
  E("groups 不可為空物件");
} else {
  GROUPS = data.groups;
  const seenTag = new Map();
  for (const [gname, tags] of Object.entries(GROUPS)) {
    if (!Array.isArray(tags) || tags.length === 0) {
      E(`groups["${gname}"] 必須是至少含 1 個元素的陣列`);
      continue;
    }
    if (gname === "全部") E('groups 不可使用保留名稱 "全部"（介面自動加入）');
    tags.forEach((t) => {
      if (typeof t !== "string" || !t.trim()) {
        E(`groups["${gname}"] 含空值`);
        return;
      }
      MAPPED.add(t);
      if (seenTag.has(t)) {
        W(`癌別標籤 "${t}" 同時出現在分群 "${seenTag.get(t)}" 與 "${gname}"，該藥品會被兩個鈕都篩到`);
      } else {
        seenTag.set(t, gname);
      }
    });
  }
}

if (!Array.isArray(data.drugs) || data.drugs.length === 0) {
  E("drugs 必須是非空陣列");
  report();
}

// ---- 逐筆藥品 ----
const seenIds = new Map();
const usedCancers = new Set();

data.drugs.forEach((d, i) => {
  const at = `drugs[${i}]${d && d.id ? ` (id=${d.id})` : ""}`;

  if (typeof d !== "object" || d === null || Array.isArray(d)) {
    E(`${at}: 必須是物件`);
    return;
  }

  // 必填欄位
  for (const k of REQUIRED_KEYS) {
    if (!(k in d)) E(`${at}: 缺少欄位 "${k}"`);
  }
  // 多餘欄位
  for (const k of Object.keys(d)) {
    if (!REQUIRED_KEYS.includes(k)) W(`${at}: 有非預期的欄位 "${k}"`);
  }

  // id
  if (typeof d.id !== "string" || !d.id.trim()) {
    E(`${at}: id 必須是非空字串`);
  } else {
    if (seenIds.has(d.id)) E(`${at}: id "${d.id}" 與 drugs[${seenIds.get(d.id)}] 重複`);
    else seenIds.set(d.id, i);
    if (!/^9(\.\d+)+$/.test(d.id)) W(`${at}: id "${d.id}" 不符 9.x / 9.x.y 慣例`);
  }

  // name
  if (typeof d.name !== "string" || !d.name.trim()) E(`${at}: name 必須是非空字串`);

  // brand
  if (typeof d.brand !== "string") {
    E(`${at}: brand 必須是字串（無商品名請填 ""，不可為 null 或省略）`);
  }

  // type
  if (!VALID_TYPES.includes(d.type)) {
    E(`${at}: type "${d.type}" 非法，只能是 ${VALID_TYPES.join(" / ")}`);
  }

  // cancers
  if (!Array.isArray(d.cancers) || d.cancers.length === 0) {
    E(`${at}: cancers 必須是至少含 1 個元素的陣列`);
  } else {
    d.cancers.forEach((c) => {
      if (typeof c !== "string" || !c.trim()) E(`${at}: cancers 含空值`);
      else usedCancers.add(c);
    });
    if (!d.cancers.some((c) => MAPPED.has(c))) {
      E(`${at}: 所有 cancers 標籤都不在任何分群中 → 此筆將無法用癌別鈕篩到 (${d.cancers.join(", ")})`);
    }
    d.cancers.filter((c) => !MAPPED.has(c)).forEach((c) => {
      W(`${at}: cancers "${c}" 是孤兒標籤（不屬於任何分群）`);
    });
  }

  // verbatim / eff / src
  if (typeof d.verbatim !== "boolean") {
    E(`${at}: verbatim 必須是 true/false`);
  } else if (d.verbatim) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.eff || "")) E(`${at}: verbatim 條文的 eff 應為 YYYY-MM-DD（目前 "${d.eff}"）`);
    if (!/\.pdf$/.test(d.src || "")) E(`${at}: verbatim 條文的 src 應為官方 PDF 檔名（目前 "${d.src}"）`);
    // 子條文的 PDF 常含上層標題（如 9.5.2 的檔案以 "9.5." 開頭），故只要文中出現該條文代碼即可
    if (!String(d.ind).includes(d.id)) W(`${at}: 官方原文未出現條文代碼 ${d.id}，請確認抓到正確 PDF`);
  } else {
    if (d.eff) W(`${at}: 非 verbatim 條文不應有 eff`);
    if (d.src) W(`${at}: 非 verbatim 條文不應有 src`);
  }

  // ind
  if (typeof d.ind !== "string" || !d.ind.trim()) {
    E(`${at}: ind 必須是非空字串`);
  } else if (!d.verbatim) {
    // 僅摘要條文適用排版規則；官方原文逐字保留，不得套用
    if (/;/.test(d.ind)) W(`${at}: 摘要 ind 含半形分號 ";"，應改用全形 "；"`);
    if (d.ind.includes("★") && !/\n★/.test(d.ind) && !d.ind.startsWith("★")) {
      W(`${at}: 摘要 ind 的 ★ 未置於換行後，排版可能不如預期`);
    }
  }

  // req
  if (typeof d.req !== "string" || !d.req.trim()) E(`${at}: req 必須是非空字串`);
});

// ---- 幽靈標籤 ----
[...MAPPED].filter((c) => !usedCancers.has(c)).forEach((c) => {
  W(`分群中的 "${c}" 在資料裡沒有任何藥品使用（幽靈標籤）`);
});

report();

function report() {
  console.log(`\n檔案: ${path}`);
  if (data && data.version) console.log(`版本: ${data.version}`);
  if (data && Array.isArray(data.drugs)) console.log(`藥品筆數: ${data.drugs.length}`);
  console.log("");

  if (warnings.length) {
    console.log(`⚠ 警告 ${warnings.length} 項（不阻擋，但建議處理）:`);
    warnings.forEach((m) => console.log("  ⚠ " + m));
    console.log("");
  }
  if (errors.length) {
    console.log(`✗ 錯誤 ${errors.length} 項（必須修正）:`);
    errors.forEach((m) => console.log("  ✗ " + m));
    console.log("");
    process.exit(1);
  }
  console.log("✓ 驗證通過，可以部署\n");
  process.exit(0);
}
