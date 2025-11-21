const XLSX = require('xlsx');

// Read the Excel file
const workbook = XLSX.readFile('Ashley Drennen.xlsx');
const newPoolSheet = workbook.Sheets['NEW POOL'];

console.log('=== NEW POOL SHEET - PRICE CALCULATION RANGE (C181:D190) ===\n');

// Check rows 181-190
for (let row = 181; row <= 190; row++) {
  const refC = XLSX.utils.encode_cell({ r: row - 1, c: 2 }); // Column C
  const refD = XLSX.utils.encode_cell({ r: row - 1, c: 3 }); // Column D
  const refA = XLSX.utils.encode_cell({ r: row - 1, c: 0 }); // Column A for description

  const cellC = newPoolSheet[refC];
  const cellD = newPoolSheet[refD];
  const cellA = newPoolSheet[refA];

  const desc = cellA ? cellA.v : '';
  const valC = cellC ? cellC.v : 0;
  const valD = cellD ? cellD.v : 0;
  const formulaC = cellC && cellC.f ? ` [=${cellC.f}]` : '';
  const formulaD = cellD && cellD.f ? ` [=${cellD.f}]` : '';

  if (valC !== 0 || valD !== 0 || desc) {
    console.log(`Row ${row} ${desc ? `(${desc})` : ''}`);
    if (cellC) console.log(`  C${row}: ${valC}${formulaC}`);
    if (cellD) console.log(`  D${row}: ${valD}${formulaD}`);
  }
}

console.log('\n\n=== CALCULATING SUM ===\n');

let sumC = 0;
let sumD = 0;

for (let row = 181; row <= 190; row++) {
  const refC = XLSX.utils.encode_cell({ r: row - 1, c: 2 });
  const refD = XLSX.utils.encode_cell({ r: row - 1, c: 3 });

  const cellC = newPoolSheet[refC];
  const cellD = newPoolSheet[refD];

  const valC = cellC ? (typeof cellC.v === 'number' ? cellC.v : 0) : 0;
  const valD = cellD ? (typeof cellD.v === 'number' ? cellD.v : 0) : 0;

  sumC += valC;
  sumD += valD;
}

console.log(`Sum of C181:C190: $${sumC.toFixed(2)}`);
console.log(`Sum of D181:D190: $${sumD.toFixed(2)}`);
console.log(`Total (C191 formula result): $${(sumC + sumD).toFixed(2)}`);
