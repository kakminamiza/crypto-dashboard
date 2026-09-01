/* ===== Tooltip / Manual system (shared) ===== */
const TOOL_DATA = {
  ema: { t:"EMA (Exponential Moving Average)", use:"ดูทิศทางเทรนด์", ben:"ช่วยหาจังหวะเข้าเทรดตามเทรนด์",
    d:"EMA น้ำหนักช่วงล่าสุดมากกว่า SMA ทำให้ตอบสนองเร็วกว่า。<b>20</b>=สั้น(เทรดสั้น) <b>50</b>=กลาง <b>100</b>=ยาว <b>200</b>=เทรนด์หลัก。ราคาอยู่เหนือ EMA200 = ขาขึ้นระยะยาว。ใช้ตัดกัน(EMA20>EMA50) confirming momentum。" },
  adx: { t:"ADX(14) — เขียว>25 เทรนด์ชัด / เหลือง≤25 อ่อน", use:"วัดความแรงของเทรนด์ ไม่บอกทิศทาง", ben:"กรองonlyเทรนด์แรงพอ ไม่เข้า sideways",
    d:"ADX บอก<b>ความแรง</b>ไม่ใช่ทิศทาง。>25=เทรนด์ชัดเจนแรงพอเทรดได้。≤25=sideway/อ่อน ควรรอหรือเลี่ยง。ใช้คู่กับ EMA/SuperTrend เพื่อยืนยันทิศทาง。" },
  atr: { t:"ATR(14) — ความผันผวน", use:"ตั้งจุด SL/TP ให้สมเหตุสมผล", ben:"ไม่ตั้ง SL แคบเกินจนโดนล้างโดยสุ่ม",
    d:"ATR คือช่วงราคาเฉลี่ยที่แกว่งต่อแท่ง。ใช้คำนวณ <b>SL = 2×ATR</b>, TP1=1.5R, TP2=3R。ATR สูง=ผันผวนมาก ต้อง widen SL。ATR ต่ำ=สงบ เหมาะเทรด精细。" },
  rsi: { t:"RSI(14) — หมื่นไหมโอเวอร์โซลด์", use:"หาจุดหมุนกลับตอนแพง/ถูกเกิน", ben:"จับ dip ซื้อตอน oversold หรือขายตอน overbought",
    d:">70 = <b>Overbought</b>(แพงไป ระวังรีบาวด์ลง)。<30 = <b>Oversold</b>(ถูกไป ระวังรีบาวด์ขึ้น)。กลยุทธ์ Dip-Buy ชอบ RSI หลุดลงใกล้ 30 แล้วเด้ง。RSI(16) บนกราฟคือเส้นส้ม ดูโมเมนตัม。" },
  supertrend: { t:"SuperTrend — สัญญาณทิศทาง", use:"บอก Long/Short bias ชัดเจน", ben:"เปิดออเดอร์ตามเทรนด์แบบไม่เดา",
    d:"คำนวณจาก ATR+ค่าผันผวน。UP=เขียว=แนวโน้มขึ้น(long bias)。DOWN=แดง=แนวโน้มลง(short bias)。เปลี่ยนสี=สัญญาณกลับตัว ใช้คู่กับ EMA/ADX。" },
  macd: { t:"MACD — โมเมนตัม", use:"จับจังหวะเริ่มเทรนด์/กลับตัว", ben:"เข้าก่อนเทรนด์เต็มตัว",
    d:"แสดงความต่าง EMAสั้น-ยาว。<b>Bull ▲</b>=ฮิสโตแกรมบวก แนวโน้มขึ้น。Bear ▼=ลบ ลง。ตัดศูนย์=สัญญาณ cross สำคัญ。" },
  mtf: { t:"MTF (Multi-Timeframe) — ยืนยันข้ามกรอบเวลา", use:"เช็คว่าเทรนด์สอดคล้องทุก timeframe", ben:"ลด false signal เข้าเทรนด์ที่ทุกกรอบเห็นตรงกัน",
    d:"วิเคราะห์ 5m/15m/1h/4h/1d พร้อมกัน。ถ้าหลายกรอบเป็น BULL พร้อมกัน=เทรนด์แข็งแรงเข้าได้มั่นใจ。เห็นค่า <b>X BULL / Y BEAR</b>。" },
  score: { t:"Score — คะแนนรวมคุณภาพสัญญาณ", use:"เรียงลำดับเหรียญไหนสัญญาณดีสุด", ben:"โฟกัสเฉพาะเหรียญคุณภาพสูง ไม่เสียเวลาไล่ดูทั้งตลาด",
    d:"รวมคะแนนจาก EMA/ADX/RSI/SuperTrend/MACD/MTF/Vol/Funding。★★★★★สูง=คุณภาพดี。ใช้排序หน้า Top100 / Accumulation。" },
  sltp: { t:"SL / TP — บริหารจุด", use:"จำกัดความเสี่ยง + กำหนดเป้าหมาย", ben:"รู้น้ำหนักได้ว่าคุ้ม风险ไหม (R:R)",
    d:"<b>SL</b>=จุดตัดขาดทุน(2×ATR)。<b>TP1</b>=เป้า 1.5R, <b>TP2</b>=เป้า 3R。R:R =  reward/risk ต้อง ≥1.5 ถึงคุ้มเทรด。เคลียร์แผนก่อนกดออเดอร์เสมอ。" },
  liq: { t:"Liquidation Zone — โซนล้างพอร์ต", use:"เห็นจุดที่ฝั่งตรงข้ามโดนบังคับขาย/ซื้อ", ben:"หลบโซนที่ราคาจะถูกดูด หรือเอาไปทำเทรดสวน",
    d:"แสดงแท่งเทรดใหญ่ผิดปกติ(≥2.5×median)=แรงบังคับชำระ。ราคาเข้าโซนนี้อาจเด้งแรงหรือถูกดูดต่อ。ใช้หน้า Liquidation Watch เตือนก่อนพอร์ตตัวเองโดนล้าง。" },
  oi: { t:"Open Interest (OI) — ยอดสัญญาเปิดค้าง", use:"ดูว่ามีเงินใหม่ไหลเข้าหรือไม่", ben:"แยกระหว่างเทรนด์จริง vs แค่ช็อตสควีซ",
    d:"OI เพิ่ม+ราคาขึ้น=คนเปิด Long ใหม่(เทรนด์ของจริง)。OI ลด=คนปิดคู่ไป(OI ลดราคาขึ้น=short squeeze)。ใช้จับ divergence。" },
  funding: { t:"Funding Rate — ค่าการระดมทุน", use:"หาเหรียญที่จ่ายกระแสให้ฝั่งหนึ่ง", ben:"เก็บฟรีจากคนฝั่งตรงข้าม หรือระวังรีบาวด์",
    d:"จ่ายทุก 8 ชม。+ = Short จ่ายให้ Long(เปิดLongรับเงิน)。- = Long จ่ายให้ Short。Funding สูงมาก=ตลาด extreme ระวังกลับตัว。" },
  vol: { t:"Volume Spike — แท่งปริมาณกระแสกะทันหัน", use:"จับจังหวะมีเงินใหญ่เข้า/ออก", ben:"เตือนก่อนราคาวิ่งแรง",
    d:"วงกลมแดงบนแท่งที่ volume ≥2.5×median=มีเงินใหญ่ขยับ。มักนำราคาวิ่ง。ใช้คู่กับ breakout เพื่อยืนยันสัญญาณ。" },
  accum: { t:"Accumulation — สะสมเงียบ", use:"หาเหรียญที่ถูกซื้อเงียบๆ ก่อนวิ่ง", ben:"เข้า early ก่อนคนอื่นรู้",
    d:"กรองเหรียญที่ Vol>1.5M + sideways แล้ว breakout + OI เพิ่ม + RSI เย็น + MTF bull。เป็นสัญญาณวาฬสะสม รอปั๊มราคา。" },
  lev: { t:"Leverage — แพร่หลาย", use:"คุมน้ำหนักต่อ 1 ดอลลาร์ทุน", ben:"กำไรทบตัว แต่ขาดทุนล้างพอร์ตไว",
    d:"Lev สูง=กำไร/ขาดทุนทวีคูณ。1x→100x。พี่กั๊กชอบ 3-5x ปลอดภัย。ยิ่งสูงจุดล้างพอร์ตยิ่งใกล้ราคาเข้า ต้อง widen SL。" },
};

