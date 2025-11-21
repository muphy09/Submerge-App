const XLSX = require('xlsx');

// Read the Excel file
const workbook = XLSX.readFile('Ashley Drennen.xlsx');
const newPoolSheet = workbook.Sheets['NEW POOL'];

console.log('=== NEW POOL SHEET - RETAIL PRICE CALCULATION ===\n');

// Check rows around 191
for (let row = 185; row <= 195; row++) {
  console.log(`\n--- Row ${row} ---`);
  for (let col = 0; col <= 10; col++) {
    const ref = XLSX.utils.encode_cell({ r: row - 1, c: col });
    const cell = newPoolSheet[ref];
    if (cell && cell.v !== '') {
      const colLetter = String.fromCharCode(65 + col);
      const formula = cell.f ? ` [=${cell.f}]` : '';
      console.log(`  ${ref}: ${cell.v}${formula}`);
    }
  }
}
