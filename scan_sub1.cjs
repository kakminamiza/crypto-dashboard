const https=require("https");
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)));}).on("error",rej);});}
(async()=>{
  const ex=await get("https://fapi.binance.com/fapi/v1/exchangeInfo");
  const perps=ex.symbols.filter(s=>s.quoteAsset==='USDT'&&s.contractType==='PERPETUAL'&&s.status==='TRADING').map(s=>s.symbol);
  const tk=await get("https://fapi.binance.com/fapi/v1/ticker/24hr");
  const map=Object.fromEntries(tk.map(t=>[t.symbol,t]));
  const rows=perps.map(sym=>{
    const t=map[sym]; if(!t)return null;
    const price=parseFloat(t.lastPrice), qv=parseFloat(t.quoteVolume), chg=parseFloat(t.priceChangePercent);
    return {sym,price,qv,chg};
  }).filter(x=>x&&x.price>0&&x.price<1&&x.qv>0);
  // วอลุ่มดี = quote volume >= 5M USDT/24h
  const good=rows.filter(x=>x.qv>=5e6);
  good.sort((a,b)=>b.qv-a.qv);
  console.log("=== เหรียญ <$1 วอลุ่มดี (qv>=5M) เรียงตามวอลุ่ม ===");
  console.log("SYM          PRICE      24h%     QVOL(USDT)");
  for(const x of good.slice(0,40)){
    console.log(x.sym.padEnd(12), x.price.toFixed(4).padEnd(10), (x.chg>=0?'+':'')+x.chg.toFixed(2)+'%', Math.round(x.qv).toLocaleString('en-US'));
  }
  console.log("\n=== เฉพาะที่ 'พุ่ง' (24h%+ และ <=5% ไม่ใช่ pump ไล่) ===");
  const rising=good.filter(x=>x.chg>0&&x.chg<=5).sort((a,b)=>b.qv-a.qv);
  console.log("SYM          PRICE      24h%     QVOL(USDT)");
  for(const x of rising.slice(0,25)){
    console.log(x.sym.padEnd(12), x.price.toFixed(4).padEnd(10), '+'+x.chg.toFixed(2)+'%', Math.round(x.qv).toLocaleString('en-US'));
  }
  console.log("\n=== พุ่งแรงแล้ว >5% (ระวังไล่) ===");
  const pumped=good.filter(x=>x.chg>5).sort((a,b)=>b.chg-a.chg);
  console.log("SYM          PRICE      24h%     QVOL(USDT)");
  for(const x of pumped.slice(0,15)){
    console.log(x.sym.padEnd(12), x.price.toFixed(4).padEnd(10), '+'+x.chg.toFixed(2)+'%', Math.round(x.qv).toLocaleString('en-US'));
  }
})();
