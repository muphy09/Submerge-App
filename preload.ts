import { contextBridge, ipcRenderer } from 'electron';
import { Proposal } from './src/types/proposal';

contextBridge.exposeInMainWorld('electron', {
  // Proposal operations
  saveProposal: (proposal: Proposal) => ipcRenderer.invoke('save-proposal', proposal),
  getProposal: (proposalNumber: string) => ipcRenderer.invoke('get-proposal', proposalNumber),
  getAllProposals: () => ipcRenderer.invoke('get-all-proposals'),
  deleteProposal: (proposalNumber: string) => ipcRenderer.invoke('delete-proposal', proposalNumber),

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
});

declare global {
  interface Window {
    electron: {
      saveProposal: (proposal: Proposal) => Promise<number>;
      getProposal: (proposalNumber: string) => Promise<Proposal | null>;
      getAllProposals: () => Promise<Proposal[]>;
      deleteProposal: (proposalNumber: string) => Promise<void>;
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
    };
  }
}
