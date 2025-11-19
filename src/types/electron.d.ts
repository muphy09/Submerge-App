export {};

declare global {
  interface Window {
    electron: {
      // Proposal operations
      saveProposal: (proposal: any) => Promise<number>;
      getProposal: (proposalNumber: string) => Promise<any | null>;
      getAllProposals: () => Promise<any[]>;
      deleteProposal: (proposalNumber: string) => Promise<void>;
      openProposalsFolder: () => Promise<void>;
      onOpenProposal?: (callback: (proposal: any) => void) => void;

      // Reference data
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

      // Update operations
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
