
const TYPES={
  CHEMO:{label:"化療",color:"#4A6FA5"},
  TARGETED:{label:"標靶",color:"#2E8B57"},
  IMMUNO:{label:"免疫",color:"#8B4A9E"},
  HORMONE:{label:"荷爾蒙",color:"#C0842B"},
  CART:{label:"CAR-T",color:"#B03A2E"}
};

/* 癌別分群現在由 JSON 的 "groups" 欄位提供（單一事實來源）。
   FALLBACK_GROUPS 僅在遠端 JSON 缺少 groups 欄位時作為保險，避免介面壞掉。 */
const FALLBACK_GROUPS={
  "肺癌":["肺癌"],
  "乳癌":["乳癌"],
  "血液/淋巴":["白血病","淋巴瘤","骨髓瘤","骨髓增生不良","骨髓纖維化"],
  "消化道":["大腸直腸癌","胃癌","食道癌","胰臟癌","膽道癌","GIST","胰臟神經內分泌腫瘤"],
  "婦科/泌尿":["卵巢癌","子宮頸癌","泌尿道上皮癌","膀胱癌"],
  "攝護腺癌":["攝護腺癌"],
  "肝/腎細胞癌":["肝細胞癌","腎細胞癌"],
  "頭頸癌":["頭頸癌"],
  "皮膚/其他":["黑色素瘤","甲狀腺癌","神經母細胞瘤","神經纖維瘤","腦腫瘤","惡性積液","間皮瘤","多種實體腫瘤","結節性硬化症","軟組織肉瘤","卡波西肉瘤","其他"]
};
let GROUPS={};

/* 雲端資料網址（追蹤 main 分支最新版）。
   改這條時，manifest.json 的 host_permissions 也要一起改，否則擴充功能無權連線。 */
const REMOTE_DATA_URL = "https://raw.githubusercontent.com/charlestutw/TWNIHCancerdrug/main/nhi-ch9-data.json";
let D=[];
let META={version:"",updated:"",source:"",src:"seed"};

// Build DOM
let expanded=null,curGroup="全部",curType="全部",curQ="",curMode="full";

function matches(d){
  const q=curQ.toLowerCase().trim();
  const gm=curGroup==="全部"||(GROUPS[curGroup]||[]).some(c=>d.cancers.includes(c));
  const tm=curType==="全部"||d.type===curType;
  let sm;
  if(!q){
    sm=true;
  } else if(curMode==="name"){
    // 精確搜尋：只比對藥品學名與商品名
    sm=d.name.toLowerCase().includes(q)||(d.brand||"").toLowerCase().includes(q);
  } else {
    // 全文搜尋：藥名、商品名、條文號碼、癌別、適應症、申請條件
    sm=d.name.toLowerCase().includes(q)
      ||(d.brand||"").toLowerCase().includes(q)
      ||d.id.includes(q)
      ||d.ind.toLowerCase().includes(q)
      ||(d.req||"").toLowerCase().includes(q)
      ||d.cancers.some(c=>c.toLowerCase().includes(q));
  }
  return gm&&tm&&sm;
}

// 高亮命中的關鍵字（先轉義 HTML，避免注入）
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function hl(text){
  const t=esc(text||"");
  const q=curQ.trim();
  if(!q) return t;
  const re=new RegExp("("+q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+")","gi");
  return t.replace(re,"<mark>$1</mark>");
}

function buildGroupChips(){
  const row=document.getElementById("group-chips");
  row.innerHTML="";
  ["全部",...Object.keys(GROUPS)].forEach(g=>{
    const b=document.createElement("button");
    b.className="chip"+(curGroup===g?" active":"");
    b.textContent=g;
    b.onclick=()=>{curGroup=g;expanded=null;render()};
    row.appendChild(b);
  });
}

function buildTypeChips(){
  const row=document.getElementById("type-chips");
  [{key:"全部",label:"全部類型",color:"#6B7C93"},...Object.entries(TYPES).map(([k,v])=>({key:k,...v}))].forEach(t=>{
    const b=document.createElement("button");
    b.className="type-chip";
    b.textContent=t.label;
    b.style.borderColor=curType===t.key?t.color:"#D0D8E8";
    b.style.background=curType===t.key?t.color:"#fff";
    b.style.color=curType===t.key?"#fff":t.color;
    b.style.fontWeight=curType===t.key?"700":"400";
    b.onclick=()=>{curType=t.key;expanded=null;render()};
    row.appendChild(b);
  });
}

