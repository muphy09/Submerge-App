const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

// Handle ASAR paths correctly
const isDev = process.env.NODE_ENV === 'development';
const appPath = isDev ? __dirname : app.getAppPath();

let mainWindow = null;
let db = null;

// Database initialization
function initializeDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'pool-proposals.db');
  const isNewDatabase = !fs.existsSync(dbPath);

  console.log('Database path:', dbPath);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Read and execute schema
  const schemaPath = path.join(appPath, 'src/database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Load sample data if this is a new database
  if (isNewDatabase) {
    try {
      const sampleDataPath = path.join(appPath, 'src/database/sampleData.sql');
      const sampleData = fs.readFileSync(sampleDataPath, 'utf-8');
      db.exec(sampleData);
      console.log('Sample data loaded successfully');
    } catch (error) {
      console.warn('Failed to load sample data:', error);
    }
  }

  console.log('Database initialized successfully');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'PPAS Proposal Builder',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-script.js'),
    },
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Use URL-based loading for proper asset resolution in ASAR
    const indexPath = `file://${path.join(appPath, 'dist/renderer/index.html').replace(/\\/g, '/')}`;
    console.log('Loading production app from:', indexPath);
    console.log('__dirname:', __dirname);
    console.log('appPath:', appPath);

    mainWindow.loadURL(indexPath).catch(err => {
      console.error('Failed to load index.html:', err);
    });

    // Open dev tools in production to debug
    // mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  initializeDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (db) db.close();
    app.quit();
  }
});

app.on('before-quit', () => {
  if (db) db.close();
});

// IPC Handlers - Proposals
ipcMain.handle('save-proposal', async (_, proposal) => {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO proposals
    (proposal_number, created_date, last_modified, status, data, subtotal, tax_rate, tax_amount, total_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    proposal.proposalNumber,
    proposal.createdDate,
    proposal.lastModified,
    proposal.status,
    JSON.stringify(proposal),
    proposal.subtotal,
    proposal.taxRate,
    proposal.taxAmount,
    proposal.totalCost
  );

  return result.lastInsertRowid;
});

ipcMain.handle('get-proposal', async (_, proposalNumber) => {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT data FROM proposals WHERE proposal_number = ?');
  const row = stmt.get(proposalNumber);

  if (!row) return null;

  return JSON.parse(row.data);
});

ipcMain.handle('get-all-proposals', async () => {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT data FROM proposals ORDER BY last_modified DESC');
  const rows = stmt.all();

  return rows.map(row => JSON.parse(row.data));
});

ipcMain.handle('delete-proposal', async (_, proposalNumber) => {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('DELETE FROM proposals WHERE proposal_number = ?');
  stmt.run(proposalNumber);
});

// Reference data handlers
ipcMain.handle('get-pool-models', async () => {
  if (!db) throw new Error('Database not initialized');
  return db.prepare('SELECT * FROM pool_models').all();
});

ipcMain.handle('get-excavation-rates', async () => {
  if (!db) throw new Error('Database not initialized');
  return db.prepare('SELECT * FROM excavation_rates').all();
});

ipcMain.handle('get-plumbing-rates', async () => {
  if (!db) throw new Error('Database not initialized');
  return db.prepare('SELECT * FROM plumbing_rates').all();
});

ipcMain.handle('get-tile-rates', async () => {
  if (!db) throw new Error('Database not initialized');
  return db.prepare('SELECT * FROM tile_rates').all();
});

ipcMain.handle('get-coping-rates', async () => {
  if (!db) throw new Error('Database not initialized');
  return db.prepare('SELECT * FROM coping_rates').all();
});

ipcMain.handle('get-decking-rates', async () => {
  if (!db) throw new Error('Database not initialized');
  return db.prepare('SELECT * FROM decking_rates').all();
});

ipcMain.handle('get-equipment-catalog', async () => {
  if (!db) throw new Error('Database not initialized');
  return db.prepare('SELECT * FROM equipment_catalog').all();
});

ipcMain.handle('get-water-features-catalog', async () => {
  if (!db) throw new Error('Database not initialized');
  return db.prepare('SELECT * FROM water_features_catalog').all();
});

ipcMain.handle('get-finish-rates', async () => {
  if (!db) throw new Error('Database not initialized');
  return db.prepare('SELECT * FROM finish_rates').all();
});

ipcMain.handle('get-drainage-rates', async () => {
  if (!db) throw new Error('Database not initialized');
  return db.prepare('SELECT * FROM drainage_rates').all();
});
