const XLSX = require('xlsx');

// Read the Excel file
const workbook = XLSX.readFile('Ashley Drennen.xlsx');
const tileCopingSheet = workbook.Sheets['TILE COPING'];
const newPoolSheet = workbook.Sheets['NEW POOL'];

console.log('=== TILE COPING SHEET ANALYSIS ===\n');

// Get specific cells related to travertine
const cells = {
  'C25 (Trav Coping Labor Qty)': 'C25',
  'D25 (Trav Coping Labor Total)': 'D25',
  'C26 (Trav Decking Labor Qty)': 'C26',
  'D26 (Trav Decking Labor Total)': 'D26',
  'C36 (Trav Coping Material Qty)': 'C36',
  'D36 (Trav Coping Material Total)': 'D36',
  'C37 (Trav Decking Material Qty)': 'C37',
  'D37 (Trav Decking Material Total)': 'D37',
  'F30 (Something from NEW POOL)': 'F30',
  'F31 (Something from NEW POOL)': 'F31',
};

Object.entries(cells).forEach(([desc, ref]) => {
  const cell = tileCopingSheet[ref];
  if (cell) {
    console.log(`${desc}: ${cell.v} ${cell.f ? `[=${cell.f}]` : ''}`);
  }
});

console.log('\n=== NEW POOL SHEET - Travertine References ===\n');

const newPoolCells = {
  'B90 (Trav Coping L1)': 'B90',
  'B91 (Trav Decking L1)': 'B91',
  'B93 (Trav Coping L2)': 'B93',
  'B94 (Trav Decking L2)': 'B94',
  'E9 (Decking SQFT)': 'E9',
  'F9': 'F9',
};

Object.entries(newPoolCells).forEach(([desc, ref]) => {
  const cell = newPoolSheet[ref];
  if (cell) {
    console.log(`${desc}: ${cell.v} ${cell.f ? `[=${cell.f}]` : ''}`);
  }
});

console.log('\n=== FULL TILE COPING SHEET ROW 25-26 (Labor) ===\n');
for (let col = 0; col <= 14; col++) {
  const ref25 = XLSX.utils.encode_cell({ r: 24, c: col });
  const ref26 = XLSX.utils.encode_cell({ r: 25, c: col });
  const cell25 = tileCopingSheet[ref25];
  const cell26 = tileCopingSheet[ref26];

  if (cell25) {
    console.log(`${ref25}: ${cell25.v} ${cell25.f ? `[=${cell25.f}]` : ''}`);
  }
  if (cell26) {
    console.log(`${ref26}: ${cell26.v} ${cell26.f ? `[=${cell26.f}]` : ''}`);
  }
}

console.log('\n=== FULL TILE COPING SHEET ROW 36-37 (Material) ===\n');
for (let col = 0; col <= 14; col++) {
  const ref36 = XLSX.utils.encode_cell({ r: 35, c: col });
  const ref37 = XLSX.utils.encode_cell({ r: 36, c: col });
  const cell36 = tileCopingSheet[ref36];
  const cell37 = tileCopingSheet[ref37];

  if (cell36) {
    console.log(`${ref36}: ${cell36.v} ${cell36.f ? `[=${cell36.f}]` : ''}`);
  }
  if (cell37) {
    console.log(`${ref37}: ${cell37.v} ${cell37.f ? `[=${cell37.f}]` : ''}`);
  }
}
