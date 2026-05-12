const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

const seatMap = {};

const TICK_SECONDS = 30;
const SIMULATION_SPEED = 1000;

let currentTick = 0;


// --------------------
// 딜레이
// --------------------

function sleep(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}


// --------------------
// 좌석 초기화
// --------------------

function resetSeatMap() {

    for (let row = 1; row <= 30; row++) {

        for (const col of groups) {

            seatMap[`${row}${col}`] = false;
        }
    }
}


// --------------------
// 좌석 파싱
// --------------------

function parseSeat(seat) {

    const row = parseInt(seat);
    const col = seat.slice(-1);

    return { row, col };
}


// --------------------
// 막고 있는 좌석
// --------------------

function blockingSeats(col) {

    const map = {

        A: ['B', 'C'],
        B: ['C'],
        C: [],

        D: [],
        E: ['D'],
        F: ['D', 'E'],

        G: [],
        H: ['G'],
        I: ['G', 'H']
    };

    return map[col];
}


// --------------------
// 추가 착석 시간
// --------------------

function extraSeatTime(seat) {

    const { row, col } = parseSeat(seat);

    let extra = 0;

    for (const blocked of blockingSeats(col)) {

        const target = `${row}${blocked}`;

        if (seatMap[target]) {
            extra += 2;
        }
    }

    return extra;
}


// --------------------
// 복도 결정
// --------------------

function getAisle(col) {

    if (['A', 'B', 'C', 'D'].includes(col)) {
        return 'LEFT';
    }

    return 'RIGHT';
}


// --------------------
// 승객 생성
// --------------------

function createPassengers(seats) {

    return seats.map(seat => {

        const { row, col } = parseSeat(seat);

        return {

            seat,
            row,
            col,

            aisle: getAisle(col),

            currentRow: 0,

            state: 'walking',

            timer: 0
        };
    });
}


// --------------------
// 전원 착석 여부
// --------------------

function allSeated(passengers) {

    return passengers.every(
        p => p.state === 'seated'
    );
}


// --------------------
// 상태 업데이트
// --------------------

function updatePassengers(passengers) {

    const aisleFront = {
        LEFT: -1,
        RIGHT: -1
    };

    for (const p of passengers) {

        if (p.state === 'seated') {
            continue;
        }

        // ----------------
        // 앉는 중
        // ----------------

        if (p.state === 'sitting') {

            p.timer--;

            if (p.timer <= 0) {

                p.state = 'seated';

                seatMap[p.seat] = true;
            }

            continue;
        }

        // ----------------
        // 걷는 중
        // ----------------

        if (p.state === 'walking') {

            const frontRow = aisleFront[p.aisle];

            // 앞 승객 막힘
            if (
                p.currentRow + 1 >= frontRow &&
                frontRow !== -1
            ) {
                continue;
            }

            // 이동
            p.currentRow++;

            aisleFront[p.aisle] = p.currentRow;

            // 자기 줄 도착
            if (p.currentRow >= p.row) {

                p.state = 'sitting';

                p.timer =
                    1 + extraSeatTime(p.seat);
            }
        }
    }
}


// --------------------
// 콘솔 렌더링
// --------------------

function render(passengers) {

    console.clear();

    console.log(`TICK: ${currentTick}`);
    console.log('====================');

    for (const p of passengers) {

        console.log(
            `${p.seat} | ${p.state} | 위치:${p.currentRow}`
        );
    }

    console.log('====================');

    const seatedCount =
        passengers.filter(
            p => p.state === 'seated'
        ).length;

    console.log(
        `착석: ${seatedCount}/${passengers.length}`
    );
}


// --------------------
// 시뮬레이션
// --------------------

async function simulate(seats) {

    resetSeatMap();

    currentTick = 0;

    const passengers =
        createPassengers(seats);

    while (!allSeated(passengers)) {

        currentTick++;

        updatePassengers(passengers);

        render(passengers);

        await sleep(SIMULATION_SPEED);
    }

    console.log('\n====================');

    console.log(`총 틱: ${currentTick}`);

    console.log(
        `현실 시간: ${
            currentTick * TICK_SECONDS
        }초`
    );

    console.log(
        `현실 시간: ${
            (
                currentTick *
                TICK_SECONDS / 60
            ).toFixed(1)
        }분`
    );
}


// --------------------
// 랜덤 탑승
// --------------------

function randomOrder() {

    let seats = [];

    for (let row = 1; row <= 30; row++) {

        for (const col of groups) {

            seats.push(`${row}${col}`);
        }
    }

    for (let i = seats.length - 1; i > 0; i--) {

        const j =
            Math.floor(
                Math.random() * (i + 1)
            );

        [seats[i], seats[j]] =
        [seats[j], seats[i]];
    }

    return seats;
}


// --------------------
// 뒷줄 우선
// --------------------

function sortedOrder() {

    let seats = [];

    for (let row = 30; row >= 1; row--) {

        for (const col of groups) {

            seats.push(`${row}${col}`);
        }
    }

    return seats;
}


// --------------------
// 열 우선
// --------------------

function columnOrder() {

    let seats = [];

    for (const col of groups) {

        for (let row = 30; row >= 1; row--) {

            seats.push(`${row}${col}`);
        }
    }

    return seats;
}


// --------------------
// 실행
// --------------------

(async () => {

    console.log("===== RANDOM =====");

    await simulate(randomOrder());

})();