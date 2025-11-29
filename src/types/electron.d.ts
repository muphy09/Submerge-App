export {};

declare global {
  interface Window {
    electron: {
      // App info
      appVersion: string;

      // Proposal operations
      saveProposal: (proposal: any) => Promise<number>;
      getProposal: (proposalNumber: string) => Promise<any | null>;
      getAllProposals: () => Promise<any[]>;
      deleteProposal: (proposalNumber: string) => Promise<void>;
      openProposalsFolder: () => Promise<void>;
      readChangelog: () => Promise<string>;
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

      // Franchise + pricing
      listFranchises: () => Promise<
        { id: string; name: string; isActive: number | boolean; createdAt?: string; updatedAt?: string }[]
      >;
      getActiveFranchise: () => Promise<{ id: string; name: string; isActive: boolean } | null>;
      setActiveFranchise: (franchiseId: string) => Promise<{ id: string; name: string; isActive: boolean }>;
      upsertFranchise: (franchise: { id: string; name?: string; franchiseCode?: string; code?: string; isActive?: boolean }) => Promise<{
        id: string;
        name: string;
        isActive: boolean;
      }>;
      enterFranchiseCode: (payload: {
        franchiseCode: string;
        displayName?: string;
      }) => Promise<{
        userName: string;
        franchiseId: string;
        franchiseName: string;
        franchiseCode: string;
        role?: 'admin' | 'designer';
        isActive: boolean;
      }>;
      listPricingModels: (
        franchiseId: string
      ) => Promise<{ id: string; name: string; version: string; isDefault: boolean; createdAt?: string; updatedAt?: string }[]>;
      loadFranchisePricing: (
        franchiseId?: string
      ) => Promise<{
        franchiseId: string;
        pricingModelId?: string;
        pricingModelName?: string;
        isDefault?: boolean;
        version: string;
        pricing: any;
        updatedAt?: string;
        updatedBy?: string;
      } | null>;
      loadPricingModel: (payload: {
        franchiseId?: string;
        pricingModelId?: string;
      }) => Promise<{
        franchiseId: string;
        pricingModelId?: string;
        pricingModelName?: string;
        isDefault?: boolean;
        version: string;
        pricing: any;
        updatedAt?: string;
        updatedBy?: string;
      } | null>;
      savePricingModel: (payload: {
        franchiseId: string;
        franchiseName?: string;
        franchiseCode?: string;
        pricing: any;
        pricingModelId?: string;
        name: string;
        version?: string;
        updatedBy?: string | null;
        setDefault?: boolean;
        createNew?: boolean;
      }) => Promise<{ franchiseId: string; pricingModelId: string; updatedAt: string; isDefault?: boolean }>;
      saveFranchisePricing: (payload: {
        franchiseId: string;
        franchiseName?: string;
        franchiseCode?: string;
        pricing: any;
        pricingModelId?: string;
        name: string;
        version?: string;
        updatedBy?: string | null;
        setDefault?: boolean;
        createNew?: boolean;
      }) => Promise<{ franchiseId: string; pricingModelId: string; updatedAt: string; isDefault?: boolean }>;
      setDefaultPricingModel: (payload: { franchiseId?: string; pricingModelId: string }) => Promise<{
        franchiseId: string;
        pricingModelId: string;
        updatedAt: string;
      }>;
      deletePricingModel: (payload: { franchiseId?: string; pricingModelId: string }) => Promise<{
        franchiseId: string;
        pricingModelId: string;
      }>;

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
