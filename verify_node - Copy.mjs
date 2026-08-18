// harness: extract indicator fns from dipbuy.html and run on REAL binance data
import {readFileSync} from 'fs';
import {execSync} from 'child_process';
const html=readFileSync('dipbuy.html','utf8');
const js=html.split('<script>')[1].split('</script>')[0];
let body=js.split('/* ---------- fetch')[0]; // indicators only
body='function emaArr'+body.split('function emaArr')[1];
const mod=new Function(body+`;return {emaArr,ema,rsi,macd,tema,atr,supertrend};`)();
const raw=JSON.parse(execSync('curl -s "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=4h&limit=220"',{maxBuffer:1e8}).toString());
const o=raw.map(k=>+k[1]),h=raw.map(k=>+k[2]),l=raw.map(k=>+k[3]),c=raw.map(k=>+k[4]);
const px=c.at(-1);
console.log('typeof px  :',typeof px, px);
console.log('px.toFixed :',px.toFixed(2));
console.log('RSI(14)    :',mod.rsi(c).toFixed(2));
console.log('EMA20      :',mod.ema(c,20).toFixed(2));
console.log('EMA200     :',mod.ema(c,200).toFixed(2));
const st=mod.supertrend(h,l,c,10,3).at(-1);
console.log('SuperTrend :',st.dir===1?'GREEN':'RED', st.st.toFixed(2), 'NaN?', Number.isNaN(st.st));
console.log('MACD hist  :',mod.macd(c).hist.at(-1).toFixed(4));
console.log('TEMA20     :',mod.tema(c,20).at(-1).toFixed(2));
