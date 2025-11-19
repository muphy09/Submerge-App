import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'path';
import { dbService } from './src/services/database';

let mainWindow: BrowserWindow | null = null;

// Configure auto-updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available:', info);
  if (mainWindow) {
    mainWindow.webContents.send('update-not-available', info);
  }
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

autoUpdater.on('error', (err) => {
  console.error('Update error:', err);
  if (mainWindow) {
    mainWindow.webContents.send('update-error', err.message);
  }
});

app.whenReady().then(() => {
  // Initialize database
  dbService.initialize();

  createWindow();

  // Check for updates on startup (only in production)
  if (process.env.NODE_ENV !== 'development') {
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 3000); // Wait 3 seconds after app starts
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    dbService.close();
    app.quit();
  }
});

app.on('before-quit', () => {
  dbService.close();
});

// IPC Handlers
ipcMain.handle('save-proposal', async (_, proposal) => {
  return dbService.saveProposal(proposal);
});

ipcMain.handle('get-proposal', async (_, proposalNumber) => {
  return dbService.getProposal(proposalNumber);
});

ipcMain.handle('get-all-proposals', async () => {
  return dbService.getAllProposals();
});

ipcMain.handle('delete-proposal', async (_, proposalNumber) => {
  return dbService.deleteProposal(proposalNumber);
});

// Reference data handlers
ipcMain.handle('get-pool-models', async () => {
  return dbService.getPoolModels();
});

ipcMain.handle('get-excavation-rates', async () => {
  return dbService.getExcavationRates();
});

ipcMain.handle('get-plumbing-rates', async () => {
  return dbService.getPlumbingRates();
});

ipcMain.handle('get-tile-rates', async () => {
  return dbService.getTileRates();
});

ipcMain.handle('get-coping-rates', async () => {
  return dbService.getCopingRates();
});

ipcMain.handle('get-decking-rates', async () => {
  return dbService.getDeckingRates();
});

ipcMain.handle('get-equipment-catalog', async () => {
  return dbService.getEquipmentCatalog();
});

ipcMain.handle('get-water-features-catalog', async () => {
  return dbService.getWaterFeaturesCatalog();
});

ipcMain.handle('get-finish-rates', async () => {
  return dbService.getFinishRates();
});

ipcMain.handle('get-drainage-rates', async () => {
  return dbService.getDrainageRates();
});

// Update handlers
ipcMain.handle('check-for-updates', async () => {
  if (process.env.NODE_ENV === 'development') {
    return { available: false, message: 'Updates disabled in development' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { available: true, updateInfo: result?.updateInfo };
  } catch (error) {
    console.error('Error checking for updates:', error);
    return { available: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('install-update', async () => {
  autoUpdater.quitAndInstall(false, true);
});
