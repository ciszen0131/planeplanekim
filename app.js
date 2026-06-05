const ROWS = 30;
const SEAT_ROWS = ['A','B','C','D','E','F','G','H','I'];
const COLUMN_SEAT_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'I', 'H', 'G'];

const ENTRY_DELAY = 2;
const BASE_SIT_TIME = 2;
const INNER_SEAT_STEP_TIME = 0.75;
const PASS_SEATED_TIME = 3;
const LUGGAGE_CHANCE = 0.35;
const LUGGAGE_MIN_TIME = 1;
const LUGGAGE_MAX_TIME = 4;
const TICK_MS = 100;
const TICK_SECONDS = 0.2;
const WALK_SPEED = 48;
const MIN_SPACING = 20;
const ENTRY_SPACING = 20; 
const GRID_STEP = 32;
const PATH_STEP = 8;
const WALKER_SIZE = 18;

let seatMap = {};
function resetSeatMap(){
  seatMap = {};
  for(let c=1;c<=ROWS;c++) for(const r of SEAT_ROWS) seatMap[`${r}${c}`]=false;
}

function getAisle(seatRow){ return ['A','B','C','D'].includes(seatRow)?'TOP':'BOT'; }

function createPassengers(seats){
  return seats.map(item=>{
    const s = typeof item === 'string' ? item : item.seat;
    const aisle = typeof item === 'string' ? getAisle(s[0]) : (item.aisle || getAisle(s[0]));
    const hasLuggage = Math.random() < LUGGAGE_CHANCE;
    const luggageDelay = hasLuggage
      ? LUGGAGE_MIN_TIME + Math.floor(Math.random() * (LUGGAGE_MAX_TIME - LUGGAGE_MIN_TIME + 1))
      : 0;
    return {
      seat:s,
      seatRow:s[0],
      col:parseInt(s.slice(1)),
      aisle,
      currentCol:0,
      state:'waiting',
      timer:0,
      moveCooldown:0,
      vip:false,
      hasLuggage,
      luggageDelay,
    };
  });
}

let bottleneckCount = 0;
let bottleneckTime = 0;
let bottleneckActive = false;
let currentTick = 0;
let displayTime = 0;
let displayCount = 0;
let displayBottleneck = 0;
let speedFactor = 1.0;
let densityFactor = 1.0;
let layoutData = null;

function isInSeatAisle(pos){
  if(!layoutData || !pos) return false;
  const insidePlane = pos.x > layoutData.entryX + WALKER_SIZE;
  const inTopAisle = Math.abs(pos.y - layoutData.aisleTopY) < WALKER_SIZE;
  const inBottomAisle = Math.abs(pos.y - layoutData.aisleBottomY) < WALKER_SIZE;
  return insidePlane && (inTopAisle || inBottomAisle);
}

function passengerBlocksMove(other, next){
  if(!other.pos || (other.state !== 'walking' && other.state !== 'sitting')) return false;
  const distance = Math.hypot(other.pos.x - next.x, other.pos.y - next.y);
  return distance < MIN_SPACING;
}

function keepSpacingBehind(p, blocker){
  if(!p.pos || !blocker || !blocker.pos || !p.path) return;
  let bestIndex = p.pathIndex;
  for(let i = p.pathIndex; i >= 0; i--){
    const point = p.path[i];
    if(Math.hypot(point.x - blocker.pos.x, point.y - blocker.pos.y) >= MIN_SPACING){
      bestIndex = i;
      break;
    }
  }
  p.pathIndex = bestIndex;
  p.pos.x = p.path[bestIndex].x;
  p.pos.y = p.path[bestIndex].y;
}

function markPassengerSeated(p){
  p.state = 'seated';
  p.blocked = false;
  p.pos = null;
  p.path = null;
  p.pathIndex = 0;
  seatMap[p.seat] = true;
}

