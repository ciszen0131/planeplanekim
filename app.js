// 브라우저용 시각화 스크립트
const ROWS = 30;
const SEAT_ROWS = ['A','B','C','D','E','F','G','H','I'];
const COLUMN_SEAT_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'I', 'H', 'G'];

const ENTRY_DELAY = 2;
const BASE_SIT_TIME = 4;
const TICK_MS = 80;       // 애니메이션 재생 속도
const TICK_SECONDS = 1;

const BLOCKING = {A:['B','C'],B:['C'],C:[],D:[],E:[],F:[],G:[],H:['G'],I:['G','H']};

let seatMap = {};
function resetSeatMap(){
  seatMap = {};
  for(let c=1;c<=ROWS;c++) for(const r of SEAT_ROWS) seatMap[`${r}${c}`]=false;
}

function extraSeatTime(seat){
  const row = seat[0]; const col = parseInt(seat.slice(1)); let extra=0;
  for(const b of (BLOCKING[row]||[])) if(seatMap[`${b}${col}`]) extra+=5;
  return extra;
}

function getAisle(seatRow){ return ['A','B','C','D'].includes(seatRow)?'TOP':'BOT'; }

function createPassengers(seats){
  return seats.map(s=>({seat:s,seatRow:s[0],col:parseInt(s.slice(1)),aisle:getAisle(s[0]),currentCol:0,state:'waiting',timer:0,moveCooldown:0}));
}

let bottleneckCount = 0;
let currentTick = 0;

function updatePassengers(activePassengers){
  const aisleOcc={TOP:new Set(),BOT:new Set()};
  for(const p of activePassengers) if(p.state==='walking') aisleOcc[p.aisle].add(p.currentCol);

  const sittingCols = { TOP: new Set(), BOT: new Set() };
  for(const p of activePassengers){
    if(p.state === 'sitting') sittingCols[p.aisle].add(p.currentCol);
  }

  for(const p of activePassengers){
    if(p.state==='seated') continue;
    if(p.state==='sitting'){ p.timer--; if(p.timer<=0){ p.state='seated'; seatMap[p.seat]=true; } continue; }
    if(p.state==='walking'){
      if(p.moveCooldown>0){ p.moveCooldown--; continue; }
      const next = p.currentCol+1;
      if(aisleOcc[p.aisle].has(next)){ continue; }
      aisleOcc[p.aisle].delete(p.currentCol);
      p.currentCol = next;
      aisleOcc[p.aisle].add(next);
      p.moveCooldown = p.aisle==='TOP'?3:4;
      if(p.currentCol >= p.col){ p.state='sitting'; p.timer = BASE_SIT_TIME + extraSeatTime(p.seat); }
    }
  }

  // 병목: 쿨다운 없는 walking 승객이 sitting 승객 때문에 막힌 경우만 카운트
  for(const aisle of ['TOP','BOT']){
    const blockedBySitting = activePassengers.some(p =>
      p.state === 'walking' &&
      p.aisle === aisle &&
      p.moveCooldown === 0 &&
      sittingCols[aisle].has(p.currentCol + 1)
    );
    if(blockedBySitting) bottleneckCount++;
  }
}

function tickSimulation(passengers, activePassengers){
  currentTick++;
  if(currentTick % ENTRY_DELAY === 0){
    for(const aisle of ['TOP','BOT']){
      // find next waiting in this aisle, but record its DOM start rect for animation
      const waitingAll = passengers.filter(p=>p.state==='waiting');
      const next = waitingAll.find(p=>p.aisle===aisle);
      if(next){
        // find waiting DOM element rendered for this passenger (data-wait="seat")
        try{
          const seatingCard = seatsContainer.closest('.seating-card');
          const waitEl = document.querySelector(`[data-wait="${next.seat}"]`);
          if(waitEl && seatingCard){
            const cardRect = seatingCard.getBoundingClientRect();
            const wRect = waitEl.getBoundingClientRect();
            next.spawnStart = { x: Math.round(wRect.left - cardRect.left + (wRect.width - 18)/2), y: Math.round(wRect.top - cardRect.top + (wRect.height - 18)/2) };
          }
        }catch(e){ /* ignore if DOM not ready */ }
        next.state='walking'; next.currentCol=0; activePassengers.push(next);
      }
    }
  }
  updatePassengers(activePassengers);
}

function allSeated(passengers){ return passengers.length>0 && passengers.every(p=>p.state==='seated'); }

function randomOrder(){
  let seats=[]; for(let c=1;c<=ROWS;c++) for(const r of SEAT_ROWS) seats.push(`${r}${c}`);
  for(let i=seats.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[seats[i],seats[j]]=[seats[j],seats[i]]}
  return seats;
}
function sortedOrder(){let seats=[]; for(let c=ROWS;c>=1;c--) for(const r of COLUMN_SEAT_ROWS) seats.push(`${r}${c}`); return seats}
function columnOrder(){let seats=[]; for(const r of COLUMN_SEAT_ROWS) for(let c=ROWS;c>=1;c--) seats.push(`${r}${c}`); return seats}

