const https=require("https");
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)));}).on("error",rej);});}
function ema(v,p){const k=2/(p+1);let out=[],prev=null;for(let i=0;i<v.length;i++){if(i<p-1){out.push(NaN);continue;}if(i===p-1){let s=0;for(let j=0;j<p;j++)s+=v[j];out.push(s/p);prev=out[i];continue;}prev=v[i]*k+prev*(1-k);out.push(prev);}return out;}
function rsi(v,p=14){let g=[],l=[];for(let i=1;i<v.length;i++){const d=v[i]-v[i-1];g.push(d>0?d:0);l.push(d<0?-d:0);}let ag=0,al=0;for(let i=0;i<p;i++){ag+=g[i];al+=l[i];}ag/=p;al/=p;let rs=[];for(let i=p;i<g.length;i++){ag=(ag*(p-1)+g[i])/p;al=(al*(p-1)+l[i])/p;rs.push(100-100/(1+(al===0?1e9:ag/al)));}return rs;}
// RSI slope (กำลังฟื้น = rsi ล่าสุด > rsi 10 แท่งก่อน)
function rsiSlope(r){if(r.length<12)return 0;return r[r.length-1]-r[r.length-11];}
(async()=>{
  const ex=await get("https://fapi.binance.com/fapi/v1/exchangeInfo");
  const perps=ex.symbols.filter(s=>s.quoteAsset==='USDT'&&s.contractType==='PERPETUAL'&&s.status==='TRADING').map(s=>s.symbol);
  const tk=await get("https://fapi.binance.com/fapi/v1/ticker/24hr");
  const map=Object.fromEntries(tk.map(t=>[t.symbol,t]));
  const cands=perps.filter(s=>{const t=map[s];if(!t)return false;const p=parseFloat(t.lastPrice),qv=parseFloat(t.quoteVolume),c=parseFloat(t.priceChangePercent);return p>0&&p<1&&qv>=20e6&&c>-3&&c<5;});
  const res=[];
  for(const sym of cands){
    try{
      const kl=await get(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1h&limit=200`);
      const c=kl.map(x=>+x[4]),h=kl.map(x=>+x[2]),l=kl.map(x=>+x[3]);
      const r=rsi(c,14); const rs=r[r.length-1]; const slope=rsiSlope(r);
      const e20=ema(c,20)[c.length-1],e50=ema(c,50)[c.length-1],e100=ema(c,100)[c.length-1];
      const close=c[c.length-1];
      const qv=parseFloat(map[sym].quoteVolume);
      const chg=parseFloat(map[sym].priceChangePercent);
      // เงื่อนไข "กำลังจะพุ่ง": RSI ฟื้น (slope>0) + ไม่ overbought + ราคาใกล้/เหนือ EMA20 + stack ไม่พัง
      const coil = slope>1 && rs>=28 && rs<=58 && close>=e20*0.99 && e20>=e50*0.995;
      if(coil) res.push({sym,price:close,rs:rs.toFixed(1),slope:slope.toFixed(1),e20,e50,chg,qv});
    }catch(e){}
  }
  res.sort((a,b)=>b.qv-a.qv);
  console.log("=== เหรียญ <$1 วอลุ่ม>=20M 'กำลังจะพุ่ง' (RSI ฟื้น+ไม่ร้อน+ยืน EMA20) ===");
  console.log("SYM          PRICE     RSI  RSIΔ  24h%    QVOL(USDT)");
  for(const x of res.slice(0,25)){
    console.log(x.sym.padEnd(12), x.price.toFixed(4).padEnd(8), String(x.rs).padEnd(4), (x.slope>=0?'+':'')+x.slope, (x.chg>=0?'+':'')+x.chg.toFixed(2)+'%', Math.round(x.qv).toLocaleString('en-US'));
  }
  if(!res.length)console.log("(ไม่มีตัวที่เข้าเงื่อนไขตอนนี้)");
})();
