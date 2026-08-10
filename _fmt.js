/* ====== formatting (no scientific notation) ====== */
function fmt(x){
  if(x==null||isNaN(x)) return "–";
  let n=+x, abs=Math.abs(n); if(n===0) return "0";
  let dec = abs>=1000?2 : abs>=1?4 : abs>=0.01?5 : abs>=0.0001?7 : 9;
  return n.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function pct(x){ return (x>=0?"+":"")+x.toFixed(2)+"%"; }
function stars(s){ if(s<0)return "–"; if(s>=85)return "★★★★★"; if(s>=70)return "★★★★☆"; if(s>=55)return "★★★☆☆"; if(s>=45)return "★★☆☆☆"; return "★☆☆☆☆"; }
function dirTag(d){ return d==="long"?'<span class="tag long">LONG</span>':d==="short"?'<span class="tag short">SHORT</span>':'<span class="tag neu">รอ</span>'; }
function momTxt(m){ return m==="up"?'<span class="mom pos">▲ ขึ้น</span>':m==="down"?'<span class="mom neg">▼ ลง</span>':'<span class="mom neu">• Sideways</span>'; }


/* ====== render scanner ====== */
function renderScan(rows,targetId){
  targetId=targetId||"resultS";
  rows.sort((a,b)=>(b.score)-(a.score));
  let body=rows.map(r=>{
    if(!r) return "";
    let slTxt = r.sl!=null ? `<span class="neg">${fmt(r.sl)}</span>` : "–";
    let tp1Txt = r.tp1!=null ? `<span class="pos">${fmt(r.tp1)}</span> <span class="neu" style="font-size:10px">1.5R</span>` : "–";
    let tp2Txt = r.tp2!=null ? `<span class="pos">${fmt(r.tp2)}</span> <span class="neu" style="font-size:10px">3R</span>` : "–";
    return `<tr data-sym="${r.sym}">
      <td class="l"><b style="color:var(--blu)">${r.sym}</b></td>
      <td>${dirTag(r.dir)}</td>
      <td class="sc">${r.score>=0?r.score.toFixed(1):'–'}</td>
      <td><span class="stars">${stars(r.score)}</span></td>
      <td>${fmt(r.entry!=null?r.entry:r.price)}</td>
      <td>${slTxt}</td>
      <td>${tp1Txt}</td>
      <td>${tp2Txt}</td>
      <td class="${r.chg>=0?'pos':'neg'}">${pct(r.chg)}</td>
      <td class="${r.adxNow>ADX_THRESH?'pos':'neu'}">${r.adxNow.toFixed(1)}</td>
      <td class="${r.rsiNow>70?'pos':r.rsiNow<30?'neg':'neu'}">${r.rsiNow.toFixed(1)}</td>
      <td>${oiTxt(r.oi)}</td>
      <td>${fundTxt(r.fund)}</td>
    </tr>`;
  }).join("");
  document.getElementById(targetId).innerHTML=`
  <div class="card" style="padding:10px 12px; overflow-x:auto">
  <table class="scan">
    <thead><tr>
      <th class="l">เหรียญ</th><th class="l">ทิศทาง</th><th>Score</th><th>ดาว</th>
      <th>ราคาซื้อ</th><th>SL (Stop Loss)</th><th>TP1 (Take Profit)</th><th>TP2 (Take Profit)</th>
      <th>24h</th><th>ADX</th><th>RSI</th><th>OI</th><th>Funding</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>
  <div class="status"><span class="neu">คลิกแถวเพื่อวิเคราะห์ลึก (เปลี่ยนไปแท็บ "วิเคราะห์เหรียญ")</span></div>`;
  document.querySelectorAll('#'+targetId+' tr[data-sym]').forEach(tr=>{
    tr.addEventListener('click',()=>{
      document.getElementById("sym").value=tr.dataset.sym;
      switchTab("analyze"); doAnalyze();
    });
  });
}

/* ====== actions ====== */
async function doAnalyze(){
  let sym=document.getElementById("sym").value.trim().toUpperCase();
  if(!sym) return;
  let tf=document.getElementById("tf").value;
  let st=document.getElementById("statusA"); st.innerHTML='<span class="ok">⏳ ดึงข้อมูล Binance…</span>';
  try{ let r=await analyze(sym,tf); renderAnalyze(r); st.innerHTML=`<span class="ok">✓ อัปเดต ${new Date().toLocaleTimeString('th-TH')}</span>`; }
  catch(e){ st.innerHTML=`<span class="err">⚠ ผิดพลาด: ${e.message}</span>`; }
}
async function doScan(){
  let topN=+document.getElementById("topN").value;
  let tf=document.getElementById("scanTf").value;
  let st=document.getElementById("statusS"); let bar=document.getElementById("scanBar"); let fill=bar.querySelector("i");
  bar.style.display="block"; fill.style.width="0%";
  st.innerHTML='<span class="ok">⏳ ดึงรายชื่อเหรียญ + Volume…</span>';
  try{
    let info=await safeFetch(`${FAPI}/fapi/v1/exchangeInfo`);
    let j=await info.json();
    let perps=new Set(j.symbols.filter(s=>s.contractType==="PERPETUAL"&&s.quoteAsset==="USDT"&&s.status==="TRADING"&&!/UP|DOWN|BULL|BEAR/.test(s.symbol)).map(s=>s.symbol));
    let tk=await safeFetch(`${FAPI}/fapi/v1/ticker/24hr`);
    let arr=await tk.json();
    let list=arr.filter(d=>perps.has(d.symbol)&&+d.quoteVolume>1e7).sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,topN);
    st.innerHTML=`<span class="ok">⏳ สแกน ${list.length} เหรียญ…</span>`;
    let rows=[];
    for(let i=0;i<list.length;i++){
      try{ let r=await scanCoin(list[i].symbol,tf); if(r) rows.push(r); }
      catch(e){ /* skip */ }
      fill.style.width=Math.round((i+1)/list.length*100)+"%";
    }
    renderScan(rows);
    let lng=rows.filter(r=>r.dir==="long").length, sht=rows.filter(r=>r.dir==="short").length;
    st.innerHTML=`<span class="ok">✓ สแกนเสร็จ ${rows.length} เหรียญ · ${lng} LONG / ${sht} SHORT · ${new Date().toLocaleTimeString('th-TH')}</span>`;
  }catch(e){ st.innerHTML=`<span class="err">⚠ ผิดพลาด: ${e.message}</span>`; }
  finally{ setTimeout(()=>bar.style.display="none",800); }
}