// --- DOM helpers ---
const seatsContainer = document.getElementById('seats');
const timeEl = document.getElementById('time');
const countEl = document.getElementById('count');
const progressBar = document.getElementById('progressBar');
const bottleneckEl = document.getElementById('bottleneck');
const passengerSide = document.getElementById('passengerSide');
let selectedMode = 'sorted';

// visual constants (match CSS)
const SEAT_WIDTH = 32;
const SEAT_GAP = 8;
const LABEL_WIDTH = 60;
let movingElems = {};

function buildSeatGrid(){
  seatsContainer.innerHTML = '';
  // create rows; insert visual aisle gap between C↔D and F↔G
  for(const r of SEAT_ROWS){
    const rowEl = document.createElement('div');
    rowEl.className = 'seat-row';
    rowEl.dataset.row = r;
    // add aisle gap before D and before G
    if(r === 'D' || r === 'G') rowEl.classList.add('aisle-gap');

    const label = document.createElement('div');
    label.className = 'row-label';
    label.textContent = r;
    rowEl.appendChild(label);

    const seatsWrap = document.createElement('div');
    seatsWrap.className = 'seat-row-cells';
    seatsWrap.style.display = 'flex';
    seatsWrap.style.gap = '8px';

    for(let c=1;c<=ROWS;c++){
      const s = document.createElement('div');
      s.className='seat'; s.id = `seat-${r}-${c}`; s.dataset.seat = `${r}${c}`;
      seatsWrap.appendChild(s);
    }

    rowEl.appendChild(seatsWrap);
    seatsContainer.appendChild(rowEl);
  }

  // create moving layer once
  const seatingCard = seatsContainer.closest('.seating-card');
  if(seatingCard){
    let layer = seatingCard.querySelector('.moving-layer');
    if(!layer){ layer = document.createElement('div'); layer.className='moving-layer'; layer.id='movingLayer'; seatingCard.appendChild(layer); }
  }
}

function render(passengers, activePassengers){
  // seats
  // update seats: keep 'seated' once set so filled seats retain color
  for(const key in seatMap){
    const el = document.querySelector(`[data-seat="${key}"]`);
    if(!el) continue;
    if(seatMap[key]){ el.classList.remove('sitting'); el.classList.add('seated'); }
    else { el.classList.remove('sitting'); }
  }
  // sitting (those currently in sitting state)
  for(const p of activePassengers){ if(p.state==='sitting'){ const el=document.querySelector(`[data-seat="${p.seat}"]`); if(el){ el.classList.add('sitting'); } } }


  // stats
  const total = passengers.length;
  const seated = passengers.filter(p=>p.state==='seated').length;
  timeEl.textContent = `${currentTick * TICK_SECONDS}s`;
  countEl.textContent = `${seated} / ${total}명`;
  progressBar.style.width = `${Math.round((seated/total)*100)}%`;
  bottleneckEl.textContent = `${bottleneckCount}`;

  // passenger side (waiting icons) - render bottom-up stack matching waiting queue
  passengerSide.innerHTML = '';
  const waiting = passengers.filter(p=>p.state==='waiting');
  const maxShow = 22;
  const showCount = Math.min(waiting.length, maxShow);
  // render bottom-up: append waiting elements in queue order so column-reverse displays bottom-most first
  for(let i=0;i<showCount;i++){
    const p = waiting[i];
    const div = document.createElement('div');
    div.className = 'passenger';
    div.dataset.wait = p.seat; // link DOM element to passenger by seat id
    passengerSide.appendChild(div);
  }

  updateMovingLayer(passengers, activePassengers);
}

