const ROWS = 30;
const SEAT_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

const ENTRY_DELAY = 2;
const BASE_SIT_TIME = 4;
const TICK_MS = 80;       // 애니메이션 재생 속도 (ms) - 건드리지 말 것

const ENTRY_DELAY = 2;
const BASE_SIT_TIME = 4;
const TICK_MS = 80;       // 애니메이션 재생 속도 (ms) - 건드리지 말 것
const TICK_SECONDS = 1;   // 1틱 = 현실 몇 초 (현실 시간 환산 기준)

// --------------------
// 복도 배정
// A·B·C·D → TOP (복도1, C↔D 사이)
// E·F·G·H·I → BOT (복도2, F↔G 사이)
// --------------------
function getAisle(seatRow) {
    return ['A', 'B', 'C', 'D'].includes(seatRow) ? 'TOP' : 'BOT';
}

// --------------------
// 좌석 막힘 관계
// 복도에서 접근 시 먼저 통과해야 하는 좌석
// ex) A에 앉으려면 B, C가 비어있어야 빠름
// --------------------
const BLOCKING = {
    A: ['B', 'C'],
    B: ['C'],
    C: [],
    D: [],
    E: [],
    F: [],
    G: [],
    H: ['G'],
    I: ['G', 'H'],
};

// --------------------
// 좌석 맵 초기화
// key: "A15" 형식, value: false(빈자리) / true(착석)
// --------------------
let seatMap = {};

function resetSeatMap() {
    seatMap = {};
    for (let col = 1; col <= ROWS; col++) {
        for (const sr of SEAT_ROWS) {
            seatMap[`${sr}${col}`] = false;
        }
    }
}

// --------------------
// 착석 패널티 계산
// 옆자리에 이미 앉은 사람이 있으면 +5틱
// --------------------
function extraSeatTime(seat) {
    const seatRow = seat[0];
    const col = parseInt(seat.slice(1));
    let extra = 0;
    for (const blocked of BLOCKING[seatRow] || []) {
        if (seatMap[`${blocked}${col}`]) extra += 5;
    }
    return extra;
}

// --------------------
// 승객 객체 생성
// --------------------
function createPassengers(seats) {
    return seats.map(seat => {
        const seatRow = seat[0];
        const col = parseInt(seat.slice(1));
        return {
            seat,
            seatRow,
            col,
            aisle: getAisle(seatRow),
            currentCol: 0,       // 현재 복도 위치 (0 = 미입장)
            state: 'waiting',    // waiting → walking → sitting → seated
            timer: 0,            // sitting 카운트다운
            moveCooldown: 0,     // 이동 후 대기 틱
        };
    });
}

// --------------------
// 병목 집계
// 이동하려 했지만 앞이 막혀서 못 움직인 횟수
// --------------------
let bottleneckCount = 0;

// --------------------
// 승객 상태 업데이트 (매 틱 호출)
// --------------------
function updatePassengers(activePassengers) {

    // 복도별 점유 위치 추적 (충돌 방지)
    const aisleOcc = { TOP: new Set(), BOT: new Set() };
    for (const p of activePassengers) {
        if (p.state === 'walking') aisleOcc[p.aisle].add(p.currentCol);
    }

    for (const p of activePassengers) {

        // ── 착석 완료 ──
        if (p.state === 'seated') continue;

        // ── 앉는 중 ──
        if (p.state === 'sitting') {
            p.timer--;
            if (p.timer <= 0) {
                p.state = 'seated';
                seatMap[p.seat] = true;
            }
            continue;
        }

        // ── 이동 중 ──
        if (p.state === 'walking') {

            if (p.moveCooldown > 0) {
                p.moveCooldown--;
                continue;
            }

            const next = p.currentCol + 1;

            // 앞 칸이 막혀있으면 대기 → 병목 카운트
            if (aisleOcc[p.aisle].has(next)) {
                bottleneckCount++;
                continue;
            }

            // 이동
            aisleOcc[p.aisle].delete(p.currentCol);
            p.currentCol = next;
            aisleOcc[p.aisle].add(next);

            // TOP 복도(4행): 쿨다운 3
            // BOT 복도(5행): 더 혼잡하므로 쿨다운 4
            p.moveCooldown = p.aisle === 'TOP' ? 3 : 4;

            // 목표 열 도착 → 착석 시작
            if (p.currentCol >= p.col) {
                p.state = 'sitting';
                p.timer = BASE_SIT_TIME + extraSeatTime(p.seat);
            }
        }
    }
}

// --------------------
// 단일 틱 실행
// --------------------
let currentTick = 0;

function tickSimulation(passengers, activePassengers) {
    currentTick++;

    // 복도별로 매 ENTRY_DELAY틱마다 1명씩 입장
    if (currentTick % ENTRY_DELAY === 0) {
        for (const aisle of ['TOP', 'BOT']) {
            const next = passengers.find(
                p => p.state === 'waiting' && p.aisle === aisle
            );
            if (next) {
                next.state = 'walking';
                next.currentCol = 0;
                activePassengers.push(next);
            }
        }
    }

    updatePassengers(activePassengers);
}

// --------------------
// 전원 착석 여부
// --------------------
function allSeated(passengers) {
    return passengers.length > 0 && passengers.every(p => p.state === 'seated');
}

// --------------------
// 탑승 순서 생성
// --------------------

// 랜덤
function randomOrder() {
    let seats = [];
    for (let c = 1; c <= ROWS; c++)
        for (const sr of SEAT_ROWS)
            seats.push(`${sr}${c}`);
    for (let i = seats.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [seats[i], seats[j]] = [seats[j], seats[i]];
    }
    return seats;
}

// 뒷줄 우선 (col 30 → 1)
function sortedOrder() {
    let seats = [];
    for (let c = ROWS; c >= 1; c--)
        for (const sr of SEAT_ROWS)
            seats.push(`${sr}${c}`);
    return seats;
}

// 열(행) 우선 (seatRow 순, 각 행 뒤에서부터)
function columnOrder() {
    let seats = [];
    for (const sr of SEAT_ROWS)
        for (let c = ROWS; c >= 1; c--)
            seats.push(`${sr}${c}`);
    return seats;
}

// --------------------
// 시뮬레이션 실행
// --------------------
async function simulate(mode = 'random') {
    resetSeatMap();
    currentTick = 0;

    const orderFn = { random: randomOrder, sorted: sortedOrder, column: columnOrder };
    const seats = (orderFn[mode] || randomOrder)();

    const passengers = createPassengers(seats);
    const activePassengers = [];

    console.log(`===== ${mode.toUpperCase()} =====`);

    while (!allSeated(passengers)) {
        tickSimulation(passengers, activePassengers);
    }

    const minutes = (currentTick * TICK_SECONDS / 60).toFixed(1);
    console.log(`총 틱: ${currentTick}`);
    console.log(`현실 시간: 약 ${minutes}분`);

    return { ticks: currentTick, minutes };
}

// --------------------
// 실행
// --------------------
(async () => {
    await simulate('random');
    await simulate('sorted');
    await simulate('column');
})();