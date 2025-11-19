const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

// Handle ASAR paths correctly
const isDev = process.env.NODE_ENV === 'development';
let appPath = __dirname;
let iconPath = path.join(__dirname, 'icon.ico');

let mainWindow = null;
let db = null;
let proposalsDir = null;

// Initialize proposals directory
function initializeProposalsDirectory() {
  const documentsPath = app.getPath('documents');
  proposalsDir = path.join(documentsPath, 'PPAS Proposal Builder');

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
    const filePath = process.argv.find(arg => arg.endsWith('.ppas'));
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

  initializeDatabase();
  initializeProposalsDirectory();
  createWindow();

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
  if (filePath.endsWith('.ppas')) {
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
      if (file.endsWith('.ppas')) {
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
        fileName = `${safeName}.ppas`;
      } else {
        // Fallback to proposal number
        fileName = `${proposal.proposalNumber}.ppas`;
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
      if (file.endsWith('.ppas')) {
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
      if (file.endsWith('.ppas')) {
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
      if (file.endsWith('.ppas')) {
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
