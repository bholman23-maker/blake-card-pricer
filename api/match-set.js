
const BASE = "https://tcgcsv.com/tcgplayer";
const CACHE_TTL = 8 * 60 * 60 * 1000;
const memory = globalThis.__BLAKE_CACHE_V7__ || (globalThis.__BLAKE_CACHE_V7__ = new Map());

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

function numberVariants(value=""){
  const raw=String(value).toLowerCase().trim().replace(/^#/,"").split("/")[0].replace(/[^a-z0-9]/g,"");
  const stripped=raw.replace(/^0+(?=\d)/,"")||"0";
  const numeric=(raw.match(/(\d+)$/)||[])[1];
  const out=new Set([raw,stripped]);
  if(numeric){
    out.add(numeric.replace(/^0+(?=\d)/,"")||"0");
    out.add(numeric.padStart(3,"0"));
  }
  return out;
}
function numbersMatch(a,b){
  const A=numberVariants(a),B=numberVariants(b);
  for(const x of A) if(B.has(x)) return true;
  const ar=String(a||"").toLowerCase().split("/")[0].replace(/[^a-z0-9]/g,"");
  const br=String(b||"").toLowerCase().split("/")[0].replace(/[^a-z0-9]/g,"");
  const am=(ar.match(/^(?:[a-z]+)?0*(\d+)[a-z]?$/)||[])[1];
  const bm=(br.match(/^(?:[a-z]+)?0*(\d+)[a-z]?$/)||[])[1];
  return !!(am&&bm&&Number(am)===Number(bm));
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
  "swsh black star promos":["sword shield promos","swsh promos","sword shield black star promos","swsh sword shield promo cards"],
  "scarlet violet black star promos":["scarlet violet promos","sv promos","sv black star promos","sv scarlet violet promo cards"],
  "sun moon black star promos":["sun moon promos","sm promos","sm promo cards"],
  "sm black star promos":["sun moon promos","sm promos","sm promo cards"],
  "xy black star promos":["xy promos","xy promo cards"],
  "black white black star promos":["black white promos","bw promos","bw promo cards"],
  "bw black star promos":["black white promos","bw promos","bw promo cards"],
  "wizards black star promos":["wizards promos","black star promos","wotc promo"],
  "mega evolution promos":["mega evolution promo","mega promos","mega evolution promo cards"],
  "mega evolution black star promos":["mega evolution promo","mega promos","mega evolution promo cards"],
  "celebrations":["celebrations classic collection","pokemon celebrations"],
  "pokemon 151":["scarlet violet 151","151"],
  "151":["scarlet violet 151","pokemon 151"],
  "crown zenith":["crown zenith galarian gallery"],
  "shining fates":["shining fates shiny vault"],
  "hidden fates":["hidden fates shiny vault"],
  "trainer gallery":["trainer gallery"],
  "perfect order":["me03 perfect order"],
  "mega brave":["m1l mega brave"],
  "mega symphonia":["m1s mega symphonia"],
  "base":["base set","pokemon base set"],
  "base set":["base set","pokemon base set"],
  "sword shield":["swsh01 sword shield base set","sword shield base set"],
  "sun moon":["sm base set","sun moon base set"],
  "scarlet violet":["sv01 scarlet violet base set","scarlet violet base set"],
  "pokemon tcg classic blastoise":["trading card game classic","pokemon trading card game classic"],
  "pokemon tcg classic charizard":["trading card game classic","pokemon trading card game classic"],
  "pokemon tcg classic venusaur":["trading card game classic","pokemon trading card game classic"],
  "scarlet violet promos":["sv p scarlet violet promos","scarlet violet promo cards"],
  "diamond pearl promos":["dp p diamond pearl promos"],
  "hot air arena":["sv9a heat wave arena","heat wave arena"],
  "challenge from the darkness":["challenge from the darkness"],
  "neo premium file 2":["neo premium file 2"],
  "vending machine series 2 red":["vending machine cards series 2 red"],
  "rocket gang":["rocket gang"],
  "heartgold collection":["l1 heartgold collection"],
  "expedition base set":["expedition base set"],
  "shining fates shiny vault":["shining fates shiny vault"],
  "tcg classic blastoise":["trading card game classic"],
  "tcg classic charizard":["trading card game classic"],
  "tcg classic venusaur":["trading card game classic"]
};

const CURATED_EXCEPTIONS = {
  "base|machamp|8/102": {
    preferredGroup: "deck exclusives",
    preferredName: "machamp",
    preferredNumber: "8/102",
    preferredSubtype: "unlimited holofoil",
    note: "Base Set Machamp was distributed through the 2-Player Starter Set. Prefer the standard Unlimited holo unless the import explicitly says Shadowless or 1st Edition."
  },
  "bw black star promos|darkrai ex|bw46": {
    preferredGroup: "black and white promos",
    preferredName: "darkrai ex",
    preferredNumber: "bw46",
    note: "Force the BW46 Black and White promo rather than similarly named Darkrai EX printings."
  },
  "heartgold collection|donphan|046/070": {
    catalogMissing: true,
    expectedCard: "Donphan Prime - 046/070",
    expectedSet: "L1: HeartGold Collection",
    expectedNumber: "046/070",
    expectedRarity: "Rare Prime",
    note: "The exact Japanese Donphan Prime 046/070 is identifiable, but it is absent or misnumbered in the current TCGplayer Pokémon Japan catalog."
  }
};
function exceptionKey(row){
  return [
    normalize(row.Set),
    normalize(row["Card Name"]).replace(/\s+/g," "),
    String(row["Card Number"]||"").toLowerCase().trim()
  ].join("|");
}
function curatedException(row){ return CURATED_EXCEPTIONS[exceptionKey(row)] || null; }

function aliasTerms(row){
  const base=normalize(row.Set);
  const slug=normalize(row["Set Slug"]);
  const out=new Set([base,slug,normalize(row["Set ID"])]);
  for(const [k,vals] of Object.entries(SET_ALIASES)){
    const key=normalize(k);
    const exact = base===key || slug===key || compact(slug)===compact(key);
    const safeFamily = key.length>=10 && base.includes(key);
    if(exact || safeFamily) vals.forEach(v=>out.add(normalize(v)));
  }
  if(base.includes("black star") || base.includes("promo")) out.add("promos");
  return [...out].filter(Boolean);
}

function collectorFamily(row){
  const raw=String(row["Card Number"]||"").toUpperCase().replace(/\s+/g,"");
  const set=normalize(row.Set);
  if(/^SWSH\d+/.test(raw)) return "swsh promo";
  if(/^SV\d+\/SV\d+$/.test(raw) || set.includes("shiny vault")) return "shiny vault";
  if(/^GG\d+/.test(raw)) return "galarian gallery";
  if(/^TG\d+/.test(raw)) return "trainer gallery";
  if(/^RC\d+/.test(raw)) return "radiant collection";
  if(/^BW\d+/.test(raw)) return "bw promo";
  if(/^SM\d+/.test(raw) || /\/SM-P$/.test(raw)) return "sm promo";
  if(/\/DP-P$/.test(raw)) return "dp promo";
  if(/^SVP\d+/.test(raw) || /\/SV-P$/.test(raw)) return "sv promo";
  if(set.includes("tcg classic")) return "tcg classic";
  return "";
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
      const r=await fetch(url,{headers:{"User-Agent":"BlakeCardPricer/7.0"}});
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
  const ex=curatedException(row);
  if(ex?.preferredGroup && (gName.includes(normalize(ex.preferredGroup)) || normalize(ex.preferredGroup).includes(gName))) best=1;
  for(const src of aliasTerms(row)){
    best=Math.max(best,similarity(src,gName),similarity(src,gAbbr));
    if(compact(gName).includes(compact(src)) && compact(src).length>=3) best=Math.max(best,.94);
    if(compact(src).includes(compact(gName)) && compact(gName).length>=4) best=Math.max(best,.93);
  }
  const code=imageSetCode(row);
  if(code && (compact(code)===compact(gAbbr) || compact(gName).startsWith(compact(code)))) best=Math.max(best,.995);
  const set=normalize(row.Set);
  if((set.includes("promo")||set.includes("black star")) && gName.includes("promo")) best=Math.max(best,.88);
  if(set.includes("swsh") && gName.includes("swsh") && gName.includes("promo")) best=Math.max(best,.995);
  if(set.includes("scarlet violet") && gName.includes("scarlet violet") && gName.includes("promo")) best=Math.max(best,.995);
  if((set.includes("sm black star")||set==="sun moon promos") && (gName.includes("sm promo")||gName.includes("sun moon promo"))) best=Math.max(best,.995);
  if((set.includes("bw black star")||set.includes("black white")) && (gName.includes("bw promo")||gName.includes("black white promo"))) best=Math.max(best,.995);
  if(set.includes("wizards black star") && (gName.includes("wizards")||gName.includes("black star promo"))) best=Math.max(best,.995);
  if(set.includes("mega evolution") && gName.includes("mega") && gName.includes("promo")) best=Math.max(best,.995);

  const fam=collectorFamily(row);
  if(fam==="swsh promo" && gName.includes("swsh") && gName.includes("promo")) best=Math.max(best,1);
  if(fam==="sv promo" && (gName.includes("sv p")||gName.includes("scarlet violet promo"))) best=Math.max(best,1);
  if(fam==="sm promo" && (gName.includes("sm p")||gName.includes("sun moon promo"))) best=Math.max(best,1);
  if(fam==="bw promo" && (gName.includes("bw promo")||gName.includes("black white promo"))) best=Math.max(best,1);
  if(fam==="dp promo" && (gName.includes("dp p")||gName.includes("diamond pearl promo"))) best=Math.max(best,1);
  if(fam==="tcg classic" && gName.includes("trading card game classic")) best=Math.max(best,1);
  if(fam==="shiny vault" && gName.includes("shining fates") && gName.includes("shiny vault")) best=Math.max(best,1);
  if(fam==="bw promo" && (gName.includes("bw") || gName.includes("black white")) && gName.includes("promo")) best=Math.max(best,1);

  if(set==="base" && gName==="base set") best=1;
  if(set==="sword shield" && gName.includes("sword shield base set")) best=1;
  if(set==="sun moon" && gName.includes("sm base set")) best=1;
  if(set==="scarlet violet" && gName.includes("scarlet violet base set")) best=1;
  if(set==="hot air arena" && gName.includes("heat wave arena")) best=1;
  if(set==="expedition base set" && gName.includes("expedition base set")) best=1;
  if(set.includes("tcg classic") && gName.includes("trading card game classic")) best=1;
  if(set==="shining fates shiny vault" && gName.includes("shining fates") && gName.includes("shiny vault")) best=1;
  return best;
}
function cleanProductName(v=""){
  return normalize(v)
    .replace(/\bno\s*\d{1,4}\b/g," ")
    .replace(/\b\d{1,4}\s*\/\s*\d{1,4}\b/g," ")
    .replace(/\b(?:clv|clc|clb)\b/g," ")
    .replace(/\b(?:cosmos holo|full art|secret|alternate art|alt art|reverse holo|holofoil)\b/g," ")
    .replace(/\b\d{1,4}\b$/," ")
    .trim().replace(/\s+/g," ");
}
function productScore(row,product,group){
  const pnum=ext(product,"Number")||ext(product,"Card Number")||"";
  const rnum=numberCore(row["Card Number"]);
  const exactNum=numbersMatch(row["Card Number"],pnum);
  const rowName=cleanProductName(row["Card Name"]);
  const productName=cleanProductName(product.cleanName||product.name);
  const exactName=compact(rowName)===compact(productName);
  const nameScore=similarity(rowName,productName);
  const rare=ext(product,"Rarity");
  const rarityScore=row.Rarity&&rare?similarity(row.Rarity,rare):.55;
  const setScore=groupScore(row,group);
  const numberEvidence=pnum ? (exactNum?1:0) : (exactName&&setScore>=.90 ? .88 : 0);
  let score=.47*nameScore+.35*numberEvidence+.13*setScore+.05*rarityScore;
  if(exactName) score+=.08;
  if(exactNum&&nameScore>.88) score+=.07;
  if(exactName&&exactNum&&setScore>=.96) score+=.08;
  if(!exactNum&&nameScore<.70) score-=.08;
  if(exactNum&&nameScore<.45) score-=.22;
  if(setScore>=.90&&nameScore<.35) score-=.15;
  if(!pnum&&setScore>=.96&&nameScore>=.82) score+=.12;

  const ex=curatedException(row);
  if(ex?.preferredName){
    const preferredNameScore=similarity(cleanProductName(ex.preferredName),productName);
    if(preferredNameScore>=.95) score+=.22;
    else score-=.30;
  }
  if(ex?.preferredNumber){
    if(numbersMatch(ex.preferredNumber,pnum)) score+=.22;
    else if(pnum) score-=.30;
  }
  if(ex?.preferredGroup){
    const gn=normalize(group.name);
    if(gn.includes(normalize(ex.preferredGroup)) || normalize(ex.preferredGroup).includes(gn)) score+=.20;
    else score-=.30;
  }
  if(exceptionKey(row)==="base|machamp|8/102" && normalize(product.name).includes("shadowless")) score-=.45;

  return {score:Math.max(0,Math.min(score,1)),exactNum,exactName,nameScore,pnum,rare,setScore,numberMissing:!pnum};
}
function choosePrice(priceRows,row,product){
  const available=priceRows.filter(p=>p.marketPrice!=null);
  if(!available.length) return null;
  const ex=curatedException(row);
  if(ex?.preferredSubtype){
    const exact=available.find(p=>normalize(p.subTypeName)===normalize(ex.preferredSubtype));
    if(exact) return exact;
  }
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
  const {score,exactNum,exactName,nameScore,setScore,numberMissing}=best;
  if(setScore>=.96 && exactNum && (exactName || nameScore>=.72)) return "Exact Match";
  if(setScore>=.96 && numberMissing && nameScore>=.82) return "Exact Match";
  if(exactName && exactNum && setScore>=.85) return "Exact Match";
  if(score>=.86 && exactNum && nameScore>=.72 && setScore>=.75) return "Strong Automatic Match";
  if(score>=.80 && exactName && setScore>=.80) return "Strong Automatic Match";
  if(score>=.75 && (exactNum||nameScore>=.92) && setScore>=.55) return "Probable Match";
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
  const rawBrand=String(row.Brand||row.Category||"").toLowerCase();
  if(rawBrand.includes("magic")) return 1;
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
    let take=ranked[0]?.s>=.98?2:ranked[0]?.s>=.90?4:ranked[0]?.s>=.70?8:14;
    let candidates=ranked.slice(0,take);
    const requestedGroups=new Set(rows.map(r=>normalize(curatedException(r)?.preferredGroup||"")).filter(Boolean));
    for(const wanted of requestedGroups){
      const found=ranked.find(x=>normalize(x.g.name).includes(wanted) || wanted.includes(normalize(x.g.name)));
      if(found && !candidates.some(x=>x.g.groupId===found.g.groupId)) candidates.push(found);
    }
    const loaded=[];
    for(const item of candidates) loaded.push({group:item.g,groupMatch:item.s,...(await groupData(categoryId,item.g.groupId))});

    const results=[];
    for(const row of rows){
      const ex=curatedException(row);
      if(ex?.catalogMissing){
        results.push({...row,
          "Near Mint Market Price":"",
          "Near Mint Total Value":"",
          "TCGplayer Product URL":"",
          "TCGplayer Product ID":"",
          "Matched Card":ex.expectedCard||row["Card Name"]||"",
          "Matched Set":ex.expectedSet||row.Set||"",
          "Matched Number":ex.expectedNumber||row["Card Number"]||"",
          "Matched Rarity":ex.expectedRarity||row.Rarity||"",
          "Matched Variant":"",
          "Match Score":1,
          "Pricing Status":"Exact Identification — TCGplayer Catalog Missing",
          "Pricing Source":"Curated identification; TCGplayer Pokémon Japan catalog unavailable",
          "Condition Assumption":"Near Mint",
          "Match Diagnosis":"name exact; set exact; number exact; exact TCGplayer catalog entry unavailable",
          "Review Notes":ex.note
        });
        continue;
      }
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
        "Pricing Status":tier==="Needs Review"?"Needs Review":(market==null?`${tier} — No Market Price`:tier),
        "Pricing Source":categoryId===85?"TCGplayer Pokémon Japan market":"TCGplayer market",
        "Condition Assumption":"Near Mint",
        "Match Diagnosis": [
          best.exactName?"name exact":`name ${(best.nameScore*100).toFixed(0)}%`,
          best.setScore>=.96?"set exact":`set ${(best.setScore*100).toFixed(0)}%`,
          best.exactNum?"number exact":best.numberMissing?"catalog number unavailable":"number conflict",
          price?.marketPrice!=null?"market price found":"no market price"
        ].join("; "),
        "Review Notes": curatedException(row)?.note
          ? `${curatedException(row).note} ${price?.marketPrice!=null ? "Valued using TCGplayer Near Mint market price." : "No TCGplayer market price was available."}`
          : tier!=="Needs Review"
            ? (price?.marketPrice!=null
                ? `${tier}. Valued using TCGplayer market price under a Near Mint condition assumption.`
                : `${tier} catalog identification, but TCGplayer market price is unavailable.`)
            :`Best candidate: ${best.product.name} — ${best.group.name}. Verify set, collector number, and printing.`
      });
    }
    return res.status(200).json({categoryId,groupCandidates:candidates.map(x=>({name:x.g.name,score:x.s})),results});
  }catch(e){return res.status(500).json({error:e.message||String(e)});}
}