function updateMovingLayer(passengers, activePassengers){
  const seatingCard = seatsContainer.closest('.seating-card');
  if(!seatingCard) return;
  const layer = document.getElementById('movingLayer');
  if(!layer) return;

  const seatingRect = seatingCard.getBoundingClientRect();

  // baseLeft: A행 기준으로 한 번만 계산 (모든 행의 좌석 시작 X가 동일)
  const refRow = seatsContainer.querySelector('.seat-row[data-row="A"]');
  const refWrap = refRow ? refRow.querySelector('.seat-row-cells') : null;
  const baseLeft = refWrap ? refWrap.getBoundingClientRect().left - seatingRect.left : 0;

  // 복도 Y: C↔D 사이, F↔G 사이로 고정
  function getAisleY(aisle){
    if(aisle === 'TOP'){
      const r1 = seatsContainer.querySelector('.seat-row[data-row="C"]');
      const r2 = seatsContainer.querySelector('.seat-row[data-row="D"]');
      if(r1 && r2) return (r1.getBoundingClientRect().bottom + r2.getBoundingClientRect().top) / 2 - seatingRect.top - 9;
    } else {
      const r1 = seatsContainer.querySelector('.seat-row[data-row="F"]');
      const r2 = seatsContainer.querySelector('.seat-row[data-row="G"]');
      if(r1 && r2) return (r1.getBoundingClientRect().bottom + r2.getBoundingClientRect().top) / 2 - seatingRect.top - 9;
    }
    return 0;
  }

  const seen = new Set();

  for(const p of activePassengers){
    if(p.state !== 'walking' && p.state !== 'sitting') continue;

    // X: currentCol 기준
    const x = p.currentCol <= 0
      ? baseLeft - 28
      : baseLeft + (p.currentCol - 1) * (SEAT_WIDTH + SEAT_GAP) + (SEAT_WIDTH - 18) / 2;

    // Y: 항상 복도 기준으로 고정
    const y = getAisleY(p.aisle);

    const id = `walker-${p.seat}`;
    seen.add(id);
    let el = movingElems[id];

    if(!el){
      el = document.createElement('div');
      el.className = 'walker'; el.id = id; layer.appendChild(el); movingElems[id] = el;

      if(p.spawnStart){
        const startX = p.spawnStart.x;
        const startY = p.spawnStart.y + 6;
        el.style.transform = `translate(${startX}px, ${startY}px)`;
        requestAnimationFrame(()=>{
          el.style.transform = `translate(${startX}px, ${startY - 8}px)`;
          setTimeout(()=>{
            el.style.transform = `translate(${startX}px, ${Math.round(y)}px)`;
            setTimeout(()=>{ el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; }, 120);
          }, 120);
        });
        delete p.spawnStart;
      } else {
        const sideRect = passengerSide.getBoundingClientRect();
        const startX = sideRect.left - seatingRect.left + (sideRect.width - 18) / 2 - 6;
        const startY = seatingRect.height + 12;
        el.style.transform = `translate(${startX}px, ${startY}px)`;
        requestAnimationFrame(()=>{
          el.style.transform = `translate(${startX}px, ${Math.round(y)}px)`;
          setTimeout(()=>{ el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; }, 120);
        });
      }
    } else if(p.state === 'sitting'){
      // 착석 중: 실제 좌석 위치로 이동
      const seatEl = document.querySelector(`[data-seat="${p.seat}"]`);
      if(seatEl){
        const seatRect = seatEl.getBoundingClientRect();
        const seatX = seatRect.left - seatingRect.left + (seatRect.width - 18) / 2;
        const seatY = seatRect.top - seatingRect.top + (seatRect.height - 18) / 2;
        requestAnimationFrame(()=>{
          el.style.transform = `translate(${Math.round(seatX)}px, ${Math.round(seatY)}px)`;
          el.style.opacity = '0.35';
          seatEl.classList.add('seated');
        });
      }
    } else {
      // 걷는 중: 복도 Y 고정, X만 업데이트
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      el.style.opacity = '1';
    }
  }

  for(const id in movingElems){
    if(!seen.has(id)){ const e = movingElems[id]; if(e && e.parentNode) e.parentNode.removeChild(e); delete movingElems[id]; }
  }
}

// --- controller ---
let intervalId = null;
let globalPassengers = [];
let globalActive = [];

function startSimulation(mode='random'){
  resetSeatMap(); currentTick=0; bottleneckCount=0; globalActive=[];
  buildSeatGrid();
  const orderFn = {random:randomOrder, sorted:sortedOrder, column:columnOrder};
  const seats = (orderFn[mode]||randomOrder)();
  globalPassengers = createPassengers(seats);
  render(globalPassengers, globalActive);

  if(intervalId) clearInterval(intervalId);
  intervalId = setInterval(()=>{
    tickSimulation(globalPassengers, globalActive);
    render(globalPassengers, globalActive);
    if(allSeated(globalPassengers)){
      clearInterval(intervalId); intervalId=null; console.log('완료');
    }
  }, TICK_MS);
}

function pauseSimulation(){ if(intervalId){ clearInterval(intervalId); intervalId=null; } }

// tabs: select mode
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', (e)=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    btn.classList.add('active');
    const txt = btn.textContent.trim();
    if(txt === '무작위') selectedMode = 'random';
    else if(txt === '뒤에서') selectedMode = 'sorted';
    else selectedMode = 'column';
  });
});

document.getElementById('start').addEventListener('click', ()=> startSimulation(selectedMode));
document.getElementById('pause').addEventListener('click', pauseSimulation);

// 초기 화면 구성
buildSeatGrid();