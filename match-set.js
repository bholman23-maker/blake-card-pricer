
const BASE = "https://tcgcsv.com/tcgplayer";
const CACHE_TTL = 6 * 60 * 60 * 1000;
const memory = globalThis.__BLAKE_CACHE__ || (globalThis.__BLAKE_CACHE__ = new Map());

function normalize(value = "") {
  return String(value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/pokemon|magic the gathering|scarlet violet|sword shield/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
function compact(v=""){ return normalize(v).replace(/\s+/g,""); }
function numberCore(value = "") {
  let s = String(value).toLowerCase().trim().replace(/^#/, "");
  const parts = s.split("/");
  s = parts[0].replace(/[^a-z0-9]/g, "");
  return s.replace(/^0+(?=\d)/, "") || "0";
}
function tokens(v=""){ return new Set(normalize(v).split(" ").filter(Boolean)); }
function tokenScore(a,b){
  const A=tokens(a), B=tokens(b);
  if(!A.size || !B.size) return 0;
  let hit=0; for(const x of A) if(B.has(x)) hit++;
  return (2*hit)/(A.size+B.size);
}
function dice(a,b){
  a=compact(a); b=compact(b);
  if(a===b) return 1;
  if(a.length<2 || b.length<2) return 0;
  const m=new Map();
  for(let i=0;i<a.length-1;i++){const x=a.slice(i,i+2);m.set(x,(m.get(x)||0)+1);}
  let hit=0;
  for(let i=0;i<b.length-1;i++){const x=b.slice(i,i+2);if(m.get(x)){hit++;m.set(x,m.get(x)-1);}}
  return (2*hit)/(a.length+b.length-2);
}
function similarity(a,b){ return Math.max(dice(a,b), tokenScore(a,b)); }

async function fetchJson(url) {
  const cached = memory.get(url);
  if (cached && Date.now() - cached.time < CACHE_TTL) return cached.data;
  let last;
  for (let i=0;i<4;i++) {
    try {
      const r = await fetch(url, {headers: {"User-Agent":"BlakeCardPricer/2.0"}});
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = await r.json();
      memory.set(url, {time:Date.now(), data});
      return data;
    } catch (e) { last=e; await new Promise(r=>setTimeout(r,500*(i+1))); }
  }
  throw last;
}
function ext(product, key){
  const item=(product.extendedData||[]).find(x=>normalize(x.name)===normalize(key) || normalize(x.displayName)===normalize(key));
  return item ? String(item.value||"") : "";
}
function groupScore(row, group){
  const sources=[row.Set,row["Set ID"],row["Set Slug"]].filter(Boolean);
  let best=0;
  for(const src of sources){
    best=Math.max(best,
      similarity(src,group.name),
      similarity(src,group.abbreviation||""),
      compact(group.name).includes(compact(src)) ? .93 : 0,
      compact(src).includes(compact(group.abbreviation||"")) && compact(group.abbreviation||"").length>=2 ? .92 : 0
    );
  }
  return best;
}
function productScore(row, product, group){
  const pnum=ext(product,"Number") || ext(product,"Card Number") || "";
  const exactNum = numberCore(row["Card Number"]) === numberCore(pnum);
  const nameScore = similarity(row["Card Name"], product.name || product.cleanName);
  const rare = ext(product,"Rarity");
  const rarityScore = row.Rarity && rare ? similarity(row.Rarity,rare) : .5;
  const setScore = groupScore(row,group);
  let score=.48*nameScore + .34*(exactNum?1:0) + .13*setScore + .05*rarityScore;
  if (compact(row["Card Name"])===compact(product.name||"")) score += .04;
  if (exactNum && nameScore>.9) score += .04;
  return {score:Math.min(score,1), exactNum, nameScore, pnum, rare};
}
function choosePrice(priceRows, row, product){
  const available=priceRows.filter(p=>p.marketPrice!=null);
  if(!available.length) return null;
  const hint=normalize([row.Rarity,row["Rare Candy Display Name"],product.name].join(" "));
  const wanted =
    hint.includes("reverse") ? ["reverse holofoil","holofoil","normal"] :
    (hint.includes("holo") || hint.includes("radiant") || hint.includes(" vmax") || hint.includes(" vstar") || hint.includes(" ex"))
      ? ["holofoil","normal","reverse holofoil"]
      : ["normal","holofoil","reverse holofoil","1st edition holofoil","unlimited holofoil"];
  for(const w of wanted){
    const p=available.find(x=>normalize(x.subTypeName)===normalize(w));
    if(p) return p;
  }
  if(available.length===1) return available[0];
  return available.sort((a,b)=>(b.marketPrice||0)-(a.marketPrice||0))[0];
}
async function categoryGroups(categoryId){
  return (await fetchJson(`${BASE}/${categoryId}/groups`)).results || [];
}
async function groupData(categoryId, groupId){
  const [products,prices]=await Promise.all([
    fetchJson(`${BASE}/${categoryId}/${groupId}/products`),
    fetchJson(`${BASE}/${categoryId}/${groupId}/prices`)
  ]);
  const priceMap=new Map();
  for(const p of prices.results||[]){
    if(!priceMap.has(p.productId)) priceMap.set(p.productId,[]);
    priceMap.get(p.productId).push(p);
  }
  return {products:products.results||[], priceMap};
}
function categoryFor(row){
  const brand=normalize(row.Brand || row.Category);
  if(brand.includes("magic")) return 1;
  if(normalize(row.Language).includes("japanese") || normalize(row["Language Code"])==="ja") return 85;
  return 3;
}
function confidence(score, exactNum, nameScore, groupMatch){
  if(score>=.94 && exactNum && nameScore>=.90) return "Exact Match";
  if(score>=.87 && exactNum && nameScore>=.78) return "Strong Automatic Match";
  if(score>=.77 && (exactNum || nameScore>=.92) && groupMatch>=.65) return "Probable Match";
  return "Needs Review";
}

module.exports = async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="POST") return res.status(405).json({error:"POST required"});
  try{
    const rows=Array.isArray(req.body?.rows)?req.body.rows:[];
    if(!rows.length || rows.length>50) return res.status(400).json({error:"Send 1–50 rows."});
    const categoryId=categoryFor(rows[0]);
    const groups=await categoryGroups(categoryId);
    const seed=rows[0];
    const rankedGroups=groups.map(g=>({g,s:groupScore(seed,g)})).sort((a,b)=>b.s-a.s);
    const candidates=rankedGroups.slice(0, rankedGroups[0]?.s>=.72 ? 2 : 4);
    const loaded=[];
    for(const item of candidates){
      loaded.push({group:item.g, groupMatch:item.s, ...(await groupData(categoryId,item.g.groupId))});
    }

    const results=[];
    for(const row of rows){
      let best=null;
      for(const pack of loaded){
        for(const product of pack.products){
          const ps=productScore(row,product,pack.group);
          if(!best || ps.score>best.score) best={...ps,product,group:pack.group,groupMatch:pack.groupMatch,priceRows:pack.priceMap.get(product.productId)||[]};
        }
      }
      if(!best){
        results.push({...row,"Pricing Status":"Needs Review","Review Notes":"No product candidates found."});
        continue;
      }
      const price=choosePrice(best.priceRows,row,best.product);
      const tier=confidence(best.score,best.exactNum,best.nameScore,best.groupMatch);
      const qty=Number(row.Quantity||0);
      const market=price?.marketPrice ?? null;
      const autoAccept=tier!=="Needs Review" && market!=null;
      results.push({...row,
        "TCGplayer Market Price": market ?? "",
        "TCGplayer Total Value": market!=null ? Number((market*qty).toFixed(2)) : "",
        "TCGplayer Product URL": best.product.url || "",
        "TCGplayer Product ID": best.product.productId || "",
        "Matched Card": best.product.name || "",
        "Matched Set": best.group.name || "",
        "Matched Number": best.pnum || "",
        "Matched Rarity": best.rare || "",
        "Matched Variant": price?.subTypeName || "",
        "Match Score": Number(best.score.toFixed(4)),
        "Pricing Status": autoAccept ? tier : "Needs Review",
        "Pricing Source": categoryId===85 ? "TCGCSV / TCGplayer Pokemon Japan" : "TCGCSV / TCGplayer",
        "Review Notes": autoAccept
          ? `${tier}. ${best.exactNum?"Collector number matched.":"Collector number requires review."}`
          : `Best candidate: ${best.product.name} — ${best.group.name}. Verify set, number, and printing.`
      });
    }
    return res.status(200).json({categoryId,groupCandidates:candidates.map(x=>({name:x.g.name,score:x.s})),results});
  }catch(e){
    return res.status(500).json({error:e.message || String(e)});
  }
}
