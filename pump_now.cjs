const https=require("https");
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>res(JSON.parse(d)));}).on("error",rej);});}
function ema(v,p){const k=2/(p+1);let out=[],prev=null;for(let i=0;i<v.length;i++){if(i<p-1){out.push(NaN);continue;}if(i===p-1){let s=0;for(let j=0;j<p;j++)s+=v[j];out.push(s/p);prev=out[i];continue;}prev=v[i]*k+prev*(1-k);out.push(prev);}return out;}
function rsi(v,p=14){let g=[],l=[];for(let i=1;i<v.length;i++){const d=v[i]-v[i-1];g.push(d>0?d:0);l.push(d<0?-d:0);}let ag=0,al=0;for(let i=0;i<p;i++){ag+=g[i];al+=l[i];}ag/=p;al/=p;let rs=[];for(let i=p;i<g.length;i++){ag=(ag*(p-1)+g[i])/p;al=(al*(p-1)+l[i])/p;rs.push(100-100/(1+(al===0?1e9:ag/al)));}return rs;}
function tr(h,l,c){const pc0=[];for(let i=0;i<c.length;i++)pc0.push(i===0?c[i]:c[i-1]);let o=[];for(let i=0;i<h.length;i++)o.push(Math.max(h[i]-l[i],Math.abs(h[i]-pc0[i]),Math.abs(l[i]-pc0[i])));return o;}
function atr(h,l,c,p=14){return ema(tr(h,l,c),p);}
function adx(h,l,c,p=14){const TR=tr(h,l,c);let pdm=[],mdm=[];for(let i=0;i<h.length;i++){const up=h[i]-(i===0?h[i]:h[i-1]);const dn=(i===0?l[i]:l[i-1])-l[i];pdm.push((up>dn&&up>0)?up:0);mdm.push((dn>up&&dn>0)?dn:0);}const ae=atr(h,l,c,p);const pdi=ema(pdm,p).map((x,i)=>ae[i]?x/ae[i]*100:0);const mdi=ema(mdm,p).map((x,i)=>ae[i]?x/ae[i]*100:0);const dx=pdi.map((x,i)=>(pdi[i]+mdi[i])?Math.abs(x-mdi[i])/(x+mdi[i])*100:0);return ema(dx,p);}
function supertrend(h,l,c,p=10,m=3){const ae=atr(h,l,c,p);const hl2=h.map((x,i)=>(x+l[i])/2);let up=hl2.map((x,i)=>x+m*ae[i]);let lo=hl2.map((x,i)=>x-m*ae[i]);let st=[],dir=[];let lastST=NaN,lastDir=1;for(let i=0;i<h.length;i++){if(i===0){st.push(lo[0]);dir.push(1);lastST=lo[0];lastDir=1;continue;}if(c[i]>up[i-1])dir.push(1);else if(c[i]<lo[i-1])dir.push(-1);else dir.push(dir[i-1]);if(dir[i]===1){const cand=Math.max(lo[i],(isNaN(lo[i-1])?-Infinity:lo[i-1]));st.push(cand);lo[i]=cand;}else{const cand=Math.min(up[i],(isNaN(up[i-1])?Infinity:up[i-1]));st.push(cand);up[i]=cand;}lastST=st[i];lastDir=dir[i];}return {st,dir};}
(async()=>{
  const sym="PUMPUSDT";
  const kl=await get(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=1h&limit=220`);
  const o=kl.map(x=>+x[1]),h=kl.map(x=>+x[2]),l=kl.map(x=>+x[3]),c=kl.map(x=>+x[4]);
  const close=c[c.length-1];
  const e20=ema(c,20)[c.length-1],e50=ema(c,50)[c.length-1],e100=ema(c,100)[c.length-1],e200=ema(c,200)[c.length-1];
  const r=rsi(c,14)[rsi(c,14).length-1];
  const a=adx(h,l,c,14)[adx(h,l,c,14).length-1];
  const st=supertrend(h,l,c,10,3); const sv=st.st[st.st.length-1]; const stu=st.dir[st.dir.length-1]===1;
  const t=await get(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${sym}`);
  const chg=parseFloat(t.priceChangePercent), qv=parseFloat(t.quoteVolume);
  const swingLow20=Math.min(...l.slice(-20));
  const dec=close<0.01?6:4;
  console.log(`【PUMPUSDT】 tf=1h`);
  console.log(`ราคา       : ${close.toFixed(dec)}  (24h ${chg>=0?'+':''}${chg.toFixed(2)}% | qv ${(qv/1e6).toFixed(0)}M)`);
  console.log(`EMA20/50    : ${e20.toFixed(dec)} / ${e50.toFixed(dec)}`);
  console.log(`EMA100/200  : ${e100.toFixed(dec)} / ${e200.toFixed(dec)}`);
  console.log(`RSI(14)     : ${r.toFixed(1)}  (${r>70?'Overbought 🔥':r<30?'Oversold ❄️':'กลาง'})`);
  console.log(`ADX(14)     : ${a.toFixed(1)}  (${a>25?'เทรนด์ชัด':'อ่อน'})`);
  console.log(`SuperTrend  : ${stu?'UP ▲ (long bias)':'DOWN ▼ (short bias)'} @ ${sv.toFixed(dec)}`);
  console.log(`Stack       : price ${close>e20?'>':''}e20 ${e20>e50?'>':''}e50 ${e50>e100?'>':''}e100 ${e100>e200?'>':''}e200 => ${close>e20&&e20>e50&&e50>e100&&e100>e200?'BULL ✅':'ไม่เรียง'}`);
  console.log(`SwingLow20  : ${swingLow20.toFixed(dec)}`);
  // pump guard
  const pumped = chg>5;
  console.log(`Pump-guard  : ${pumped?'⚠️ พุ่งแล้ว >5% ห้ามไล่ราคา':'(ยังไม่ร้อน)'}`);
})();