function innerSeatDepth(p){
  const topDepth = {C:0, D:0, B:1, E:1, A:2, F:2};
  const bottomDepth = {F:0, G:0, E:1, H:1, D:2, I:2};
  const row = p.seatRow;
  const depthMap = p.aisle === 'TOP' ? topDepth : bottomDepth;
  return depthMap[row] || 0;
}

function seatedRowsToPass(p){
  const topBlockers = {
    A:['C','B'],
    B:['C'],
    C:[],
    D:[],
    E:['D'],
    F:['D','E'],
  };
  const bottomBlockers = {
    D:['F','E'],
    E:['F'],
    F:[],
    G:[],
    H:['G'],
    I:['G','H'],
  };
  const blockers = p.aisle === 'TOP' ? topBlockers : bottomBlockers;
  return blockers[p.seatRow] || [];
}

function passSeatedTime(p){
  let delay = 0;
  for(const row of seatedRowsToPass(p)){
    if(seatMap[`${row}${p.col}`]) delay += PASS_SEATED_TIME;
  }
  return delay;
}

function seatDelayForPassenger(p){
  return BASE_SIT_TIME + (innerSeatDepth(p) * INNER_SEAT_STEP_TIME) + passSeatedTime(p) + p.luggageDelay;
}

function stepsPerTick(){
  return Math.max(1, Math.round((WALK_SPEED * TICK_SECONDS) / PATH_STEP));
}

function updatePassengers(activePassengers, tickTimers = true){
  let moved = false;
  let blocked = false;

  for(const p of activePassengers){
    p.blocked = false;
  }

  const movingOrder = activePassengers
    .slice()
    .sort((a, b) => (b.pathIndex || 0) - (a.pathIndex || 0));

  for(const p of movingOrder){
    if(p.state === 'seated') continue;

    if(p.state === 'sitting'){
      if(tickTimers){
        p.timer--;
        if(p.timer <= 0){
          markPassengerSeated(p);
        }
      }
      continue;
    }

    if(p.state === 'walking'){
      if(!p.path || p.pathIndex >= p.path.length - 1){
        p.state = 'sitting';
        p.timer = seatDelayForPassenger(p);
        continue;
      }

      const next = p.path[p.pathIndex + 1];
      const blocker = activePassengers.find(other => other !== p && passengerBlocksMove(other, next));

      if(blocker){
        keepSpacingBehind(p, blocker);
        p.blocked = isInSeatAisle(p.pos) || isInSeatAisle(next);
        blocked = blocked || p.blocked;
        continue;
      }

      p.pos.x = next.x;
      p.pos.y = next.y;
      p.pathIndex++;
      moved = true;

      if(p.seatEntryIndex != null && p.pathIndex >= p.seatEntryIndex){
        p.state = 'sitting';
        p.timer = seatDelayForPassenger(p);
      }
    }
  }

  for(let i = activePassengers.length - 1; i >= 0; i--){
    if(activePassengers[i].state === 'seated'){
      activePassengers.splice(i, 1);
    }
  }

  return { moved, blocked };
}

function canEnterPath(path, activePassengers){
  const entry = path[0];
  return !activePassengers.some(p => {
    if(!p.pos || (p.state !== 'walking' && p.state !== 'sitting')) return false;
    return Math.hypot(p.pos.x - entry.x, p.pos.y - entry.y) < ENTRY_SPACING;
  });
}

function admitNextPassenger(passengers, activePassengers){
  const next = passengers.find(p=>p.state==='waiting');
  if(!next || !layoutData) return false;
  const path = buildPassengerPath(next.seat, next.aisle);
  if(path && canEnterPath(path, activePassengers)){
    next.path = path;
    next.pathIndex = 0;
    next.seatEntryIndex = path.seatEntryIndex;
    next.pos = { x: path[0].x, y: path[0].y };
    next.state = 'walking';
    activePassengers.push(next);
    return true;
  }
  return false;
}

