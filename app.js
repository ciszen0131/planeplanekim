// 브라우저용 시각화 스크립트
const ROWS = 30;
const SEAT_ROWS = ['A','B','C','D','E','F','G','H','I'];
const COLUMN_SEAT_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'I', 'H', 'G'];

const ENTRY_DELAY = 2;
const BASE_SIT_TIME = 4;
const TICK_MS = 60;       // 애니메이션 재생 속도
const TICK_SECONDS = 1;
const WALK_SPEED = 140;   // px/sec
const MIN_SPACING = 40;
const GRID_STEP = 40;

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
  return seats.map(s=>({seat:s,seatRow:s[0],col:parseInt(s.slice(1)),aisle:getAisle(s[0]),currentCol:0,state:'waiting',timer:0,moveCooldown:0,vip:false}));
}

let bottleneckCount = 0;
let bottleneckTime = 0;
let currentTick = 0;
let displayTime = 0;
let displayCount = 0;
let displayBottleneck = 0;
let speedFactor = 1.0;
let densityFactor = 1.0;
let layoutData = null;

function updatePassengers(activePassengers){
  let blockedThisTick = 0;
  const occupied = new Set();

  for(const p of activePassengers){
    if(p.state !== 'walking') continue;
    const key = `${Math.round(p.pos.x)}|${Math.round(p.pos.y)}`;
    occupied.add(key);
  }

  for(const p of activePassengers){
    if(p.state !== 'walking') continue;
    if(!p.path || p.pathIndex >= p.path.length - 1){
      p.state = 'seated';
      seatMap[p.seat] = true;
      continue;
    }

    const next = p.path[p.pathIndex + 1];
    const nextKey = `${Math.round(next.x)}|${Math.round(next.y)}`;
    if(occupied.has(nextKey)){
      bottleneckCount++;
      blockedThisTick++;
      continue;
    }

    occupied.delete(`${Math.round(p.pos.x)}|${Math.round(p.pos.y)}`);
    p.pos.x = next.x;
    p.pos.y = next.y;
    occupied.add(nextKey);
    p.pathIndex++;
  }

  return blockedThisTick;
}

