const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
\
function randomOrder() {
    let seats = [];

    for (let row = 1; row <= 30; row++) {
        for (const col of groups) {
            seats.push(`${row}${col}`);
        }
    }

    // Fisher-Yates Shuffle
    for (let i = seats.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [seats[i], seats[j]] = [seats[j], seats[i]];
    }

    return seats;
}


// 뒷줄부터 탑승
function sortedOrder() {
    let seats = [];

    for (let row = 30; row >= 1; row--) {
        for (const col of groups) {
            seats.push(`${row}${col}`);
        }
    }

    return seats;
}


function columnOrder() {
    let seats = [];

    for (const col of groups) {
        for (let row = 30; row >= 1; row--) {
            seats.push(`${row}${col}`);
        }
    }

    return seats;
}


// 테스트
console.log(randomOrder());
console.log(sortedOrder());
console.log(columnOrder());