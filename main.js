const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Lightweight env loader so dev runs pick up Supabase config from .env/.env.local
function loadLocalEnv() {
  const envFiles = ['.env.local', '.env'];
  envFiles.forEach((file) => {
    const fullPath = path.join(__dirname, file);
    if (!fs.existsSync(fullPath)) return;
    const lines = fs.readFileSync(fullPath, 'utf-8').split(/\r?\n/);
    lines.forEach((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) return;
      const [, key, raw] = match;
      if (process.env[key]) return; // keep explicit env overrides
      const value = raw.replace(/^['"]|['"]$/g, '');
      process.env[key] = value;
    });
  });
}

// Load native dependency with a guard so startup failures surface a readable error instead of "application can't be opened"
let Database;
try {
  Database = require('better-sqlite3');
} catch (err) {
  const logDir = app.getPath('userData');
  const logPath = path.join(logDir, 'startup-error.log');
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(logPath, `${new Date().toISOString()} Failed to load better-sqlite3\n${err.stack || err.message}\n`);
  } catch (_) {
    // ignore log write issues
  }
  dialog.showErrorBox('Startup error', `Failed to start Submerge Proposal Builder due to a native module error.\n\nDetails written to:\n${logPath}\n\n${err.message}`);
  app.quit();
}

// Ensure env vars are available before any renderer/preload needs them
loadLocalEnv();

// Handle ASAR paths correctly
const isDev = process.env.NODE_ENV === 'development';
// Surface the app version to the preload script without requiring package.json there
process.env.SUBMERGE_APP_VERSION = app.getVersion();
let appPath = __dirname;
let iconPath = path.join(__dirname, 'icon.ico');
const APP_NAME = 'Submerge Proposal Builder';
const PROPOSAL_FILE_EXTENSION = '.submerge';

let mainWindow = null;
let db = null;
let proposalsDir = null;
let updateClient = null;

const UPDATE_FEED = {
  provider: 'github',
  owner: 'muphy09',
  repo: 'Submerge-App',
};
const DEFAULT_FRANCHISE_ID = 'default';
const DEFAULT_FRANCHISE_CODE = 'DEFAULT-CODE';
const DEFAULT_PRICING_VERSION = 'v1';

function getAutoUpdater() {
  if (isDev) {
    return null;
  }

  if (!updateClient) {
    const { autoUpdater } = require('electron-updater');
    updateClient = autoUpdater;

    try {
      const feedConfig = { ...UPDATE_FEED };
      if (process.env.GH_TOKEN) {
        feedConfig.token = process.env.GH_TOKEN;
      }
      updateClient.setFeedURL(feedConfig);
      console.log('Auto-update feed configured for GitHub releases');
    } catch (error) {
      console.error('Failed to configure auto-updater feed:', error);
    }

    updateClient.autoDownload = false;
    updateClient.autoInstallOnAppQuit = true;
  }

  return updateClient;
}

function sendUpdateError(message = 'Error checking for updates') {
  if (mainWindow) {
    mainWindow.webContents.send('update-error', message);
  }
}

// Initialize proposals directory
function initializeProposalsDirectory() {
  const documentsPath = app.getPath('documents');
  proposalsDir = path.join(documentsPath, APP_NAME);

  // Create directory if it doesn't exist
  if (!fs.existsSync(proposalsDir)) {
    fs.mkdirSync(proposalsDir, { recursive: true });
    console.log('Created proposals directory:', proposalsDir);
  }

  console.log('Proposals directory:', proposalsDir);
  return proposalsDir;
}