function tickSimulation(passengers, activePassengers){
  currentTick++;
  const subSteps = stepsPerTick();
  let blockedThisTick = false;

  for(let step = 0; step < subSteps; step++){
    admitNextPassenger(passengers, activePassengers);
    const result = updatePassengers(activePassengers, step === 0);
    blockedThisTick = result.blocked || blockedThisTick;
  }
  const isBottleneck = blockedThisTick;
  if(isBottleneck && !bottleneckActive){
    bottleneckActive = true;
  }
  if(!isBottleneck && bottleneckActive){
    bottleneckActive = false;
    bottleneckCount++;
  }
  if(isBottleneck){
    bottleneckTime += TICK_SECONDS;
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
function efficientOrder(){
  const seats = [];
  const columns = [];
  for(let c=ROWS;c>=1;c-=2) columns.push(c);
  for(let c=ROWS-1;c>=1;c-=2) columns.push(c);

  const waves = [
    [['A'], ['I']],
    [['B'], ['H']],
    [['C'], ['G']],
    [['E'], []],
    [['D'], ['F']],
  ];

  for(const [topRows, bottomRows] of waves){
    columns.forEach((col, colIndex)=>{
      for(const row of topRows){
        seats.push(row === 'E' ? { seat: `${row}${col}`, aisle: colIndex % 2 === 0 ? 'TOP' : 'BOT' } : `${row}${col}`);
      }
      for(const row of bottomRows){
        seats.push(row === 'E' ? { seat: `${row}${col}`, aisle: 'BOT' } : `${row}${col}`);
      }
    });
  }
  return seats;
}
const seatsContainer = document.getElementById('seats');
const timeEl = document.getElementById('time');
const countEl = document.getElementById('count');
const progressBar = document.getElementById('progressBar');
const bottleneckEl = document.getElementById('bottleneck');

const passengerSide = document.getElementById('passengerSide');
let selectedMode = 'random';

const SEAT_WIDTH = 32;
const SEAT_GAP = 8;
const LABEL_WIDTH = 60;
let movingElems = {};

function lerp(a, b, t){ return a + (b - a) * t; }
function clamp(val, min, max){ return Math.max(min, Math.min(max, val)); }
function easeInOut(t){ return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function buildSeatGrid(){
  seatsContainer.innerHTML = '';
  for(const r of SEAT_ROWS){
    const rowEl = document.createElement('div');
    rowEl.className = 'seat-row';
    rowEl.dataset.row = r;
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

  const stepX = seatCenters.A1 && seatCenters.A2 ? Math.abs(seatCenters.A2.x - seatCenters.A1.x) : GRID_STEP;
  const stepY = seatCenters.A1 && seatCenters.B1 ? Math.abs(seatCenters.B1.y - seatCenters.A1.y) : GRID_STEP;

  layoutData = { seatingRect, seatCenters, aisleTopY, aisleBottomY, entryX, entryY, stepX, stepY };
}

function buildPassengerPath(seatId, aisleOverride){
  if(!layoutData || !layoutData.seatCenters[seatId]) return null;
  const seatCenter = layoutData.seatCenters[seatId];
  const row = seatId[0];
  const isTop = aisleOverride ? aisleOverride === 'TOP' : ['A','B','C','D'].includes(row);
  const waypoints = [];
  const addSegment = (from, to) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if(dist < 1) return;
    const gridStep = Math.abs(dx) > Math.abs(dy) ? layoutData.stepX : layoutData.stepY;
    const step = Math.min(PATH_STEP, gridStep);
    const steps = Math.max(1, Math.round(dist / step));
    for(let i = 1; i <= steps; i++){
      waypoints.push({ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps });
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
  const seatEntryIndex = waypoints.length;
  addSegment({ x: seatCenter.x, y: isTop ? layoutData.aisleTopY : layoutData.aisleBottomY }, { x: seatCenter.x, y: seatCenter.y });
  const path = [{ x: start.x, y: start.y }, ...waypoints];
  path.seatEntryIndex = seatEntryIndex;
  return path;
}

function render(passengers, activePassengers){
  for(const key in seatMap){
    const el = document.querySelector(`[data-seat="${key}"]`);
    if(!el) continue;
    if(seatMap[key]){ el.classList.remove('sitting'); el.classList.add('seated'); }
    else { el.classList.remove('sitting'); }
  }
  for(const p of activePassengers){
    if(p.state==='sitting'){
      const el=document.querySelector(`[data-seat="${p.seat}"]`);
      if(el) el.classList.add('sitting');
    }
  }

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

  passengerSide.innerHTML = '';
  updateMovingLayer(passengers, activePassengers);
}

function updateMovingLayer(passengers, activePassengers){
  const seatingCard = seatsContainer.closest('.seating-card');
  if(!seatingCard) return;
  const layer = document.getElementById('movingLayer');
  if(!layer) return;

  const seatingRect = seatingCard.getBoundingClientRect();
  const refRow = seatsContainer.querySelector('.seat-row[data-row="A"]');
  const refWrap = refRow ? refRow.querySelector('.seat-row-cells') : null;
  const baseLeft = refWrap ? refWrap.getBoundingClientRect().left - seatingRect.left : 0;

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
    const id = `walker-${p.seat}`;
    seen.add(id);
    let el = movingElems[id];
    if(!el){
      el = document.createElement('div');
      el.className='walker';
      el.id=id;
      el.style.transform = `translate3d(${p.pos.x}px, ${p.pos.y}px, 0)`;
      layer.appendChild(el);
      movingElems[id]=el;
    }
    el.style.transform = `translate3d(${p.pos.x}px, ${p.pos.y}px, 0)`;
    el.style.opacity = p.state === 'sitting' ? '0.4' : '1';
    if(p.hasLuggage) el.classList.add('luggage');
    else el.classList.remove('luggage');
    if(p.blocked) el.classList.add('blocked');
    else el.classList.remove('blocked');
  }

  for(const id in movingElems){
    if(!seen.has(id)){ const e = movingElems[id]; if(e && e.parentNode) e.parentNode.removeChild(e); delete movingElems[id]; }
  }
}

let animationId = null;
let globalPassengers = [];
let globalActive = [];
let lastFrameTime = 0;
let accumulator = 0;

function startSimulation(mode='random'){
  if(animationId){
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  const oldLayer = document.getElementById('movingLayer');
  if(oldLayer) oldLayer.innerHTML = '';
  movingElems = {};

  resetSeatMap(); currentTick=0; bottleneckCount=0; bottleneckTime=0; bottleneckActive=false; globalActive=[];
  displayTime=0; displayCount=0; displayBottleneck=0;
  buildSeatGrid();
  updateLayout();
  const orderFn = {random:randomOrder, sorted:sortedOrder, column:columnOrder, efficient:efficientOrder};
  const seats = (orderFn[mode]||randomOrder)();
  globalPassengers = createPassengers(seats);
  render(globalPassengers, globalActive);

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
    render(globalPassengers, globalActive);
    if(allSeated(globalPassengers)){
      const total = globalPassengers.length;
      displayCount = total;
      countEl.textContent = `${total} / ${total}명`;
      progressBar.style.width = "100%";
      if(animationId){ cancelAnimationFrame(animationId); animationId=null; }
      return;
    }
  }
  animationId = requestAnimationFrame(loop);
}

document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    btn.classList.add('active');
    const txt = btn.textContent.trim();
    if(txt === '무작위') selectedMode = 'random';
    else if(txt === '뒤에서') selectedMode = 'sorted';
    else selectedMode = 'column';
  });
});

const modes = ['random', 'sorted', 'column', 'efficient'];
document.querySelectorAll('.tab').forEach((btn, index)=>{
  btn.addEventListener('click', ()=>{
    selectedMode = modes[index] || 'random';
  });
});

document.getElementById('start').addEventListener('click', ()=> startSimulation(selectedMode));
document.getElementById('pause').addEventListener('click', pauseSimulation);



buildSeatGrid();
updateLayout();
window.addEventListener('resize', updateLayout);
