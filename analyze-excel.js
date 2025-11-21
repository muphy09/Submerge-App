const XLSX = require('xlsx');
const fs = require('fs');

// Read the Excel file
const workbook = XLSX.readFile('Ashley Drennen.xlsx');

console.log('=== SHEET NAMES ===');
console.log(workbook.SheetNames);
console.log('\n');

// Function to print sheet data
function printSheet(sheetName, maxRows = 100) {
  console.log(`\n=== ${sheetName} ===`);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.log('Sheet not found');
    return;
  }

  // Get the range
  const range = XLSX.utils.decode_range(sheet['!ref']);
  console.log(`Range: ${sheet['!ref']}`);

  // Print header info and cells
  for (let R = range.s.r; R <= Math.min(range.e.r, range.s.r + maxRows); ++R) {
    let row = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({r: R, c: C});
      const cell = sheet[cellAddress];
      if (cell) {
        // Show formula if it exists, otherwise value
        const display = cell.f ? `[${cell.f}]` : cell.v;
        row.push(`${cellAddress}: ${display}`);
      }
    }
    if (row.length > 0) {
      console.log(`Row ${R + 1}: ${row.join(' | ')}`);
    }
  }
}

// Print NEW POOL tab (user inputs)
printSheet('NEW POOL', 150);

// Print COST - NEW tab (cost breakdown)
printSheet('COST - NEW', 150);

// Also check for other relevant sheets
workbook.SheetNames.forEach(sheetName => {
  if (!['NEW POOL', 'COST-NEW'].includes(sheetName)) {
    console.log(`\n=== OVERVIEW: ${sheetName} ===`);
    const sheet = workbook.Sheets[sheetName];
    if (sheet['!ref']) {
      console.log(`Range: ${sheet['!ref']}`);
    }
  }
});