function indLines(d){
  if(d.verbatim){
    // 官方原文：逐字呈現，只做 HTML 轉義並保留換行，不得改寫或加項目符號
    return esc(d.ind);
  }
  // 摘要條文：沿用舊的「；→ 條列」排版
  return esc(d.ind).replace(/；/g,"\n• ").replace(/^/,"• ").replace(/★/g,"<b style='color:#C0842B'>★</b>");
}

function render(){
  // Update group chips
  document.getElementById("group-chips").querySelectorAll(".chip").forEach(b=>{
    b.className="chip"+(b.textContent===curGroup?" active":"");
  });
  // Update type chips
  const tkeys=["全部",...Object.keys(TYPES)];
  document.getElementById("type-chips").querySelectorAll(".type-chip").forEach((b,i)=>{
    const t=i===0?{color:"#6B7C93"}:TYPES[Object.keys(TYPES)[i-1]];
    const active=tkeys[i]===curType;
    b.style.borderColor=active?t.color:"#D0D8E8";
    b.style.background=active?t.color:"#fff";
    b.style.color=active?"#fff":t.color;
    b.style.fontWeight=active?"700":"400";
  });

  const list=document.getElementById("list");
  const filtered=D.filter(matches);
  document.getElementById("count").textContent="共 "+filtered.length+" 筆藥品";

  if(!filtered.length){
    list.innerHTML='<div class="empty">找不到符合條件的藥品</div>';
    return;
  }
  list.innerHTML="";
  filtered.forEach(d=>{
    const ti=TYPES[d.type];
    const isOpen=expanded===d.id;
    const card=document.createElement("div");
    card.className="card"+(isOpen?" open":"");
    if(isOpen)card.style.borderColor=ti.color;

    const tags=d.cancers.slice(0,4).map(c=>`<span class="ctag">${c}</span>`).join("")+(d.cancers.length>4?`<span style="font-size:10px;color:#8A9BB5">+${d.cancers.length-4}</span>`:"");
    const preview=isOpen?"":
      `<div class="preview">${d.ind.replace(/\n/g," ")}</div>`;
    const detail=isOpen?`
      <div class="detail" style="border-top-color:${ti.color}30">
        <div class="detail-section">
          <div class="detail-label" style="color:${ti.color}">給付適應症 ${d.verbatim
            ? `<span class="vb vb-ok">官方原文 · 生效日 ${d.eff}</span>`
            : `<span class="vb vb-sum">摘要（非原文）</span>`}</div>
          <div class="detail-body${d.verbatim?" verbatim":""}">${indLines(d)}</div>
        </div>
        <div class="req-box">
          <div class="req-label">${d.verbatim?"📄 條文出處":"⚙ 主要申請條件"}</div>
          <div class="req-body">${d.req}</div>
        </div>
      </div>`:"";

    card.innerHTML=`
      <div class="card-head">
        <div class="card-top">
          <div class="meta">
            <div class="meta-row">
              <span class="code">${d.id}</span>
              <span class="dname">${hl(d.name)}</span>
              ${d.brand?`<span class="brand">${hl(d.brand)}</span>`:""}
            </div>
            <div class="tags">
              <span class="ttag" style="background:${ti.color}20;color:${ti.color};border:1px solid ${ti.color}40">${ti.label}</span>
              ${tags}
            </div>
            ${preview}
          </div>
          <span class="arrow" style="transform:${isOpen?"rotate(180deg)":"rotate(0)"}">▼</span>
        </div>
      </div>
      ${detail}`;
    card.onclick=()=>{expanded=isOpen?null:d.id;render()};
    list.appendChild(card);
  });
}

document.getElementById("search").addEventListener("input",e=>{
  curQ=e.target.value;expanded=null;render();
});

const MODE_TEXT={
  full:{ph:"全文搜尋：藥名、癌別、適應症、條文號碼…",hint:"搜尋藥名、商品名、癌別、適應症、申請條件、條文號碼"},
  name:{ph:"精確搜尋：僅比對藥品學名／商品名…",hint:"只比對藥品學名與商品名，不搜尋適應症內容"}
};
document.querySelectorAll(".mode-btn").forEach(b=>{
  b.onclick=()=>{
    curMode=b.dataset.mode;
    document.querySelectorAll(".mode-btn").forEach(x=>x.classList.toggle("active",x===b));
    const t=MODE_TEXT[curMode];
    document.getElementById("search").placeholder=t.ph;
    document.getElementById("mode-hint").textContent=t.hint;
    expanded=null;render();
  };
});

