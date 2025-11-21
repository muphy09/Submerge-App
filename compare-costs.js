const XLSX = require('xlsx');

// Read the Excel file
const workbook = XLSX.readFile('Ashley Drennen.xlsx');
const costSheet = workbook.Sheets['COST - NEW'];

console.log('=== EXCEL COST BREAKDOWN ===\n');

// Key cost sections from the Excel
const costs = {
  'Plans & Engineering': { row: 9, col: 3 },
  'Layout': { row: 16, col: 3 },
  'Permit': { row: 23, col: 3 },
  'Excavation': { row: 45, col: 3 },
  'Plumbing': { row: 71, col: 3 },
  'Gas': { row: 77, col: 3 },
  'Steel': { row: 104, col: 3 },
  'Electrical': { row: 121, col: 3 },
  'Shotcrete': { row: 150, col: 3 },
  'Tile': { row: 177, col: 3 },
  'Coping/Decking': { row: 210, col: 3 },
  'Stone/Rockwork': { row: 229, col: 3 },
  'Masonry': { row: 235, col: 3 },
  'Equipment Ordered': { row: 261, col: 3 },
  'Equipment Set': { row: 272, col: 3 },
  'Cleanup': { row: 282, col: 3 },
  'Interior Finish': { row: 295, col: 3 },
  'Water Truck': { row: 301, col: 3 },
  'Fiberglass Shell': { row: 315, col: 3 },
  'Fiberglass Install': { row: 323, col: 3 },
  'Start-Up/Orientation': { row: 330, col: 3 },
  'Custom Feature': { row: 342, col: 3 },
  'TOTAL COGS': { row: 344, col: 3 },
  'RETAIL PRICE': { row: 346, col: 3 },
  'GROSS PROFIT': { row: 353, col: 3 },
};

for (const [name, pos] of Object.entries(costs)) {
  const cellRef = XLSX.utils.encode_cell({ r: pos.row - 1, c: pos.col });
  const cell = costSheet[cellRef];
  if (cell) {
    const value = cell.v || 0;
    const formula = cell.f ? ` [=${cell.f}]` : '';
    console.log(`${name}: $${typeof value === 'number' ? value.toFixed(2) : value}${formula}`);
  }
}

console.log('\n\n=== APP COSTS (from screenshot) ===\n');
console.log('Plans & Engineering: $490.00');
console.log('Layout: $565.00');
console.log('Permit: $1,075.00');
console.log('Excavation: $8,113.00');
console.log('Plumbing: $7,400.00');
console.log('Gas: $1,621.00');
console.log('Steel: $4,155.00');
console.log('Electrical: $2,832.18');
console.log('Shotcrete Labor: $3,350.00');
console.log('Shotcrete Material: $9,520.58');
console.log('Tile Labor: $2,886.00');
console.log('Tile Material: $2,706.00');
console.log('Coping/Decking Labor: $1,956.00');
console.log('Coping/Decking Material: $189.00');
console.log('Stone/Rockwork: $675.00');
console.log('Drainage: $1,087.50');
console.log('Equipment Ordered: $12,841.01');
console.log('Equipment Set: $850.00');
console.log('Water Features: $0.00');
console.log('Cleanup: $1,520.50');
console.log('Interior Finish: $9,293.56');
console.log('Water Truck: $1,470.00');
console.log('Fiberglass Shell: $0.00');
console.log('GRAND TOTAL: $75,340.96');

console.log('\n\n=== DETAILED SHOTCRETE BREAKDOWN ===\n');
console.log('Labor Total (Row 132):');
const laborCell = costSheet[XLSX.utils.encode_cell({ r: 131, c: 3 })];
console.log(`  Excel: $${laborCell ? laborCell.v : 'N/A'}`);

console.log('\nMaterial Total (Row 143):');
const materialCell = costSheet[XLSX.utils.encode_cell({ r: 142, c: 3 })];
console.log(`  Excel: $${materialCell ? materialCell.v : 'N/A'}`);

console.log('\nShotcrete Total (Row 150):');
const shotTotalCell = costSheet[XLSX.utils.encode_cell({ r: 149, c: 3 })];
console.log(`  Excel: $${shotTotalCell ? shotTotalCell.v : 'N/A'}`);

console.log('\n\n=== DETAILED COPING/DECKING BREAKDOWN ===\n');
console.log('Labor Total (Row 204):');
const copingLaborCell = costSheet[XLSX.utils.encode_cell({ r: 203, c: 3 })];
console.log(`  Excel: $${copingLaborCell ? copingLaborCell.v : 'N/A'}`);

console.log('\nMaterial Total (Row 206):');
const copingMatCell = costSheet[XLSX.utils.encode_cell({ r: 205, c: 3 })];
console.log(`  Excel: $${copingMatCell ? copingMatCell.v : 'N/A'}`);

console.log('\nDrainage (Row 208):');
const drainageCell = costSheet[XLSX.utils.encode_cell({ r: 207, c: 3 })];
console.log(`  Excel: $${drainageCell ? drainageCell.v : 'N/A'}`);

console.log('\nCoping/Decking Total (Row 210):');
const copingTotalCell = costSheet[XLSX.utils.encode_cell({ r: 209, c: 3 })];
console.log(`  Excel: $${copingTotalCell ? copingTotalCell.v : 'N/A'}`);
