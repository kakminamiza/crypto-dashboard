const EMA_FAST=20,EMA_SLOW=50,EMA_TREND=200,ADX_LEN=14,ADX_THRESH=25,SL_ATR=2,TP1R=1.5,TP2R=3;
const RSI_LEN=14,ST_LEN=10,ST_MULT=3,MACD_F=12,MACD_S=26,MACD_SIG=9;
function ema(v,n){let k=2/(n+1),e=v[0],o=[e];for(let i=1;i<v.length;i++){e=v[i]*k+e*(1-k);o.push(e)}return o}
function rma(v,n){let o=[],sum=0;for(let i=0;i<n&&i<v.length;i++)sum+=v[i];let e=v.length>=n?sum/n:v[0];for(let i=0;i<v.length;i++){if(i===0){o.push(e);continue}e=v[i]/n+e*(1-1/n);o.push(e)}return o}
function atr(h,l,c,n=14){let tr=[h[0]-l[0]];for(let i=1;i<c.length;i++)tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])));return rma(tr,n)}
function adx(h,l,c,n=14){let pdm=[0],mdm=[0],tr=[Math.max(h[0]-l[0],Math.abs(h[0]-c[0]),Math.abs(l[0]-c[0]))];for(let i=1;i<c.length;i++){let up=h[i]-h[i-1],dn=l[i-1]-l[i];pdm.push(up>dn&&up>0?up:0);mdm.push(dn>up&&dn>0?dn:0);tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])))}let ar=rma(tr,n),pdi=rma(pdm,n).map((p,i)=>ar[i]?100*p/ar[i]:0),mdi=rma(mdm,n).map((m,i)=>ar[i]?100*m/ar[i]:0),dx=[0];for(let i=1;i<pdi.length;i++)dx.push((pdi[i]+mdi[i])?100*Math.abs(pdi[i]-mdi[i])/(pdi[i]+mdi[i]):0);return rma(dx,n)}
function rsi(c,n=14){let gains=[0],losses=[0];for(let i=1;i<c.length;i++){let d=c[i]-c[i-1];gains.push(d>0?d:0);losses.push(d<0?-d:0)}if(gains.length-1<n)return[50];let ag=rma(gains.slice(1),n),al=rma(losses.slice(1),n);let out=[];for(let i=0;i<c.length;i++){if(i<n){out.push(50);continue}let gi=i-1;let g=ag[gi],l=al[gi];if(!l||l===0)out.push(100);else{let rs=g/l;out.push(100-100/(1+rs))}}return out}
function macd(c,f=12,s=26,sg=9){let ef=ema(c,f),es=ema(c,s),line=ef.map((x,i)=>x-es[i]),sig=rma(line,sg),hist=line.map((x,i)=>x-sig[i]);return{line,sig,hist}}
(async()=>{
  const d=JSON.parse(require('child_process').execSync('curl -s "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1h&limit=300"').toString());
  const h=d.map(k=>+k[2]),l=d.map(k=>+k[3]),c=d.map(k=>+k[4]);
  const a=adx(h,l,c,14), p=c.at(-1);
  console.log("price",p);
  console.log("ADX(14)",a.at(-1).toFixed(2),"prev",a.at(-2).toFixed(2));
  console.log("EMA20/50/200",ema(c,20).at(-1).toFixed(0),ema(c,50).at(-1).toFixed(0),ema(c,200).at(-1).toFixed(0));
  console.log("ATR14",atr(h,l,c,14).at(-1).toFixed(0));
  console.log("RSI14",rsi(c).at(-1).toFixed(1));
  console.log("MACD hist",macd(c).hist.at(-1).toFixed(1));
  console.log("ADX>25 (เขียว)?", a.at(-1)>25);
})();