// ---------- data loading / auto-update ----------
function verNewer(a,b){ return (a||"") > (b||""); }  // ISO-ish string compare

function applyData(obj, srcLabel){
  if(!obj || !Array.isArray(obj.drugs) || !obj.drugs.length) return false;
  D = obj.drugs;
  // groups 由資料提供；缺少或格式不符時退回內建 fallback
  GROUPS = (obj.groups && typeof obj.groups==="object" && Object.keys(obj.groups).length)
    ? obj.groups : FALLBACK_GROUPS;
  // 若目前選取的分群在新資料中已不存在，退回「全部」避免篩出空白
  if(curGroup!=="全部" && !(curGroup in GROUPS)) curGroup="全部";
  META = {version:obj.version||"", updated:obj.updated||"", source:obj.source||"", src:srcLabel};
  updateMeta();
  return true;
}
function updateMeta(){
  const srcName = {seed:"內建", cache:"雲端快取", remote:"雲端最新"}[META.src] || "內建";
  const sub = document.getElementById("meta-sub");
  if(sub) sub.textContent = "Antineoplastic Drugs · " + (META.updated||"") + "（資料版本 "+(META.version||"—")+" · "+srcName+"）";
  const ft = document.getElementById("footer-src");
  if(ft && META.source) ft.textContent = META.source;
}
function setStatus(msg){ const s=document.getElementById("upd-status"); if(s) s.textContent=msg; }

async function checkForUpdate(manual){
  if(!REMOTE_DATA_URL){ if(manual) setStatus("尚未設定雲端資料網址（見 panel.js 頂端 REMOTE_DATA_URL）"); return; }
  setStatus("檢查更新中…");
  try{
    const res = await fetch(REMOTE_DATA_URL, {cache:"no-store"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    const remote = await res.json();
    if(!remote || !Array.isArray(remote.drugs)) { setStatus("雲端資料格式不符，維持現有資料"); return; }
    if(verNewer(remote.version, META.version) || manual){
      applyData(remote, "remote");
      try{ chrome.storage.local.set({nhi_ch9_data: remote}); }catch(e){}
      buildGroupChips();   // 分群可能隨資料更新而改變，需重建
      render();
      setStatus("已更新至版本 "+(remote.version||"最新")+" · "+new Date().toLocaleString("zh-TW"));
    } else {
      setStatus("已是最新版本（"+(META.version||"—")+"）");
    }
  }catch(e){
    setStatus("離線或無法連線，使用現有資料");
  }
}

/* 內建資料：打包在擴充功能內，保證離線可用（取代原本的 EMBEDDED_SEED 常數，
   因為 MV3 的 CSP 禁止 inline script，資料改以獨立 data.json 載入）。 */
async function loadBundled(){
  const res = await fetch(chrome.runtime.getURL("data.json"));
  if(!res.ok) throw new Error("data.json HTTP "+res.status);
  return await res.json();
}

/* chrome.storage.local 取代 localStorage：側邊欄與分頁共用同一份快取 */
function getCached(){
  return new Promise((resolve)=>{
    try{
      chrome.storage.local.get("nhi_ch9_data", (o)=>resolve(o && o.nhi_ch9_data));
    }catch(e){ resolve(null); }
  });
}

async function init(){
  // 以新分頁開啟時加寬版面並隱藏「在新分頁開啟」鈕
  if(new URLSearchParams(location.search).get("full")==="1"){
    document.body.classList.add("full-page");
  }

  // 1. 內建資料，保證離線可用
  try{
    applyData(await loadBundled(), "seed");
  }catch(e){
    setStatus("內建資料載入失敗："+e.message);
  }

  // 2. 若雲端快取較新則採用
  try{
    const c = await getCached();
    if(c && verNewer(c.version, META.version)) applyData(c, "cache");
  }catch(e){}

  buildGroupChips();
  buildTypeChips();
  render();

  const btn = document.getElementById("upd-btn");
  if(btn) btn.onclick = ()=>checkForUpdate(true);
  const tab = document.getElementById("tab-btn");
  if(tab) tab.onclick = ()=>chrome.tabs.create({url: chrome.runtime.getURL("panel.html?full=1")});

  // 3. 背景嘗試抓雲端最新
  checkForUpdate(false);
}
init();