// Database initialization (for reference data only)
function initializeDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'pool-proposals.db');
  const isNewDatabase = !fs.existsSync(dbPath);

  console.log('Database path:', dbPath);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  const schemaPath = path.join(appPath, 'src/database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // For existing databases, add franchise_code before running schema (indexes depend on it).
  if (!isNewDatabase) {
    try {
      const columns = db.prepare(`PRAGMA table_info('franchises')`).all() || [];
      const hasFranchiseCode = columns.some((c) => c.name === 'franchise_code');
      if (!hasFranchiseCode) {
        db.exec(`ALTER TABLE franchises ADD COLUMN franchise_code TEXT NOT NULL DEFAULT '${DEFAULT_FRANCHISE_CODE}';`);
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_franchises_code ON franchises(franchise_code);`);
        console.log('Added franchise_code column to franchises table (migration).');
      }
      backfillFranchiseCodes();
    } catch (error) {
      console.warn('Failed to verify/alter franchises table before schema exec:', error);
    }
  }

  // Read and execute schema (creates tables/indexes if missing)
  db.exec(schema);

  // Migrate any legacy single-pricing rows into pricing models
  migrateFranchisePricingToModels();

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

  ensureDefaultFranchise();
  ensureStarterFranchises();
  console.log('Database initialized successfully');
}

function ensureFranchiseExists(franchiseId, name = franchiseId, franchiseCode = DEFAULT_FRANCHISE_CODE) {
  if (!db) return;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO franchises (id, name, franchise_code, is_active, created_at, updated_at)
     VALUES (@id, @name, @code, 0, @now, @now)`
  ).run({ id: franchiseId, name, code: franchiseCode, now });
}

function backfillFranchiseCodes() {
  if (!db) return;
  try {
    const rows = db
      .prepare(`SELECT id, COALESCE(franchise_code, '') AS franchise_code FROM franchises WHERE franchise_code IS NULL OR franchise_code = ''`)
      .all();
    const now = new Date().toISOString();
    const update = db.prepare(
      `UPDATE franchises SET franchise_code = @code, updated_at = @now WHERE id = @id`
    );
    rows.forEach((row) => {
      const generatedCode = `${row.id || DEFAULT_FRANCHISE_ID}-CODE`;
      update.run({ id: row.id, code: generatedCode, now });
    });
  } catch (error) {
    console.warn('Failed to backfill franchise codes:', error);
  }
}

function ensureDefaultFranchise() {
  if (!db) return null;
  const now = new Date().toISOString();
  const total = db.prepare('SELECT COUNT(*) AS count FROM franchises').get();
  if (!total || total.count === 0) {
    db.prepare(
      `INSERT INTO franchises (id, name, franchise_code, is_active, created_at, updated_at)
       VALUES (@id, @name, @code, 1, @now, @now)`
    ).run({ id: DEFAULT_FRANCHISE_ID, name: 'Default Franchise', code: DEFAULT_FRANCHISE_CODE, now });
  }
  backfillFranchiseCodes();

  const active = db
    .prepare(
      `SELECT id, name, franchise_code AS franchiseCode, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
       FROM franchises WHERE is_active = 1 LIMIT 1`
    )
    .get();

  if (active) {
    return active;
  }

  const first = db.prepare('SELECT id FROM franchises LIMIT 1').get();
  if (first) {
    db.prepare(
      `UPDATE franchises
       SET is_active = CASE WHEN id = @id THEN 1 ELSE 0 END,
           updated_at = @now`
    ).run({ id: first.id, now });
  }

  return db
    .prepare(
      `SELECT id, name, franchise_code AS franchiseCode, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
       FROM franchises WHERE is_active = 1 LIMIT 1`
    )
    .get();
}

function migrateFranchisePricingToModels() {
  if (!db) return;
  try {
    const existingModels = db.prepare('SELECT COUNT(*) AS count FROM franchise_pricing_models').get();
    if (existingModels && existingModels.count > 0) {
      return;
    }

    const legacyRows =
      db
        .prepare(
          `SELECT franchise_id, version, pricing_json, updated_at, updated_by
           FROM franchise_pricing`
        )
        .all() || [];

    const insertModel = db.prepare(
      `INSERT INTO franchise_pricing_models
       (id, franchise_id, name, version, pricing_json, is_default, created_at, updated_at, updated_by)
       VALUES (@id, @franchise_id, @name, @version, @pricing_json, @is_default, @created_at, @updated_at, @updated_by)`
    );

    const now = new Date().toISOString();
    const tx = db.transaction(() => {
      legacyRows.forEach((row, idx) => {
        const id = `${row.franchise_id || DEFAULT_FRANCHISE_ID}-legacy-${idx || 0}`;
        insertModel.run({
          id,
          franchise_id: row.franchise_id || DEFAULT_FRANCHISE_ID,
          name: 'Legacy Default',
          version: row.version || DEFAULT_PRICING_VERSION,
          pricing_json: row.pricing_json,
          is_default: 1,
          created_at: row.updated_at || now,
          updated_at: row.updated_at || now,
          updated_by: row.updated_by || null,
        });
      });
    });
    tx();
    console.log('Migrated legacy franchise_pricing rows into franchise_pricing_models');
  } catch (error) {
    console.warn('Failed to migrate legacy franchise pricing:', error);
  }
}

function ensureStarterFranchises() {
  ensureFranchiseExists('franchise-1111', 'Franchise 1111', '1111');
  ensureFranchiseExists('franchise-2222', 'Franchise 2222', '2222');
}

function getActiveFranchise() {
  if (!db) throw new Error('Database not initialized');
  const active = db
    .prepare(
      `SELECT id, name, franchise_code AS franchiseCode, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
       FROM franchises WHERE is_active = 1 LIMIT 1`
    )
    .get();
  return active || ensureDefaultFranchise();
}

function setActiveFranchise(franchiseId) {
  if (!db) throw new Error('Database not initialized');
  const exists = db.prepare('SELECT COUNT(*) AS count FROM franchises WHERE id = ?').get(franchiseId);
  if (!exists || exists.count === 0) {
    throw new Error(`Franchise not found: ${franchiseId}`);
  }

  const now = new Date().toISOString();
  const tx = db.transaction((id) => {
    db.prepare('UPDATE franchises SET is_active = 0').run();
    db.prepare('UPDATE franchises SET is_active = 1, updated_at = ? WHERE id = ?').run(now, id);
  });

  tx(franchiseId);
  return getActiveFranchise();
}

function getFranchiseByCode(code) {
  if (!db) throw new Error('Database not initialized');
  return db
    .prepare(
      `SELECT id, name, franchise_code AS franchiseCode, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
       FROM franchises WHERE franchise_code = ?`
    )
    .get(code);
}

function getDefaultPricingModel(franchiseId) {
  if (!db) throw new Error('Database not initialized');
  return (
    db
      .prepare(
        `SELECT id, name, version, pricing_json AS pricingJson, is_default AS isDefault, updated_at AS updatedAt, updated_by AS updatedBy
         FROM franchise_pricing_models
         WHERE franchise_id = ?
         ORDER BY is_default DESC, updated_at DESC
         LIMIT 1`
      )
      .get(franchiseId) || null
  );
}

function getPricingModelById(franchiseId, modelId) {
  if (!db) throw new Error('Database not initialized');
  return (
    db
      .prepare(
        `SELECT id, name, version, pricing_json AS pricingJson, is_default AS isDefault, updated_at AS updatedAt, updated_by AS updatedBy
         FROM franchise_pricing_models
         WHERE franchise_id = ? AND id = ?`
      )
      .get(franchiseId, modelId) || null
  );
}

// Auto-updater configuration
function setupAutoUpdater() {
  // Don't check for updates in development
  if (isDev) {
    console.log('Skipping auto-updater in development mode');
    return;
  }

  const autoUpdater = getAutoUpdater();
  if (!autoUpdater) {
    return;
  }

  autoUpdater.removeAllListeners();
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
    }
    // Auto-download the update
    autoUpdater.downloadUpdate().catch((error) => {
      console.error('Failed to download update:', error);
      sendUpdateError();
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-not-available', info);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Error in auto-updater:', err);
    sendUpdateError();
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log('Download progress:', progressObj);
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info);
    }
  });

  // Check for updates when app starts (after a delay to let the window load)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.error('Failed to check for updates:', err);
      sendUpdateError();
    });
  }, 3000);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: APP_NAME,
    icon: iconPath,
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
    // Hide the default menu bar in production builds
    Menu.setApplicationMenu(null);

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