function tickSimulation(passengers, activePassengers){
  currentTick++;
  const entryDelay = Math.max(1, Math.round(ENTRY_DELAY / densityFactor));
  if(currentTick % entryDelay === 0){
    const next = passengers.find(p=>p.state==='waiting');
    if(next && layoutData){
      const path = buildPassengerPath(next.seat);
      if(path){
        next.path = path;
        next.pathIndex = 0;
        next.pos = { x: path[0].x, y: path[0].y };
        next.state = 'walking';
        activePassengers.push(next);
      }
    }
  }
  const blocked = updatePassengers(activePassengers);
  if(blocked > 0){
    bottleneckTime += TICK_MS / 1000;
  }
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
const speedControl = document.getElementById('speedControl');
const densityControl = document.getElementById('densityControl');
const speedValue = document.getElementById('speedValue');
const densityValue = document.getElementById('densityValue');
const passengerSide = document.getElementById('passengerSide');
let selectedMode = 'sorted';

// visual constants (match CSS)
const SEAT_WIDTH = 32;
const SEAT_GAP = 8;
const LABEL_WIDTH = 60;
let movingElems = {};

function lerp(a, b, t){
  return a + (b - a) * t;
}

function clamp(val, min, max){
  return Math.max(min, Math.min(max, val));
}

function easeInOut(t){
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

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

function updateLayout(){
  const seatingCard = seatsContainer.closest('.seating-card');
  if(!seatingCard) return;
  const seatingRect = seatingCard.getBoundingClientRect();
  const seatCenters = {};
  document.querySelectorAll('.seat').forEach((seatEl)=>{
    const rect = seatEl.getBoundingClientRect();
    seatCenters[seatEl.dataset.seat] = {
      x: rect.left - seatingRect.left + (rect.width - 18) / 2,
      y: rect.top - seatingRect.top + (rect.height - 18) / 2,
    };
  });

  const rowC = seatsContainer.querySelector('.seat-row[data-row="C"]');
  const rowD = seatsContainer.querySelector('.seat-row[data-row="D"]');
  const rowF = seatsContainer.querySelector('.seat-row[data-row="F"]');
  const rowG = seatsContainer.querySelector('.seat-row[data-row="G"]');
  const rowI = seatsContainer.querySelector('.seat-row[data-row="I"] .seat-row-cells');

  const getMidY = (topEl, bottomEl) => {
    if(!topEl || !bottomEl) return seatingRect.height * 0.5;
    const topBox = topEl.getBoundingClientRect();
    const bottomBox = bottomEl.getBoundingClientRect();
    const mid = (topBox.bottom + bottomBox.top) / 2;
    return mid - seatingRect.top - 9;
  };

  const aisleTopY = getMidY(rowC, rowD);
  const aisleBottomY = getMidY(rowF, rowG);
  const entryRect = rowI ? rowI.getBoundingClientRect() : null;
  const entryX = entryRect ? (entryRect.left - seatingRect.left - 34) : -34;
  const entryY = seatingRect.height - 6;

  layoutData = {
    seatingRect,
    seatCenters,
    aisleTopY,
    aisleBottomY,
    entryX,
    entryY,
  };
}

function buildPassengerPath(seatId){
  if(!layoutData || !layoutData.seatCenters[seatId]) return null;
  const seatCenter = layoutData.seatCenters[seatId];
  const row = seatId[0];
  const isTop = ['A','B','C','D'].includes(row);
  const waypoints = [];
  const addSegment = (from, to) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if(dist < 1){
      return;
    }
    const steps = Math.max(1, Math.round(dist / GRID_STEP));
    for(let i = 1; i <= steps; i++){
      waypoints.push({
        x: from.x + (dx * i) / steps,
        y: from.y + (dy * i) / steps,
      });
    }
  };

  const start = { x: layoutData.entryX, y: layoutData.entryY };
  const bottomEntry = { x: layoutData.entryX, y: layoutData.aisleBottomY };
  addSegment(start, bottomEntry);
  if(isTop){
    const topEntry = { x: layoutData.entryX, y: layoutData.aisleTopY };
    addSegment(bottomEntry, topEntry);
    addSegment(topEntry, { x: seatCenter.x, y: layoutData.aisleTopY });
  } else {
    addSegment(bottomEntry, { x: seatCenter.x, y: layoutData.aisleBottomY });
  }
  addSegment({ x: seatCenter.x, y: isTop ? layoutData.aisleTopY : layoutData.aisleBottomY }, { x: seatCenter.x, y: seatCenter.y });
  return [{ x: start.x, y: start.y }, ...waypoints];
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
  const targetTime = currentTick * TICK_SECONDS;
  displayTime = lerp(displayTime, targetTime, 0.12);
  displayCount = lerp(displayCount, seated, 0.18);
  displayBottleneck = lerp(displayBottleneck, bottleneckTime, 0.1);
  timeEl.textContent = `${displayTime.toFixed(0)}s`;
  countEl.textContent = `${Math.round(displayCount)} / ${total}명`;
  progressBar.style.width = `${Math.round((seated/total)*100)}%`;
  bottleneckEl.textContent = `${displayBottleneck.toFixed(0)}s`;

  // passenger side (waiting icons) - render bottom-up stack matching waiting queue
  passengerSide.innerHTML = '';

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
    if(p.state !== 'walking') continue;
    const id = `walker-${p.seat}`;
    seen.add(id);
    let el = movingElems[id];
    if(!el){
      el = document.createElement('div');
      el.className='walker'; el.id=id; layer.appendChild(el); movingElems[id]=el;
    }
    el.style.transform = `translate(${Math.round(p.pos.x)}px, ${Math.round(p.pos.y)}px)`;
    el.style.opacity = '1';
  }

  for(const id in movingElems){
    if(!seen.has(id)){ const e = movingElems[id]; if(e && e.parentNode) e.parentNode.removeChild(e); delete movingElems[id]; }
  }
}

// --- controller ---
let animationId = null;
let globalPassengers = [];
let globalActive = [];
let lastFrameTime = 0;
let accumulator = 0;

function startSimulation(mode='random'){
  resetSeatMap(); currentTick=0; bottleneckCount=0; bottleneckTime=0; globalActive=[];
  displayTime = 0; displayCount = 0; displayBottleneck = 0;
  buildSeatGrid();
  updateLayout();
  const orderFn = {random:randomOrder, sorted:sortedOrder, column:columnOrder};
  const seats = (orderFn[mode]||randomOrder)();
  globalPassengers = createPassengers(seats);
  render(globalPassengers, globalActive);

  if(animationId) cancelAnimationFrame(animationId);
  lastFrameTime = performance.now();
  accumulator = 0;
  animationId = requestAnimationFrame(loop);
}

function pauseSimulation(){ if(animationId){ cancelAnimationFrame(animationId); animationId=null; } }

function loop(now){
  const delta = now - lastFrameTime;
  lastFrameTime = now;
  accumulator += delta;
  if(accumulator >= TICK_MS){
    tickSimulation(globalPassengers, globalActive);
    accumulator = 0;
  }
  render(globalPassengers, globalActive);
  if(allSeated(globalPassengers)){
    if(animationId){ cancelAnimationFrame(animationId); animationId=null; }
    return;
  }
  animationId = requestAnimationFrame(loop);
}

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

function updateControls(){
  speedFactor = parseFloat(speedControl.value);
  densityFactor = parseFloat(densityControl.value);
  speedValue.textContent = `${speedFactor.toFixed(1)}x`;
  densityValue.textContent = `${densityFactor.toFixed(1)}x`;
}

speedControl.addEventListener('input', updateControls);
densityControl.addEventListener('input', updateControls);
updateControls();

// 초기 화면 구성
buildSeatGrid();
updateLayout();
window.addEventListener('resize', updateLayout);
