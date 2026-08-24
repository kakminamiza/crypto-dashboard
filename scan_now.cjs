const https=require("https");
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)));}).on("error",rej);});}
function ema(v,p){const k=2/(p+1);let out=[],prev=null;for(let i=0;i<v.length;i++){if(i<p-1){out.push(NaN);continue;}if(i===p-1){let s=0;for(let j=0;j<p;j++)s+=v[j];out.push(s/p);prev=out[i];continue;}prev=v[i]*k+prev*(1-k);out.push(prev);}return out;}
function rsi(v,p=14){let g=[],l=[];for(let i=1;i<v.length;i++){const d=v[i]-v[i-1];g.push(d>0?d:0);l.push(d<0?-d:0);}let ag=0,al=0;for(let i=0;i<p;i++){ag+=g[i];al+=l[i];}ag/=p;al/=p;let rs=[];for(let i=p;i<g.length;i++){ag=(ag*(p-1)+g[i])/p;al=(al*(p-1)+l[i])/p;rs.push(100-100/(1+(al===0?1e9:ag/al)));}return rs;}
async function analyze(sym,tf){
  const kl=await get(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=600`);
  const o=kl.map(x=>+x[1]),h=kl.map(x=>+x[2]),l=kl.map(x=>+x[3]),c=kl.map(x=>+x[4]);
  const close=c[c.length-1],lo=l[l.length-1];
  const e20=ema(c,20)[c.length-1],e50=ema(c,50)[c.length-1],e100=ema(c,100)[c.length-1],e200=ema(c,200)[c.length-1];
  const r=rsi(c)[rsi(c).length-1];
  const a=await get(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`).then(j=>parseFloat(j.priceChangePercent)).catch(()=>null);
  const above=e50&&close>e50;
  const trend_ok = close>e50 && e50>e100 && e100>e200;
  const rsiOK=(r>30&&r<70);
  const dip=(lo<=e20*1.005&&close>=e20*0.997);
  const score=[trend_ok,rsiOK,above,dip].filter(Boolean).length+1;
  let sig=(trend_ok&&rsiOK&&above&&dip)?'DIP-BUY':(score>=3?'WATCH':'NO-SIGNAL');
  const pumped = a!==null && a>5.0;
  if(pumped&&sig==='DIP-BUY')sig='PUMPED';
  return {sym,tf,close,e20,e50,e100,e200,r,a,score,sig,pumped};
}
(async()=>{
  const syms=["BTCUSDT","ETHUSDT","ETHFIUSDC","CRVUSDT","BEATUSDT"];
  console.log("SYM        TF  CLOSE           EMA20          EMA50          EMA100         EMA200         RSI    CHG%   SCORE SIG");
  for(const s of syms){
    try{
      const d=await analyze(s,"1h");
      const f=n=>n.toFixed(4).padEnd(14);
      console.log(
        d.sym.padEnd(10), d.tf.padEnd(3),
        f(d.close), f(d.e20), f(d.e50), f(d.e100), f(d.e200),
        (d.r?d.r.toFixed(1):"-").padEnd(6),
        (d.a!=null?d.a.toFixed(1):"-").padEnd(6),
        String(d.score).padEnd(5), d.sig);
    }catch(e){console.log(s,"ERR",e.message);}
  }
})();
