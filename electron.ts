import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { dbService } from './src/services/database';

let mainWindow: BrowserWindow | null = null;

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

app.whenReady().then(() => {
  // Initialize database
  dbService.initialize();

  createWindow();

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
