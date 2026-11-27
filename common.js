/* Mã dùng chung cho tv.html, scan.html, cai-dat.html */
const $=s=>document.querySelector(s), LET=['A','B','C','D'];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const PL={F:null,L:null,off:0,hold:0,api:localStorage.getItem('pl_api')||'',onchange:null,onerror:null};

function askApi(){
  const v=prompt('Dán URL ứng dụng web Apps Script (kết thúc bằng /exec):',PL.api);
  if(v){PL.api=v.trim();localStorage.setItem('pl_api',PL.api);return true}
  return false;
}
async function get(a){
  const t0=Date.now(),r=await fetch(PL.api+'?action='+a,{cache:'no-store'}),j=await r.json();
  j._t=(t0+Date.now())/2;return j;
}
async function post(o){
  for(let i=0;i<4;i++){
    try{const r=await fetch(PL.api,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(o)});
        const j=await r.json();if(j.ok)return j}catch(e){}
    await new Promise(r=>setTimeout(r,800));
  }
}
const srvNow=()=>Date.now()+PL.off;
const secOf=n=>{const Q=PL.F&&PL.F.questions[n-1];return Q&&Q.sec>0?Q.sec:90};

function timerVals(t, st, now) {
  const sec = Number(t.sec) || 90, tend = Number(st.tend) || 0;
  const run = st.tst === 'run' && tend > now;
  const sv = (left, end, state) => ({ tleft: left, tend: end, tst: state });
  if (t.mode === 'restart') return sv(sec * 1000, now + sec * 1000, 'run');
  if (t.mode === 'reset') return sv(sec * 1000, 0, 'idle');
  if (t.mode === 'start') {
    if (run) return {};
    const left = (st.tst === 'pause' && Number(st.tleft) > 0) ? Number(st.tleft) : sec * 1000;
    return sv(left, now + left, 'run');
  }
  if (t.mode === 'pause') return run ? sv(Math.max(0, tend - now), 0, 'pause') : {};
  if (t.mode === 'add') {
    const ms = Number(t.ms) || 0;
    if (run) return { tend: tend + ms };
    const base = st.tst === 'pause' ? (Number(st.tleft) || 0) : (st.tst === 'run' ? 0 : sec * 1000);
    return sv(base + ms, 0, 'pause');
  }
  return {};
}

async function loadFull(){
  const F=await get('full');
  PL.off=F.now-F._t;PL.F=F;
  PL.L={state:F.state,answers:F.results.filter(r=>r.cau===Number(F.state.cau))};
  PL.onchange&&PL.onchange();
}
async function poll(){
  if(!PL.api||Date.now()<PL.hold)return;
  try{
    const n=await get('live'),s=n.state,F=PL.F;
    PL.off=n.now-n._t;
    if(!F||s.lop!==F.state.lop||s.bo!==F.state.bo||String(s.phien)!==String(F.state.phien))await loadFull();
    else{F.state=s;PL.L=n;PL.onchange&&PL.onchange()}
  }catch(e){PL.onerror&&PL.onerror()}
}
async function boot(){
  if(!PL.api&&!askApi())return false;
  try{await loadFull()}catch(e){PL.onerror&&PL.onerror()}
  setInterval(poll,1500);return true;
}

/* ---- lệnh điều khiển: cập nhật ngay trên máy này rồi gửi lên Sheet ---- */
async function send(values,timer){
  const st=PL.L.state,vals=Object.assign({},values||{});
  if(timer)Object.assign(vals,timerVals(timer,Object.assign({},st,vals),srvNow()));
  Object.assign(st,vals);
  PL.hold=Date.now()+30000;PL.onchange&&PL.onchange();
  await post({action:'set',values:values||{},timer:timer||null});
  PL.hold=Date.now()+1500;
}
function go(d){
  const st=PL.L.state,n=Math.min(PL.F.questions.length,Math.max(1,Number(st.cau)+d));
  if(n===Number(st.cau))return;
  PL.L.answers=[];send({cau:n,mo:1,rev:0,sum:0},{mode:'restart',sec:secOf(n)});
}
function reveal(){
  const r=Number(PL.L.state.rev)===1?0:1;
  send(r?{rev:1,mo:0}:{rev:0},r?{mode:'pause'}:null);
}
const lock=()=>send({mo:Number(PL.L.state.mo)===1?0:1});
const tmr=(mode,ms)=>send(null,{mode,ms,sec:secOf(Number(PL.L.state.cau))});
const toggle=k=>send({[k]:Number(PL.L.state[k])===1?0:1});
const zoomBy=d=>send({z:Math.min(2,Math.max(.6,+((Number(PL.L.state.z)||1)+d).toFixed(2)))});
function remainMs(){
  const st=PL.L.state;
  if(st.tst==='run')return Number(st.tend)-srvNow();
  if(st.tst==='pause')return Number(st.tleft)||0;
  return secOf(Number(st.cau))*1000;
}
function newSession(){return send({phien:'P'+Date.now(),cau:1,mo:1,rev:0,sum:0},{mode:'reset',sec:secOf(1)})}
const summaryTotal=()=>new Set(PL.F.results.map(r=>r.cau)).size;   // số câu đã có người trả lời
function summaryRows(){
  const key=new Map(PL.F.questions.map((q,i)=>[i+1,q.ok]));
  const sc=new Map(PL.F.students.map(s=>[s.id,{n:s.name,ok:0,done:0}]));
  PL.F.results.forEach(r=>{const x=sc.get(r.id);if(!x)return;x.done++;if(key.get(r.cau)===r.ans)x.ok++});
  return [...sc.values()].sort((a,b)=>b.ok-a.ok||a.n.localeCompare(b.n,'vi'));
}
