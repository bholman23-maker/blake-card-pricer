
const BASE = "https://tcgcsv.com/tcgplayer";
const CACHE_TTL = 8 * 60 * 60 * 1000;
const memory = globalThis.__BLAKE_CACHE_V3__ || (globalThis.__BLAKE_CACHE_V3__ = new Map());

function normalize(value = "") {
  return String(value)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/pok[eé]mon|magic[: ]*the gathering/g, " ")
    .replace(/[™®]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim().replace(/\s+/g, " ");
}
function compact(v=""){ return normalize(v).replace(/\s+/g,""); }
function numberCore(value = "") {
  let s = String(value).toLowerCase().trim().replace(/^#/, "");
  s = s.split("/")[0].replace(/[^a-z0-9]/g, "");
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
function similarity(a,b){ return Math.max(dice(a,b),tokenScore(a,b)); }

const SET_ALIASES = {
  "swsh black star promos":["sword shield promos","swsh promos","sword shield black star promos"],
  "scarlet violet black star promos":["scarlet violet promos","sv promos","sv black star promos"],
  "sun moon black star promos":["sun moon promos","sm promos"],
  "xy black star promos":["xy promos"],
  "black white black star promos":["black white promos","bw promos"],
  "mega evolution promos":["mega evolution promo","mega promos"],
  "celebrations":["celebrations classic collection","pokemon celebrations"],
  "pokemon 151":["scarlet violet 151","151"],
  "151":["scarlet violet 151","pokemon 151"],
  "crown zenith":["crown zenith galarian gallery"],
  "shining fates":["shining fates shiny vault"],
  "hidden fates":["hidden fates shiny vault"],
  "trainer gallery":["trainer gallery"],
  "perfect order":["me03 perfect order"],
  "mega brave":["m1l mega brave"],
  "mega symphonia":["m1s mega symphonia"]
};
function aliasTerms(row){
  const base=normalize(row.Set);
  const out=new Set([base,normalize(row["Set Slug"]),normalize(row["Set ID"])]);
  for(const [k,vals] of Object.entries(SET_ALIASES)){
    if(base===k || base.includes(k) || normalize(row["Set Slug"])===compact(k)){
      vals.forEach(v=>out.add(normalize(v)));
    }
  }
  if(base.includes("black star") || base.includes("promo")) out.add("promos");
  return [...out].filter(Boolean);
}
function imageSetCode(row){
  const u=String(row["Image URL"]||"");
  const m=u.match(/\/(?:pokemon|magicthegathering)\/([A-Za-z0-9]+)-[^/]+/i);
  return m ? normalize(m[1]) : "";
}

async function fetchJson(url) {
  const cached=memory.get(url);
  if(cached && Date.now()-cached.time<CACHE_TTL) return cached.data;
  let last;
  for(let i=0;i<4;i++){
    try{
      const r=await fetch(url,{headers:{"User-Agent":"BlakeCardPricer/3.0"}});
      if(!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data=await r.json(); memory.set(url,{time:Date.now(),data}); return data;
    }catch(e){last=e;await new Promise(r=>setTimeout(r,600*(i+1)));}
  }
  throw last;
}
function ext(product,key){
  const nk=normalize(key);
  const item=(product.extendedData||[]).find(x=>normalize(x.name)===nk||normalize(x.displayName)===nk);
  return item?String(item.value||""):"";
}
function groupScore(row,group){
  const gName=normalize(group.name), gAbbr=normalize(group.abbreviation||"");
  let best=0;
  for(const src of aliasTerms(row)){
    best=Math.max(best,similarity(src,gName),similarity(src,gAbbr));
    if(compact(gName).includes(compact(src)) && compact(src).length>=3) best=Math.max(best,.94);
    if(compact(src).includes(compact(gName)) && compact(gName).length>=4) best=Math.max(best,.93);
  }
  const code=imageSetCode(row);
  if(code && (compact(code)===compact(gAbbr) || compact(gName).startsWith(compact(code)))) best=Math.max(best,.995);
  const set=normalize(row.Set);
  if((set.includes("promo")||set.includes("black star")) && gName.includes("promo")) best=Math.max(best,.88);
  return best;
}
function cleanProductName(v=""){
  return normalize(v).replace(/\b\d{1,4}\s*\/\s*\d{1,4}\b/g," ").replace(/\b\d{1,4}\b$/," ").trim();
}
function productScore(row,product,group){
  const pnum=ext(product,"Number")||ext(product,"Card Number")||"";
  const rnum=numberCore(row["Card Number"]);
  const exactNum=rnum===numberCore(pnum);
  const rowName=cleanProductName(row["Card Name"]);
  const productName=cleanProductName(product.cleanName||product.name);
  const nameScore=similarity(rowName,productName);
  const rare=ext(product,"Rarity");
  const rarityScore=row.Rarity&&rare?similarity(row.Rarity,rare):.55;
  const setScore=groupScore(row,group);
  let score=.47*nameScore+.35*(exactNum?1:0)+.13*setScore+.05*rarityScore;
  if(compact(rowName)===compact(productName)) score+=.06;
  if(exactNum&&nameScore>.88) score+=.05;
  if(!exactNum&&nameScore<.70) score-=.08;
  return {score:Math.max(0,Math.min(score,1)),exactNum,nameScore,pnum,rare,setScore};
}
function choosePrice(priceRows,row,product){
  const available=priceRows.filter(p=>p.marketPrice!=null);
  if(!available.length) return null;
  const hint=normalize([row.Rarity,row["Rare Candy Display Name"],row["Product Slug"],product.name].join(" "));
  const wanted=
    hint.includes("reverse")?["reverse holofoil","holofoil","normal"]:
    (hint.includes("holo")||hint.includes("radiant")||/\b(v|vmax|vstar|ex|gx)\b/.test(hint))
      ?["holofoil","normal","reverse holofoil"]
      :["normal","holofoil","reverse holofoil","1st edition holofoil","unlimited holofoil"];
  for(const w of wanted){
    const p=available.find(x=>normalize(x.subTypeName)===normalize(w));
    if(p) return p;
  }
  return available.length===1?available[0]:available.sort((a,b)=>(b.marketPrice||0)-(a.marketPrice||0))[0];
}
function confidence(best){
  const {score,exactNum,nameScore,setScore}=best;
  if(score>=.95&&exactNum&&nameScore>=.90&&setScore>=.75) return "Exact Match";
  if(score>=.87&&exactNum&&nameScore>=.76&&setScore>=.60) return "Strong Automatic Match";
  if(score>=.77&&(exactNum||nameScore>=.93)&&setScore>=.55) return "Probable Match";
  return "Needs Review";
}
async function categoryGroups(categoryId){return (await fetchJson(`${BASE}/${categoryId}/groups`)).results||[];}
async function groupData(categoryId,groupId){
  const [products,prices]=await Promise.all([
    fetchJson(`${BASE}/${categoryId}/${groupId}/products`),
    fetchJson(`${BASE}/${categoryId}/${groupId}/prices`)
  ]);
  const priceMap=new Map();
  for(const p of prices.results||[]){
    if(!priceMap.has(p.productId)) priceMap.set(p.productId,[]);
    priceMap.get(p.productId).push(p);
  }
  return {products:products.results||[],priceMap};
}
function categoryFor(row){
  const brand=normalize(row.Brand||row.Category);
  if(brand.includes("magic")) return 1;
  if(normalize(row.Language).includes("japanese")||normalize(row["Language Code"])==="ja") return 85;
  return 3;
}

module.exports=async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="POST") return res.status(405).json({error:"POST required"});
  try{
    const rows=Array.isArray(req.body?.rows)?req.body.rows:[];
    if(!rows.length||rows.length>50) return res.status(400).json({error:"Send 1–50 rows."});
    const categoryId=categoryFor(rows[0]);
    const groups=await categoryGroups(categoryId);
    const seed=rows[0];
    const ranked=groups.map(g=>({g,s:groupScore(seed,g)})).sort((a,b)=>b.s-a.s);
    let take=ranked[0]?.s>=.90?3:ranked[0]?.s>=.70?6:10;
    const candidates=ranked.slice(0,take);
    const loaded=[];
    for(const item of candidates) loaded.push({group:item.g,groupMatch:item.s,...(await groupData(categoryId,item.g.groupId))});

    const results=[];
    for(const row of rows){
      let best=null;
      for(const pack of loaded){
        for(const product of pack.products){
          const ps=productScore(row,product,pack.group);
          if(!best||ps.score>best.score) best={...ps,product,group:pack.group,priceRows:pack.priceMap.get(product.productId)||[]};
        }
      }
      if(!best){
        results.push({...row,"Pricing Status":"Needs Review","Review Notes":"No catalog candidates found."});continue;
      }
      const price=choosePrice(best.priceRows,row,best.product);
      const tier=confidence(best);
      const qty=Number(row.Quantity||0);
      const market=price?.marketPrice??null;
      const accepted=tier!=="Needs Review"&&market!=null;
      results.push({...row,
        "Near Mint Market Price":market??"",
        "Near Mint Total Value":market!=null?Number((market*qty).toFixed(2)):"",
        "TCGplayer Product URL":best.product.url||"",
        "TCGplayer Product ID":best.product.productId||"",
        "Matched Card":best.product.name||"",
        "Matched Set":best.group.name||"",
        "Matched Number":best.pnum||"",
        "Matched Rarity":best.rare||"",
        "Matched Variant":price?.subTypeName||"",
        "Match Score":Number(best.score.toFixed(4)),
        "Pricing Status":accepted?tier:"Needs Review",
        "Pricing Source":categoryId===85?"TCGplayer Pokémon Japan market":"TCGplayer market",
        "Condition Assumption":"Near Mint",
        "Review Notes":accepted
          ?`${tier}. Valued using TCGplayer market price under a Near Mint condition assumption.`
          :`Best candidate: ${best.product.name} — ${best.group.name}. Verify set, collector number, and printing.`
      });
    }
    return res.status(200).json({categoryId,groupCandidates:candidates.map(x=>({name:x.g.name,score:x.s})),results});
  }catch(e){return res.status(500).json({error:e.message||String(e)});}
}