// Handle file opening on Windows
let fileToOpen = null;

// Function to open a proposal file
function openProposalFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    const proposal = JSON.parse(data);

    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('open-proposal', proposal);
    }
  } catch (error) {
    console.error('Failed to open proposal file:', error);
  }
}

// Get file path from command line args on Windows (only when running in Electron context)
function checkForFileArgument() {
  if (process.platform === 'win32' && process.argv.length >= 2) {
    const filePath = process.argv.find(arg => arg.endsWith(PROPOSAL_FILE_EXTENSION));
    if (filePath) {
      fileToOpen = filePath;
    }
  }
}

app.whenReady().then(() => {
  // Set app path correctly after app is ready
  if (!isDev) {
    appPath = app.getAppPath();
    iconPath = path.join(appPath, 'icon.ico');
  }

  // Check for file argument
  checkForFileArgument();

  try {
    initializeDatabase();
  } catch (error) {
    console.error('Failed to initialize database:', error);
    dialog.showErrorBox('Database error', `Failed to initialize database:\n\n${error.message}`);
    app.quit();
    return;
  }
  initializeProposalsDirectory();
  createWindow();
  setupAutoUpdater();

  // If a file was specified on launch, open it
  if (fileToOpen) {
    openProposalFile(fileToOpen);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Handle opening files on Windows
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (filePath.endsWith(PROPOSAL_FILE_EXTENSION)) {
    if (mainWindow) {
      openProposalFile(filePath);
    } else {
      fileToOpen = filePath;
    }
  }
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
  if (!proposalsDir) throw new Error('Proposals directory not initialized');

  console.log('save-proposal called with:', JSON.stringify(proposal, null, 2));

  try {
    // Check if this proposal already exists (editing existing proposal)
    const files = fs.readdirSync(proposalsDir);
    let existingFilePath = null;

    // Look for existing file by proposal number
    for (const file of files) {
      if (file.endsWith(PROPOSAL_FILE_EXTENSION)) {
        try {
          const filePath = path.join(proposalsDir, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const existingProposal = JSON.parse(data);
          if (existingProposal.proposalNumber === proposal.proposalNumber) {
            existingFilePath = filePath;
            console.log('Found existing file:', filePath);
            break;
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }
    }

    let filePath;
    if (existingFilePath) {
      // Reuse existing file path
      filePath = existingFilePath;
    } else {
      // Create new filename using customer name or proposal number
      let fileName;
      if (proposal.customerInfo && proposal.customerInfo.customerName && proposal.customerInfo.customerName.trim()) {
        // Use customer name, remove special characters, limit length
        const safeName = proposal.customerInfo.customerName.trim().replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50);
        fileName = `${safeName}${PROPOSAL_FILE_EXTENSION}`;
      } else {
        // Fallback to proposal number
        fileName = `${proposal.proposalNumber}${PROPOSAL_FILE_EXTENSION}`;
      }
      filePath = path.join(proposalsDir, fileName);
      console.log('Creating new file:', filePath);
    }

    // Write the proposal to a JSON file
    fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2), 'utf-8');

    console.log('Proposal saved successfully:', filePath);
    return filePath;
  } catch (error) {
    console.error('Failed to save proposal:', error);
    throw error;
  }
});

ipcMain.handle('get-proposal', async (_, proposalNumber) => {
  if (!proposalsDir) throw new Error('Proposals directory not initialized');

  console.log('get-proposal called with:', proposalNumber);

  try {
    // Find the file by proposal number
    const files = fs.readdirSync(proposalsDir);
    console.log('Files in proposals dir:', files);

    for (const file of files) {
      if (file.endsWith(PROPOSAL_FILE_EXTENSION)) {
        try {
          const filePath = path.join(proposalsDir, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const proposal = JSON.parse(data);

          console.log('Checking file:', file, 'proposalNumber:', proposal.proposalNumber);

          if (proposal.proposalNumber === proposalNumber) {
            console.log('FOUND proposal, returning:', JSON.stringify(proposal, null, 2));
            return proposal;
          }
        } catch (error) {
          console.error(`Failed to read proposal file ${file}:`, error);
        }
      }
    }

    console.log('Proposal not found:', proposalNumber);
    return null;
  } catch (error) {
    console.error('Failed to load proposal:', error);
    return null;
  }
});

ipcMain.handle('get-all-proposals', async () => {
  if (!proposalsDir) throw new Error('Proposals directory not initialized');

  try {
    const files = fs.readdirSync(proposalsDir);
    const proposals = [];

    for (const file of files) {
      if (file.endsWith(PROPOSAL_FILE_EXTENSION)) {
        const filePath = path.join(proposalsDir, file);
        try {
          const data = fs.readFileSync(filePath, 'utf-8');
          const proposal = JSON.parse(data);
          proposals.push(proposal);
        } catch (error) {
          console.error(`Failed to read proposal file ${file}:`, error);
        }
      }
    }

    // Sort by last modified date (most recent first)
    proposals.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    return proposals;
  } catch (error) {
    console.error('Failed to load proposals:', error);
    return [];
  }
});

ipcMain.handle('delete-proposal', async (_, proposalNumber) => {
  if (!proposalsDir) throw new Error('Proposals directory not initialized');

  try {
    // Find the file by proposal number
    const files = fs.readdirSync(proposalsDir);

    for (const file of files) {
      if (file.endsWith(PROPOSAL_FILE_EXTENSION)) {
        try {
          const filePath = path.join(proposalsDir, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const proposal = JSON.parse(data);

          if (proposal.proposalNumber === proposalNumber) {
            fs.unlinkSync(filePath);
            console.log('Proposal deleted:', filePath);
            return;
          }
        } catch (error) {
          console.error(`Failed to read/delete proposal file ${file}:`, error);
        }
      }
    }

    console.log('Proposal not found:', proposalNumber);
  } catch (error) {
    console.error('Failed to delete proposal:', error);
    throw error;
  }
});

// New handler to open proposals folder
ipcMain.handle('open-proposals-folder', async () => {
  if (!proposalsDir) throw new Error('Proposals directory not initialized');

  try {
    await shell.openPath(proposalsDir);
  } catch (error) {
    console.error('Failed to open proposals folder:', error);
    throw error;
  }
});

// Changelog handler
ipcMain.handle('read-changelog', () => {
  const possiblePaths = [
    path.join(appPath, 'CHANGELOG.md'),
    path.join(__dirname, 'CHANGELOG.md'),
    path.join(process.cwd(), 'CHANGELOG.md'),
  ];

  for (const changelogPath of possiblePaths) {
    if (fs.existsSync(changelogPath)) {
      return fs.readFileSync(changelogPath, 'utf-8');
    }
  }

  throw new Error('CHANGELOG.md not found');
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

// Franchise + pricing handlers
ipcMain.handle('list-franchises', async () => {
  if (!db) throw new Error('Database not initialized');
  ensureDefaultFranchise();
  return db
    .prepare(
      `SELECT id, name, franchise_code AS franchiseCode, is_active AS isActive, created_at AS createdAt, updated_at AS updatedAt
       FROM franchises
       ORDER BY name`
    )
    .all();
});

ipcMain.handle('get-active-franchise', async () => {
  return getActiveFranchise();
});

ipcMain.handle('set-active-franchise', async (_, franchiseId) => {
  const targetId = franchiseId || DEFAULT_FRANCHISE_ID;
  return setActiveFranchise(targetId);
});

ipcMain.handle('upsert-franchise', async (_, payload) => {
  if (!db) throw new Error('Database not initialized');
  const franchiseId = payload?.id || DEFAULT_FRANCHISE_ID;
  const name = payload?.name || franchiseId;
  const code = payload?.franchiseCode || payload?.code || franchiseId;
  const isActive = payload?.isActive ? 1 : 0;
  const now = new Date().toISOString();

  const tx = db.transaction((id, displayName, activeFlag, franchiseCode) => {
    db.prepare(
      `INSERT INTO franchises (id, name, franchise_code, is_active, created_at, updated_at)
       VALUES (@id, @name, @code, @is_active, @now, @now)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         franchise_code = excluded.franchise_code,
         updated_at = excluded.updated_at,
         is_active = CASE WHEN excluded.is_active = 1 THEN 1 ELSE franchises.is_active END`
    ).run({ id, name: displayName, code: franchiseCode, is_active: activeFlag, now });

    if (activeFlag) {
      db.prepare('UPDATE franchises SET is_active = 0 WHERE id <> ?').run(id);
      db.prepare('UPDATE franchises SET is_active = 1, updated_at = ? WHERE id = ?').run(now, id);
    }
  });

  tx(franchiseId, name, isActive, code);
  return getActiveFranchise();
});

ipcMain.handle('enter-franchise-code', async (_, payload) => {
  if (!db) throw new Error('Database not initialized');
  const rawCode = payload?.franchiseCode || payload?.code;
  const displayName = payload?.displayName || payload?.userName || 'User';
  if (!rawCode) {
    throw new Error('Franchise code is required');
  }

  // Treat codes ending with "-A" as admin codes for the same franchise
  const adminMatch = String(rawCode).trim().toUpperCase().endsWith('-A');
  const normalizedCode = adminMatch ? String(rawCode).trim().slice(0, -2) : String(rawCode).trim();
  const franchise = getFranchiseByCode(normalizedCode);
  if (!franchise) {
    throw new Error('Invalid franchise code');
  }

  setActiveFranchise(franchise.id);
  return {
    userName: displayName,
    franchiseId: franchise.id,
    franchiseName: franchise.name,
    franchiseCode: franchise.franchiseCode,
    role: adminMatch ? 'admin' : 'designer',
    isActive: true,
  };
});

ipcMain.handle('list-pricing-models', async (_, franchiseId) => {
  if (!db) throw new Error('Database not initialized');
  const targetId = franchiseId || DEFAULT_FRANCHISE_ID;
  return (
    db
      .prepare(
        `SELECT id, name, version, is_default AS isDefault, created_at AS createdAt, updated_at AS updatedAt
         FROM franchise_pricing_models
         WHERE franchise_id = ?
         ORDER BY is_default DESC, updated_at DESC`
      )
      .all(targetId) || []
  );
});

ipcMain.handle('load-franchise-pricing', async (_, franchiseId) => {
  if (!db) throw new Error('Database not initialized');
  const targetId = franchiseId || DEFAULT_FRANCHISE_ID;
  ensureFranchiseExists(targetId);

  const model = getDefaultPricingModel(targetId);
  if (!model) {
    return null;
  }

  let pricing = null;
  try {
    pricing = model.pricingJson ? JSON.parse(model.pricingJson) : null;
  } catch (error) {
    console.warn('Failed to parse pricing JSON for franchise', targetId, error);
  }

  return {
    franchiseId: targetId,
    version: model.version,
    pricing,
    updatedAt: model.updatedAt,
    updatedBy: model.updatedBy,
    pricingModelId: model.id,
    pricingModelName: model.name,
    isDefault: Boolean(model.isDefault),
  };
});

ipcMain.handle('load-pricing-model', async (_, payload) => {
  if (!db) throw new Error('Database not initialized');
  const franchiseId = payload?.franchiseId || DEFAULT_FRANCHISE_ID;
  const modelId = payload?.pricingModelId || payload?.modelId;
  ensureFranchiseExists(franchiseId);

  const model = modelId ? getPricingModelById(franchiseId, modelId) : getDefaultPricingModel(franchiseId);
  if (!model) return null;

  let pricing = null;
  try {
    pricing = model.pricingJson ? JSON.parse(model.pricingJson) : null;
  } catch (error) {
    console.warn('Failed to parse pricing JSON for franchise', franchiseId, error);
  }

  return {
    franchiseId,
    pricingModelId: model.id,
    pricingModelName: model.name,
    isDefault: Boolean(model.isDefault),
    version: model.version,
    pricing,
    updatedAt: model.updatedAt,
    updatedBy: model.updatedBy,
  };
});

ipcMain.handle('save-pricing-model', async (_, payload) => {
  if (!db) throw new Error('Database not initialized');
  const franchiseId = payload?.franchiseId || DEFAULT_FRANCHISE_ID;
  const name = payload?.name || 'New Pricing Model';
  const pricing = payload?.pricing ?? {};
  const version = payload?.version || DEFAULT_PRICING_VERSION;
  const updatedBy = payload?.updatedBy || null;
  const setDefault = Boolean(payload?.setDefault);
  ensureFranchiseExists(franchiseId, payload?.franchiseName, payload?.franchiseCode || DEFAULT_FRANCHISE_CODE);

  const now = new Date().toISOString();
  const createNew = Boolean(payload?.createNew);
  const id = createNew ? `${franchiseId}-${Date.now()}` : payload?.pricingModelId || payload?.modelId || `${franchiseId}-${Date.now()}`;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO franchise_pricing_models
       (id, franchise_id, name, version, pricing_json, is_default, created_at, updated_at, updated_by)
       VALUES (@id, @franchise_id, @name, @version, @pricing_json, @is_default, @created_at, @updated_at, @updated_by)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         version = excluded.version,
         pricing_json = excluded.pricing_json,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by,
         is_default = CASE WHEN excluded.is_default = 1 THEN 1 ELSE franchise_pricing_models.is_default END`
    ).run({
      id,
      franchise_id: franchiseId,
      name,
      version,
      pricing_json: JSON.stringify(pricing),
      is_default: setDefault ? 1 : 0,
      created_at: now,
      updated_at: now,
      updated_by: updatedBy,
    });

    if (setDefault) {
      db.prepare('UPDATE franchise_pricing_models SET is_default = 0 WHERE franchise_id = ? AND id <> ?').run(franchiseId, id);
      db.prepare('UPDATE franchise_pricing_models SET is_default = 1, updated_at = ? WHERE id = ?').run(now, id);
    }
  });

  tx();
  return { franchiseId, pricingModelId: id, updatedAt: now, isDefault: setDefault };
});

ipcMain.handle('set-default-pricing-model', async (_, payload) => {
  if (!db) throw new Error('Database not initialized');
  const franchiseId = payload?.franchiseId || DEFAULT_FRANCHISE_ID;
  const modelId = payload?.pricingModelId || payload?.modelId;
  if (!modelId) throw new Error('pricingModelId is required');

  const exists = db.prepare('SELECT COUNT(*) AS count FROM franchise_pricing_models WHERE franchise_id = ? AND id = ?').get(franchiseId, modelId);
  if (!exists || exists.count === 0) {
    throw new Error('Pricing model not found');
  }

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare('UPDATE franchise_pricing_models SET is_default = 0 WHERE franchise_id = ?').run(franchiseId);
    db.prepare('UPDATE franchise_pricing_models SET is_default = 1, updated_at = ? WHERE id = ?').run(now, modelId);
  });
  tx();
  return { franchiseId, pricingModelId: modelId, updatedAt: now };
});

ipcMain.handle('delete-pricing-model', async (_, payload) => {
  if (!db) throw new Error('Database not initialized');
  const franchiseId = payload?.franchiseId || DEFAULT_FRANCHISE_ID;
  const modelId = payload?.pricingModelId || payload?.modelId;
  if (!modelId) throw new Error('pricingModelId is required');

  const row = db
    .prepare('SELECT is_default AS isDefault FROM franchise_pricing_models WHERE franchise_id = ? AND id = ?')
    .get(franchiseId, modelId);
  if (!row) {
    throw new Error('Pricing model not found');
  }
  if (row.isDefault) {
    throw new Error('Cannot delete the default pricing model. Set another model as default first.');
  }

  db.prepare('DELETE FROM franchise_pricing_models WHERE franchise_id = ? AND id = ?').run(franchiseId, modelId);
  return { franchiseId, pricingModelId: modelId };
});

// Auto-updater IPC handlers
ipcMain.handle('check-for-updates', async () => {
  if (isDev) {
    return { message: 'Updates are disabled in development mode' };
  }
  try {
    const autoUpdater = getAutoUpdater();
    if (!autoUpdater) {
      return { message: 'Error checking for updates' };
    }

    const result = await autoUpdater.checkForUpdates();
    const updateInfo = result?.updateInfo;
    const available = Boolean(updateInfo && updateInfo.version && updateInfo.version !== app.getVersion());

    return { available, updateInfo };
  } catch (error) {
    console.error('Error checking for updates:', error);
    sendUpdateError();
    return { message: 'Error checking for updates' };
  }
});

ipcMain.handle('install-update', async () => {
  if (isDev) {
    return;
  }
  const autoUpdater = getAutoUpdater();
  if (autoUpdater) {
    autoUpdater.quitAndInstall();
  }
});
