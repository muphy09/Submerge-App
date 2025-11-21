const XLSX = require('xlsx');

// Read the Excel file
const workbook = XLSX.readFile('Ashley Drennen.xlsx');

console.log('=== ANALYZING COST - NEW SHEET ===\n');

const costSheet = workbook.Sheets['COST - NEW'];
if (!costSheet) {
  console.log('COST - NEW sheet not found!');
  process.exit(1);
}

// Get the range
const range = XLSX.utils.decode_range(costSheet['!ref']);
console.log(`Sheet Range: ${costSheet['!ref']}\n`);

// Convert to JSON to make it easier to work with
const data = XLSX.utils.sheet_to_json(costSheet, { header: 1, defval: '', raw: false });

// Print all rows with values
data.forEach((row, idx) => {
  if (row.some(cell => cell !== '')) {
    const rowNum = idx + 1;
    const cells = row.map((cell, colIdx) => {
      const cellRef = XLSX.utils.encode_cell({r: idx, c: colIdx});
      const originalCell = costSheet[cellRef];
      if (originalCell && originalCell.f) {
        return `${String.fromCharCode(65 + colIdx)}: ${cell} [=${originalCell.f}]`;
      }
      return `${String.fromCharCode(65 + colIdx)}: ${cell}`;
    }).filter(c => !c.endsWith(': '));

    if (cells.length > 0) {
      console.log(`Row ${rowNum}: ${cells.join(' | ')}`);
    }
  }
});

console.log('\n\n=== LOOKING FOR GRAND TOTAL ===\n');

// Look for grand total or job cost
for (let R = range.s.r; R <= range.e.r; ++R) {
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = XLSX.utils.encode_cell({r: R, c: C});
    const cell = costSheet[cellAddress];
    if (cell && cell.v) {
      const value = String(cell.v).toLowerCase();
      if (value.includes('grand total') || value.includes('job cost') || value.includes('total cost')) {
        console.log(`Found at ${cellAddress}: ${cell.v}`);
        // Check adjacent cells for the value
        for (let offset = 1; offset <= 5; offset++) {
          const adjacentRef = XLSX.utils.encode_cell({r: R, c: C + offset});
          const adjacentCell = costSheet[adjacentRef];
          if (adjacentCell) {
            console.log(`  ${adjacentRef}: ${adjacentCell.v} ${adjacentCell.f ? `[=${adjacentCell.f}]` : ''}`);
          }
        }
      }
    }
  }
}
