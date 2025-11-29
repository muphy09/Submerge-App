import { contextBridge, ipcRenderer } from 'electron';
import { Proposal } from './src/types/proposal';

const setIpcListener = (channel: string, callback: (payload: any) => void) => {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, (_, payload) => callback(payload));
};

contextBridge.exposeInMainWorld('electron', {
  // Proposal operations
  saveProposal: (proposal: Proposal) => ipcRenderer.invoke('save-proposal', proposal),
  getProposal: (proposalNumber: string) => ipcRenderer.invoke('get-proposal', proposalNumber),
  getAllProposals: () => ipcRenderer.invoke('get-all-proposals'),
  deleteProposal: (proposalNumber: string) => ipcRenderer.invoke('delete-proposal', proposalNumber),
  readChangelog: () => ipcRenderer.invoke('read-changelog'),

  // Reference data
  getPoolModels: () => ipcRenderer.invoke('get-pool-models'),
  getExcavationRates: () => ipcRenderer.invoke('get-excavation-rates'),
  getPlumbingRates: () => ipcRenderer.invoke('get-plumbing-rates'),
  getTileRates: () => ipcRenderer.invoke('get-tile-rates'),
  getCopingRates: () => ipcRenderer.invoke('get-coping-rates'),
  getDeckingRates: () => ipcRenderer.invoke('get-decking-rates'),
  getEquipmentCatalog: () => ipcRenderer.invoke('get-equipment-catalog'),
  getWaterFeaturesCatalog: () => ipcRenderer.invoke('get-water-features-catalog'),
  getFinishRates: () => ipcRenderer.invoke('get-finish-rates'),
  getDrainageRates: () => ipcRenderer.invoke('get-drainage-rates'),

  // Update operations
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateAvailable: (callback: (info: any) => void) => setIpcListener('update-available', callback),
  onUpdateNotAvailable: (callback: (info: any) => void) => setIpcListener('update-not-available', callback),
  onDownloadProgress: (callback: (progress: any) => void) => setIpcListener('download-progress', callback),
  onUpdateDownloaded: (callback: (info: any) => void) => setIpcListener('update-downloaded', callback),
  onUpdateError: (callback: (error: string) => void) => setIpcListener('update-error', callback),
});

declare global {
  interface Window {
    electron: {
      saveProposal: (proposal: Proposal) => Promise<number>;
      getProposal: (proposalNumber: string) => Promise<Proposal | null>;
      getAllProposals: () => Promise<Proposal[]>;
      deleteProposal: (proposalNumber: string) => Promise<void>;
      readChangelog: () => Promise<string>;
      getPoolModels: () => Promise<any[]>;
      getExcavationRates: () => Promise<any[]>;
      getPlumbingRates: () => Promise<any[]>;
      getTileRates: () => Promise<any[]>;
      getCopingRates: () => Promise<any[]>;
      getDeckingRates: () => Promise<any[]>;
      getEquipmentCatalog: () => Promise<any[]>;
      getWaterFeaturesCatalog: () => Promise<any[]>;
      getFinishRates: () => Promise<any[]>;
      getDrainageRates: () => Promise<any[]>;
      checkForUpdates: () => Promise<any>;
      installUpdate: () => Promise<void>;
      onUpdateAvailable: (callback: (info: any) => void) => void;
      onUpdateNotAvailable: (callback: (info: any) => void) => void;
      onDownloadProgress: (callback: (progress: any) => void) => void;
      onUpdateDownloaded: (callback: (info: any) => void) => void;
      onUpdateError: (callback: (error: string) => void) => void;
    };
  }
}