function tipInit(){
  if (!document.getElementById('tipBox')) {
    const box=document.createElement("div"); box.id="tipBox"; document.body.appendChild(box);
  }
  const box=document.getElementById('tipBox');
  let hideT=null;
  function show(key,x,y){
    const d=TOOL_DATA[key]; if(!d)return;
    box.innerHTML=`<h4>${d.t}</h4><span class="tag use">ใช้: ${d.use}</span> <span class="tag ben">ประโยชน์: ${d.ben}</span><p>${d.d}</p>`;
    box.classList.add("show");
    const r=box.getBoundingClientRect();
    let px=x+14, py=y+14;
    if(px+r.width>innerWidth-10) px=x-r.width-14;
    if(py+r.height>innerHeight-10) py=y-r.height-14;
    box.style.left=px+"px"; box.style.top=py+"px";
  }
  function hide(){ box.classList.remove("show"); }
  // delegate hover on .info elements
  document.addEventListener("mouseover",e=>{
    const el=e.target.closest(".info"); if(!el)return;
    clearTimeout(hideT); show(el.dataset.tip, e.clientX, e.clientY);
  });
  document.addEventListener("mousemove",e=>{
    if(box.classList.contains("show") && e.target.closest(".info")){
      const r=box.getBoundingClientRect();
      let px=e.clientX+14, py=e.clientY+14;
      if(px+r.width>innerWidth-10) px=e.clientX-r.width-14;
      if(py+r.height>innerHeight-10) py=e.clientY-r.height-14;
      box.style.left=px+"px"; box.style.top=py+"px";
    }
  });
  document.addEventListener("mouseout",e=>{
    if(e.target.closest(".info")) hideT=setTimeout(hide,120);
  });
}

function manualInit(){
  if (document.getElementById("manualPanel")) return;
  const p=document.createElement("div"); p.id="manualPanel";
  const cards=Object.entries(TOOL_DATA).map(([k,d])=>`
    <div class="card"><h3>${d.t}<span class="badge">${k.toUpperCase()}</span></h3>
      <p><b>ทำอะไร:</b> ${d.use}</p>
      <p><b>ประโยชน์ในการสแกน:</b> ${d.ben}</p>
      <p>${d.d}</p></div>`).join("");
  p.innerHTML=`<div class="box">
    <button class="close" onclick="document.getElementById('manualPanel').classList.remove('show')">✕ ปิด</button>
    <h2>📖 คู่มือเครื่องมือเทรด</h2>
    <div class="sub">อธิบาย Indicator แต่ละตัว — ทำอะไรได้บ้าง และช่วยหาโอกาสในการสแกน/วางแผนเทรดอย่างไร</div>
    <div class="grid2">${cards}</div>
  </div>`;
  document.body.appendChild(p);
  p.addEventListener("click",e=>{ if(e.target===p) p.classList.remove("show"); });
  // bind manual button
  document.addEventListener("click",e=>{
    const b=e.target.closest(".manual"); if(b){ p.classList.add("show"); }
  });
}

document.addEventListener("DOMContentLoaded",()=>{ tipInit(); manualInit(); });
