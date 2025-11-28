import React, { useEffect, useMemo, useState } from 'react';
import {
  addPricingListItem,
  getPricingDataSnapshot,
  initPricingDataStore,
  getActiveFranchiseId,
  getActivePricingModelMeta,
  clearActivePricingModelMeta,
  savePricingModelSnapshot,
  setActivePricingModel,
  removePricingListItem,
  resetPricingData,
  subscribeToPricingData,
  updatePricingListItem,
  updatePricingValue,
} from '../services/pricingDataStore';
import './PricingDataModal.css';

type Path = (string | number)[];

type ScalarField = {
  label: string;
  path: Path;
  type: 'number' | 'boolean' | 'text';
  note?: string;
};

type ListField = {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'text';
  placeholder?: string;
};

type ListConfig = {
  title: string;
  path: Path;
  fields: ListField[];
  addLabel: string;
};

type Group = {
  title: string;
  scalars?: ScalarField[];
  lists?: ListConfig[];
};

type Section = {
  title: string;
  groups: Group[];
};

const getValue = (target: any, path: Path) =>
  path.reduce((acc, key) => (acc ? acc[key] : undefined), target);

const toNumber = (value: string) => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const emptyFromFields = (fields: ListField[]) =>
  fields.reduce<Record<string, any>>((acc, field) => {
    acc[field.key] = field.type === 'number' ? 0 : field.type === 'boolean' ? false : '';
    return acc;
  }, {});

interface PricingDataModalProps {
  onClose: () => void;
}

const PricingDataModal: React.FC<PricingDataModalProps> = ({ onClose }) => {
  const [data, setData] = useState(getPricingDataSnapshot());
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [pricingModels, setPricingModels] = useState<any[]>([]);
  const [modelName, setModelName] = useState('');
  const [savingModel, setSavingModel] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [setDefaultModel, setSetDefaultModel] = useState(true);
  const [savingAsNew, setSavingAsNew] = useState(false);

  useEffect(() => {
    initPricingDataStore();
    const unsubscribe = subscribeToPricingData(setData);
    void loadModels();
    return unsubscribe;
  }, []);

  const loadModels = async () => {
    const franchiseId = getActiveFranchiseId();
    if (!window.electron?.listPricingModels) return;
    try {
      const rows = await window.electron.listPricingModels(franchiseId);
      setPricingModels(rows || []);
      const activeMeta = getActivePricingModelMeta();
      if (activeMeta.pricingModelName && !modelName) {
        setModelName(activeMeta.pricingModelName);
      }
    } catch (error) {
      console.warn('Unable to load pricing models', error);
    }
  };

  const handleLoadModel = async (modelId: string) => {
    await setActivePricingModel(modelId);
    const meta = getActivePricingModelMeta();
    setModelName(meta.pricingModelName || '');
    setPricingModels((prev) =>
      prev.map((m) => ({ ...m, isDefault: m.id === modelId ? m.isDefault : m.isDefault }))
    );
  };

  const handleSaveModel = async () => {
    if (!modelName.trim()) {
      setSaveError('Please provide a model name.');
      return;
    }
    setSaveError(null);
    setSavingModel(true);
    try {
      await savePricingModelSnapshot({
        name: modelName.trim(),
        setDefault: setDefaultModel,
        updatedBy: 'admin',
        createNew: savingAsNew,
      });
      setSavingAsNew(false);
      await loadModels();
    } catch (error: any) {
      setSaveError(error?.message || 'Unable to save pricing model.');
    } finally {
      setSavingModel(false);
    }
  };

  const handleCreateNewModel = async () => {
    try {
      const defaultModel = pricingModels.find((m) => m.isDefault) || pricingModels[0];
      if (defaultModel) {
        await setActivePricingModel(defaultModel.id);
      } else {
        await initPricingDataStore(getActiveFranchiseId());
      }
      clearActivePricingModelMeta();
      setModelName('');
      setSavingAsNew(true);
      setSetDefaultModel(false);
    } catch (error) {
      console.warn('Unable to start new pricing model', error);
    }
  };

  const handleDeleteModel = async (modelId: string, isDefault: boolean) => {
    if (isDefault) {
      setSaveError('Cannot delete the default pricing model. Set another model as default first.');
      return;
    }
    if (!window.electron?.deletePricingModel) return;
    try {
      await window.electron.deletePricingModel({
        franchiseId: getActiveFranchiseId(),
        pricingModelId: modelId,
      });
      if (modelId === getActivePricingModelMeta().pricingModelId) {
        const def = pricingModels.find((m) => m.isDefault && m.id !== modelId) || pricingModels.find((m) => m.id !== modelId);
        if (def) {
          await handleLoadModel(def.id);
        }
      }
      await loadModels();
    } catch (error: any) {
      setSaveError(error?.message || 'Unable to delete pricing model.');
    }
  };

  const handleSetDefault = async (modelId: string) => {
    if (!window.electron?.setDefaultPricingModel) return;
    try {
      await window.electron.setDefaultPricingModel({
        franchiseId: getActiveFranchiseId(),
        pricingModelId: modelId,
      });
      await loadModels();
      const meta = getActivePricingModelMeta();
      setModelName(meta.pricingModelName || modelName);
    } catch (error) {
      console.warn('Unable to set default pricing model', error);
    }
  };

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleScalarChange = (field: ScalarField, value: string | boolean) => {
    if (field.type === 'number') {
      updatePricingValue(field.path, typeof value === 'string' ? toNumber(value) : value);
    } else if (field.type === 'boolean') {
      updatePricingValue(field.path, Boolean(value));
    } else {
      updatePricingValue(field.path, value);
    }
  };

  const handleListChange = (list: ListConfig, index: number, field: ListField, raw: any) => {
    const parsed =
      field.type === 'number' ? toNumber(String(raw)) : field.type === 'boolean' ? Boolean(raw) : raw;
    updatePricingListItem(list.path, index, field.key, parsed);
  };

  const handleAddListItem = (list: ListConfig) => {
    addPricingListItem(list.path, emptyFromFields(list.fields));
  };

  const handleRemoveListItem = (list: ListConfig, index: number) => {
    removePricingListItem(list.path, index);
  };

  const sections: Section[] = useMemo(
    () => [
      {
        title: 'Plans & Engineering',
        groups: [
          {
            title: 'Plan packages',
            scalars: [
              { label: 'Pool only', path: ['plans', 'poolOnly'], type: 'number' },
              { label: 'Spa add-on', path: ['plans', 'spa'], type: 'number' },
              { label: 'Waterfall add-on', path: ['plans', 'waterfall'], type: 'number' },
              { label: 'Water feature add-on', path: ['plans', 'waterFeature'], type: 'number' },
              { label: 'Soil sample engineer', path: ['plans', 'soilSampleEngineer'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Layout & Permit',
        groups: [
          {
            title: 'On-site layout',
            scalars: [
              { label: 'Pool only layout', path: ['misc', 'layout', 'poolOnly'], type: 'number' },
              { label: 'Spa layout add-on', path: ['misc', 'layout', 'spa'], type: 'number' },
              { label: 'Silt fencing allowance', path: ['misc', 'layout', 'siltFencing'], type: 'number' },
            ],
          },
          {
            title: 'Permitting',
            scalars: [
              { label: 'Pool permit', path: ['misc', 'permit', 'poolOnly'], type: 'number' },
              { label: 'Spa permit add-on', path: ['misc', 'permit', 'spa'], type: 'number' },
              { label: 'Permit runner', path: ['misc', 'permit', 'permitRunner'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Excavation',
        groups: [
          {
            title: 'Base & allowances',
            scalars: [
              { label: 'Base excavation (project)', path: ['excavation', 'basePricePerSqft'], type: 'number' },
              { label: 'Over 1,000 sqft surcharge', path: ['excavation', 'over1000Sqft'], type: 'number' },
              { label: 'Additional 6" depth (per sqft)', path: ['excavation', 'additional6InchDepth'], type: 'number' },
              { label: 'Site prep (per hour)', path: ['excavation', 'sitePrep'], type: 'number' },
              { label: 'Backfill', path: ['excavation', 'backfill'], type: 'number' },
              { label: 'Gravel install (per ton)', path: ['excavation', 'gravelPerTon'], type: 'number' },
              { label: 'Dirt haul (per load)', path: ['excavation', 'dirtHaulPerLoad'], type: 'number' },
              { label: 'Cover box', path: ['excavation', 'coverBox'], type: 'number' },
              { label: 'Travel (per mile)', path: ['excavation', 'travelPerMile'], type: 'number' },
              { label: 'Miscellaneous', path: ['excavation', 'misc'], type: 'number' },
            ],
          },
          {
            title: 'Spa excavation',
            scalars: [
              { label: 'Spa base excavation', path: ['excavation', 'baseSpa'], type: 'number' },
              { label: 'Raised spa excavation', path: ['excavation', 'raisedSpa'], type: 'number' },
            ],
          },
          {
            title: 'Raised bond beam (per lnft)',
            scalars: [
              { label: '6" RBB', path: ['excavation', 'rbb6'], type: 'number' },
              { label: '12" RBB', path: ['excavation', 'rbb12'], type: 'number' },
              { label: '18" RBB', path: ['excavation', 'rbb18'], type: 'number' },
              { label: '24" RBB', path: ['excavation', 'rbb24'], type: 'number' },
              { label: '30" RBB', path: ['excavation', 'rbb30'], type: 'number' },
              { label: '36" RBB', path: ['excavation', 'rbb36'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Plumbing',
        groups: [
          {
            title: 'Base & overruns',
            scalars: [
              { label: 'Short stub / base plumbing', path: ['plumbing', 'shortStub'], type: 'number' },
              { label: 'Spa base plumbing', path: ['plumbing', 'spaBase'], type: 'number' },
              {
                label: 'Pool overrun per ft',
                path: ['plumbing', 'poolOverrunPerFt'],
                type: 'number',
                note: `Applies over ${data.plumbing.poolOverrunThreshold} ft`,
              },
              {
                label: 'Spa overrun per ft',
                path: ['plumbing', 'spaOverrunPerFt'],
                type: 'number',
                note: `Applies over ${data.plumbing.spaOverrunThreshold} ft`,
              },
              {
                label: 'Gas overrun per ft',
                path: ['plumbing', 'gasOverrunPerFt'],
                type: 'number',
                note: `Applies over ${data.plumbing.gasOverrunThreshold} ft`,
              },
              { label: 'Spa plumbing (per ft)', path: ['plumbing', 'spaPlumbing'], type: 'number' },
            ],
          },
          {
            title: 'Water feature plumbing',
            scalars: [
              { label: 'Setup (per run)', path: ['plumbing', 'waterFeatureRun', 'setup'], type: 'number' },
              { label: 'Base allowance (ft)', path: ['plumbing', 'waterFeatureRun', 'baseAllowanceFt'], type: 'number' },
              { label: 'Per ft over allowance', path: ['plumbing', 'waterFeatureRun', 'perFt'], type: 'number' },
            ],
          },
          {
            title: 'Misc plumbing',
            scalars: [
              { label: 'Cleaner line (per ft)', path: ['plumbing', 'cleanerPerFt'], type: 'number' },
              { label: 'Auto-fill (per ft)', path: ['plumbing', 'autoFillPerFt'], type: 'number' },
              { label: 'Additional skimmer', path: ['plumbing', 'additionalSkimmer'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Water Features',
        groups: [
          {
            title: 'Equip tab catalog (column S)',
            lists: [
              {
                title: 'Available water features',
                path: ['waterFeatures', 'catalog'],
                addLabel: 'Add water feature',
                fields: [
                  { key: 'id', label: 'Key', type: 'text', placeholder: 'unique-id' },
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Feature name' },
                  { key: 'category', label: 'Category', type: 'text', placeholder: 'Group heading' },
                  { key: 'unitPrice', label: 'Price (Equip!S)', type: 'number', placeholder: '0' },
                  { key: 'note', label: 'Note', type: 'text', placeholder: 'Optional note' },
                ],
              },
            ],
          },
        ],
      },
      {
        title: 'Electrical & Gas',
        groups: [
          {
            title: 'Electrical runs',
            scalars: [
              { label: 'Base electrical', path: ['electrical', 'baseElectrical'], type: 'number' },
              {
                label: 'Electrical overrun per ft',
                path: ['electrical', 'overrunPerFt'],
                type: 'number',
                note: `Applies over ${data.electrical.overrunThreshold} ft`,
              },
              { label: 'Spa electrical', path: ['electrical', 'spaElectrical'], type: 'number' },
              { label: 'Light additional (each)', path: ['electrical', 'lightAdditionalPerLight'], type: 'number' },
              { label: 'Light run per ft', path: ['electrical', 'lightRunPerFt'], type: 'number' },
              { label: 'Heat pump electrical base', path: ['electrical', 'heatPumpElectricalBase'], type: 'number' },
              { label: 'Heat pump overrun per ft', path: ['electrical', 'heatPumpPerFtOver'], type: 'number' },
              { label: 'Automation add', path: ['electrical', 'automation'], type: 'number' },
              { label: 'Salt system add', path: ['electrical', 'saltSystem'], type: 'number' },
              { label: 'Bonding', path: ['electrical', 'bonding'], type: 'number' },
              { label: 'Outlet', path: ['electrical', 'outlet'], type: 'number' },
              { label: 'Auto-fill (per ft)', path: ['electrical', 'autoFillPerFt'], type: 'number' },
              { label: 'Travel per mile', path: ['electrical', 'travelPerMile'], type: 'number' },
            ],
          },
          {
            title: 'Gas',
            scalars: [
              { label: 'Base gas set', path: ['electrical', 'baseGas'], type: 'number' },
              {
                label: 'Gas overrun per ft',
                path: ['electrical', 'gasPerFtOverThreshold'],
                type: 'number',
                note: `Applies over ${data.plumbing.gasOverrunThreshold} ft`,
              },
            ],
          },
        ],
      },
      {
        title: 'Steel',
        groups: [
          {
            title: 'Rebar',
            scalars: [
              { label: 'Pool base (per sqft)', path: ['steel', 'poolBase'], type: 'number' },
              { label: 'Spa base', path: ['steel', 'spaBase'], type: 'number' },
              { label: '4-bar beam', path: ['steel', 'fourBarBeam'], type: 'number' },
              { label: 'Steps & bench (per lnft)', path: ['steel', 'stepsPerLnft'], type: 'number' },
              { label: 'Tanning shelf', path: ['steel', 'tanningShelf'], type: 'number' },
              { label: 'Depth over 8ft (per 6")', path: ['steel', 'depthOver8Ft'], type: 'number' },
              { label: '6" RBB steel (per lnft)', path: ['steel', 'rbb6PerLnft'], type: 'number' },
              { label: '12" RBB steel (per lnft)', path: ['steel', 'rbb12PerLnft'], type: 'number' },
              { label: '18" RBB steel (per lnft)', path: ['steel', 'rbb18PerLnft'], type: 'number' },
              { label: '24" RBB steel (per lnft)', path: ['steel', 'rbb24PerLnft'], type: 'number' },
              { label: '30" RBB steel (per lnft)', path: ['steel', 'rbb30PerLnft'], type: 'number' },
              { label: '36" RBB steel (per lnft)', path: ['steel', 'rbb36PerLnft'], type: 'number' },
              { label: 'Double curtain (per lnft)', path: ['steel', 'doubleCurtainPerLnft'], type: 'number' },
              { label: 'Spa double curtain', path: ['steel', 'spaDoubleCurtain'], type: 'number' },
              { label: 'Pool bonding', path: ['steel', 'poolBonding'], type: 'number' },
              { label: 'Travel per mile', path: ['steel', 'travelPerMile'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Shotcrete Labor',
        groups: [
          {
            title: 'Crew rates',
            scalars: [
              { label: 'Pool base (per yard)', path: ['shotcrete', 'labor', 'poolBase'], type: 'number' },
              { label: 'Minimum yards', path: ['shotcrete', 'labor', 'minimumYards'], type: 'number' },
              { label: 'Spa', path: ['shotcrete', 'labor', 'spa'], type: 'number' },
              { label: 'Auto cover', path: ['shotcrete', 'labor', 'autoCover'], type: 'number' },
              { label: 'Distance 251-300', path: ['shotcrete', 'labor', 'distance250to300'], type: 'number' },
              { label: 'Distance 301-350', path: ['shotcrete', 'labor', 'distance300to350'], type: 'number' },
              { label: 'Travel per mile', path: ['shotcrete', 'labor', 'travelPerMile'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Shotcrete Material',
        groups: [
          {
            title: 'Material rates',
            scalars: [
              { label: 'Material per yard', path: ['shotcrete', 'material', 'perYard'], type: 'number' },
              { label: 'Clean-out', path: ['shotcrete', 'material', 'cleanOut'], type: 'number' },
              { label: 'Env/Fuel per yard', path: ['shotcrete', 'material', 'envFuelPerYard'], type: 'number' },
              { label: 'Miscellaneous', path: ['shotcrete', 'material', 'misc'], type: 'number' },
              { label: 'Travel per mile', path: ['shotcrete', 'material', 'travelPerMile'], type: 'number' },
              { label: 'Tax rate', path: ['shotcrete', 'material', 'taxRate'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Tile, Coping & Decking',
        groups: [
          {
            title: 'Tile labor (per lnft)',
            scalars: [
              { label: 'Level 1', path: ['tileCoping', 'tile', 'labor', 'level1'], type: 'number' },
              { label: 'Level 2', path: ['tileCoping', 'tile', 'labor', 'level2'], type: 'number' },
              { label: 'Level 3', path: ['tileCoping', 'tile', 'labor', 'level3'], type: 'number' },
              { label: 'Step trim tile', path: ['tileCoping', 'tile', 'labor', 'stepTrim'], type: 'number' },
            ],
          },
          {
            title: 'Tile material',
            scalars: [
              { label: 'Level 1 included', path: ['tileCoping', 'tile', 'material', 'level1Included'], type: 'boolean' },
              { label: 'Level 2 upgrade (per lnft)', path: ['tileCoping', 'tile', 'material', 'level2Upgrade'], type: 'number' },
              { label: 'Level 3 upgrade (per lnft)', path: ['tileCoping', 'tile', 'material', 'level3Upgrade'], type: 'number' },
            ],
          },
          {
            title: 'Coping labor (per lnft)',
            scalars: [
              { label: 'Cantilever', path: ['tileCoping', 'coping', 'cantilever'], type: 'number' },
              { label: 'Flagstone', path: ['tileCoping', 'coping', 'flagstone'], type: 'number' },
              { label: 'Pavers', path: ['tileCoping', 'coping', 'pavers'], type: 'number' },
              { label: 'Travertine level 1', path: ['tileCoping', 'coping', 'travertineLevel1'], type: 'number' },
              { label: 'Travertine level 2', path: ['tileCoping', 'coping', 'travertineLevel2'], type: 'number' },
              { label: 'Concrete', path: ['tileCoping', 'coping', 'concrete'], type: 'number' },
            ],
          },
          {
            title: 'Decking labor (per sqft unless noted)',
            scalars: [
              { label: 'Pavers', path: ['tileCoping', 'decking', 'labor', 'pavers'], type: 'number' },
              { label: 'Travertine', path: ['tileCoping', 'decking', 'labor', 'travertine'], type: 'number' },
              { label: 'Concrete', path: ['tileCoping', 'decking', 'labor', 'concrete'], type: 'number' },
              { label: 'Concrete steps (each)', path: ['tileCoping', 'decking', 'labor', 'concreteSteps'], type: 'number' },
            ],
          },
          {
            title: 'Decking material (per sqft unless noted)',
            scalars: [
              { label: 'Pavers', path: ['tileCoping', 'decking', 'material', 'pavers'], type: 'number' },
              { label: 'Travertine level 1', path: ['tileCoping', 'decking', 'material', 'travertineLevel1'], type: 'number' },
              { label: 'Travertine level 2', path: ['tileCoping', 'decking', 'material', 'travertineLevel2'], type: 'number' },
              { label: 'Concrete', path: ['tileCoping', 'decking', 'material', 'concrete'], type: 'number' },
              { label: 'Concrete steps (each)', path: ['tileCoping', 'decking', 'material', 'concreteSteps'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Equipment',
        groups: [
          {
            title: 'Pumps',
            lists: [
              {
                title: 'Pump models',
                path: ['equipment', 'pumps'],
                addLabel: 'Add pump',
                fields: [
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Pump name' },
                  { key: 'model', label: 'Model', type: 'text', placeholder: 'Model' },
                  { key: 'price', label: 'Price', type: 'number', placeholder: '0' },
                ],
              },
            ],
          },
          {
            title: 'Filters',
            lists: [
              {
                title: 'Filter models',
                path: ['equipment', 'filters'],
                addLabel: 'Add filter',
                fields: [
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Filter name' },
                  { key: 'sqft', label: 'SQFT', type: 'number', placeholder: '0' },
                  { key: 'price', label: 'Price', type: 'number', placeholder: '0' },
                ],
              },
            ],
          },
          {
            title: 'Cleaners',
            lists: [
              {
                title: 'Cleaner models',
                path: ['equipment', 'cleaners'],
                addLabel: 'Add cleaner',
                fields: [
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Cleaner name' },
                  { key: 'price', label: 'Price', type: 'number', placeholder: '0' },
                ],
              },
            ],
          },
          {
            title: 'Heaters',
            lists: [
              {
                title: 'Heater models',
                path: ['equipment', 'heaters'],
                addLabel: 'Add heater',
                fields: [
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Heater name' },
                  { key: 'btu', label: 'BTU', type: 'number', placeholder: '0' },
                  { key: 'price', label: 'Price', type: 'number', placeholder: '0' },
                  { key: 'isVersaFlo', label: 'VersaFlo capable', type: 'boolean' },
                ],
              },
            ],
          },
          {
            title: 'Lighting & automation rates',
            scalars: [
              { label: 'Niche light', path: ['equipment', 'lights', 'nicheLightPrice'], type: 'number' },
              { label: 'Spa light add-on', path: ['equipment', 'lights', 'spaLightAddon'], type: 'number' },
              { label: 'Additional light', path: ['equipment', 'lights', 'additionalLightPrice'], type: 'number' },
              { label: 'Automation extra zone', path: ['equipment', 'automationZoneAddon'], type: 'number' },
            ],
            lists: [
              {
                title: 'Automation kits',
                path: ['equipment', 'automation'],
                addLabel: 'Add automation',
                fields: [
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Automation name' },
                  { key: 'price', label: 'Price', type: 'number', placeholder: '0' },
                  { key: 'hasChemistry', label: 'Includes chemistry', type: 'boolean' },
                ],
              },
            ],
          },
          {
            title: 'Salt & accessories',
            scalars: [
              { label: 'Blanket reel', path: ['equipment', 'blanketReel'], type: 'number' },
              { label: 'Solar blanket', path: ['equipment', 'solarBlanket'], type: 'number' },
              { label: 'Auto-fill', path: ['equipment', 'autoFill'], type: 'number' },
              { label: 'Handrail', path: ['equipment', 'handrail'], type: 'number' },
              { label: 'Startup chemicals', path: ['equipment', 'startupChemicals'], type: 'number' },
            ],
            lists: [
              {
                title: 'Salt systems',
                path: ['equipment', 'saltSystem'],
                addLabel: 'Add salt system',
                fields: [
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Salt system name' },
                  { key: 'model', label: 'Model', type: 'text', placeholder: 'Model' },
                  { key: 'price', label: 'Price', type: 'number', placeholder: '0' },
                ],
              },
            ],
          },
        ],
      },
      {
        title: 'Interior Finish',
        groups: [
          {
            title: 'Prep & extras',
            scalars: [
              { label: 'Minimum charge sqft', path: ['interiorFinish', 'minimumChargeSqft'], type: 'number' },
              { label: 'Pool prep base', path: ['interiorFinish', 'extras', 'poolPrepBase'], type: 'number' },
              { label: 'Pool prep threshold', path: ['interiorFinish', 'extras', 'poolPrepThreshold'], type: 'number' },
              { label: 'Pool prep over rate (per sqft)', path: ['interiorFinish', 'extras', 'poolPrepOverRate'], type: 'number' },
              { label: 'Spa prep', path: ['interiorFinish', 'extras', 'spaPrep'], type: 'number' },
              { label: 'Misc', path: ['interiorFinish', 'extras', 'misc'], type: 'number' },
              { label: 'Travel per mile', path: ['interiorFinish', 'extras', 'travelPerMile'], type: 'number' },
              { label: 'Step detail per lnft over 20', path: ['interiorFinish', 'extras', 'stepDetailPerLnftOver20'], type: 'number' },
            ],
          },
          {
            title: 'Labor (per sqft unless noted)',
            scalars: [
              { label: 'Plaster base', path: ['interiorFinish', 'labor', 'plasterBase'], type: 'number' },
              { label: 'Plaster per 100 sqft over 500', path: ['interiorFinish', 'labor', 'plasterPer100SqftOver500'], type: 'number' },
              { label: 'Pebble base', path: ['interiorFinish', 'labor', 'pebbleBase'], type: 'number' },
              { label: 'Pebble per 100 sqft over 500', path: ['interiorFinish', 'labor', 'pebblePer100SqftOver500'], type: 'number' },
              { label: 'Quartz base', path: ['interiorFinish', 'labor', 'quartzBase'], type: 'number' },
              { label: 'Quartz per 100 sqft over 500', path: ['interiorFinish', 'labor', 'quartzPer100SqftOver500'], type: 'number' },
              { label: 'Polished base', path: ['interiorFinish', 'labor', 'polishedBase'], type: 'number' },
              { label: 'Polished per 100 sqft over 500', path: ['interiorFinish', 'labor', 'polishedPer100SqftOver500'], type: 'number' },
              { label: 'Tile base', path: ['interiorFinish', 'labor', 'tileBase'], type: 'number' },
              { label: 'Tile per 100 sqft over 500', path: ['interiorFinish', 'labor', 'tilePer100SqftOver500'], type: 'number' },
              { label: 'Spa labor', path: ['interiorFinish', 'labor', 'spa'], type: 'number' },
            ],
          },
          {
            title: 'Material (per sqft unless noted)',
            scalars: [
              { label: 'Plaster', path: ['interiorFinish', 'material', 'plaster'], type: 'number' },
              { label: 'PebbleTec', path: ['interiorFinish', 'material', 'pebbleTec'], type: 'number' },
              { label: 'PebbleSheen', path: ['interiorFinish', 'material', 'pebbleSheen'], type: 'number' },
              { label: 'PebbleFina', path: ['interiorFinish', 'material', 'pebbleFina'], type: 'number' },
              { label: 'Mini pebble', path: ['interiorFinish', 'material', 'miniPebble'], type: 'number' },
              { label: 'Beadcrete', path: ['interiorFinish', 'material', 'beadcrete'], type: 'number' },
              { label: 'QuartzScapes', path: ['interiorFinish', 'material', 'quartzScapes'], type: 'number' },
              { label: 'Hydrazzo', path: ['interiorFinish', 'material', 'hydrazzo'], type: 'number' },
              { label: 'Tile finish', path: ['interiorFinish', 'material', 'tile'], type: 'number' },
              { label: 'Spa finish', path: ['interiorFinish', 'material', 'spaFinish'], type: 'number' },
            ],
          },
          {
            title: 'Water truck',
            scalars: [
              { label: 'Base load', path: ['interiorFinish', 'waterTruck', 'base'], type: 'number' },
              { label: 'Load size (gallons)', path: ['interiorFinish', 'waterTruck', 'loadSizeGallons'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Cleanup',
        groups: [
          {
            title: 'Final cleanup',
            scalars: [
              { label: 'Pool cleanup', path: ['cleanup', 'basePool'], type: 'number' },
              { label: 'Spa cleanup add-on', path: ['cleanup', 'spa'], type: 'number' },
              { label: 'Per sqft over 500', path: ['cleanup', 'perSqftOver500'], type: 'number' },
              { label: 'RBB cleanup (per sqft)', path: ['cleanup', 'rbbPerSqft'], type: 'number' },
              { label: 'Travel per mile', path: ['cleanup', 'travelPerMile'], type: 'number' },
              { label: 'Rough grading', path: ['cleanup', 'roughGrading'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Fiberglass Shells',
        groups: [
          {
            title: 'Pool shells',
            scalars: [
              { label: 'Small shell', path: ['fiberglass', 'small'], type: 'number' },
              { label: 'Medium shell', path: ['fiberglass', 'medium'], type: 'number' },
              { label: 'Large shell', path: ['fiberglass', 'large'], type: 'number' },
              { label: 'Crystite upgrade', path: ['fiberglass', 'crystite'], type: 'number' },
            ],
          },
          {
            title: 'Spa shells & options',
            scalars: [
              { label: 'Small spa shell', path: ['fiberglass', 'spaSmall'], type: 'number' },
              { label: 'Medium spa shell', path: ['fiberglass', 'spaMedium'], type: 'number' },
              { label: 'Large spa shell', path: ['fiberglass', 'spaLarge'], type: 'number' },
              { label: 'Spillover', path: ['fiberglass', 'spillover'], type: 'number' },
              { label: 'Crane allowance', path: ['fiberglass', 'crane'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Equipment Set & Drainage',
        groups: [
          {
            title: 'Equipment set labor',
            scalars: [
              { label: 'Base equipment set', path: ['misc', 'equipmentSet', 'base'], type: 'number' },
              { label: 'Spa equipment add-on', path: ['misc', 'equipmentSet', 'spa'], type: 'number' },
              { label: 'Automation add-on', path: ['misc', 'equipmentSet', 'automation'], type: 'number' },
              { label: 'Heat pump add-on', path: ['misc', 'equipmentSet', 'heatPump'], type: 'number' },
            ],
          },
          {
            title: 'Drainage (per lnft)',
            scalars: [
              { label: 'Base cost (includes first 10ft)', path: ['misc', 'drainage', 'baseCost'], type: 'number' },
              { label: 'Included feet', path: ['misc', 'drainage', 'includedFt'], type: 'number' },
              { label: 'Per ft over included', path: ['misc', 'drainage', 'perFtOver'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Masonry',
        groups: [
          {
            title: 'Columns & facing (labor)',
            scalars: [
              { label: 'Column base (per column)', path: ['masonry', 'columnBase'], type: 'number' },
              { label: 'RBB facing labor - tile', path: ['masonry', 'labor', 'rbbFacing', 'tile'], type: 'number' },
              { label: 'RBB facing labor - panel ledge', path: ['masonry', 'labor', 'rbbFacing', 'panelLedge'], type: 'number' },
              { label: 'RBB facing labor - stacked stone', path: ['masonry', 'labor', 'rbbFacing', 'stackedStone'], type: 'number' },
              { label: 'Raised spa facing labor - tile', path: ['masonry', 'labor', 'raisedSpaFacing', 'tile'], type: 'number' },
              { label: 'Raised spa facing labor - ledgestone', path: ['masonry', 'labor', 'raisedSpaFacing', 'ledgestone'], type: 'number' },
              { label: 'Raised spa facing labor - stacked stone', path: ['masonry', 'labor', 'raisedSpaFacing', 'stackedStone'], type: 'number' },
              { label: 'Spillway labor', path: ['masonry', 'labor', 'spillway'], type: 'number' },
            ],
          },
          {
            title: 'Columns & facing (material)',
            scalars: [
              { label: 'Raised spa facing - tile', path: ['masonry', 'raisedSpaFacing', 'tile'], type: 'number' },
              { label: 'Raised spa facing - ledge stone', path: ['masonry', 'raisedSpaFacing', 'ledgestone'], type: 'number' },
              { label: 'Raised spa facing - stacked stone', path: ['masonry', 'raisedSpaFacing', 'stackedStone'], type: 'number' },
              { label: 'RBB facing - tile', path: ['masonry', 'rbbFacing', 'tile'], type: 'number' },
              { label: 'RBB facing - panel ledge', path: ['masonry', 'rbbFacing', 'panelLedge'], type: 'number' },
              { label: 'RBB facing - stacked stone', path: ['masonry', 'rbbFacing', 'stackedStone'], type: 'number' },
              { label: 'RBB facing material - tile', path: ['masonry', 'material', 'rbbFacing', 'tile'], type: 'number' },
              { label: 'RBB facing material - panel ledge', path: ['masonry', 'material', 'rbbFacing', 'panelLedge'], type: 'number' },
              { label: 'RBB facing material - stacked stone', path: ['masonry', 'material', 'rbbFacing', 'stackedStone'], type: 'number' },
              { label: 'Raised spa facing material - tile', path: ['masonry', 'material', 'raisedSpaFacing', 'tile'], type: 'number' },
              { label: 'Raised spa facing material - ledgestone', path: ['masonry', 'material', 'raisedSpaFacing', 'ledgestone'], type: 'number' },
              { label: 'Raised spa facing material - stacked stone', path: ['masonry', 'material', 'raisedSpaFacing', 'stackedStone'], type: 'number' },
              { label: 'Spillway material', path: ['masonry', 'material', 'spillway'], type: 'number' },
            ],
          },
        ],
      },
    ],
    [data.electrical.overrunThreshold, data.plumbing.gasOverrunThreshold, data.plumbing.poolOverrunThreshold, data.plumbing.spaOverrunThreshold],
  );

  const renderScalar = (field: ScalarField) => {
    const value = getValue(data, field.path);
    if (field.type === 'boolean') {
      return (
        <label className="pricing-field">
          <div className="pricing-field__label">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => handleScalarChange(field, e.target.checked)}
            />
            <span>{field.label}</span>
          </div>
          {field.note && <div className="pricing-field__note">{field.note}</div>}
        </label>
      );
    }

    return (
      <label className="pricing-field">
        <div className="pricing-field__label">{field.label}</div>
        <input
          className="pricing-field__input"
          type={field.type === 'number' ? 'number' : 'text'}
          value={typeof value === 'number' ? value : value ?? ''}
          onChange={(e) => handleScalarChange(field, e.target.value)}
        />
        {field.note && <div className="pricing-field__note">{field.note}</div>}
      </label>
    );
  };

  const renderList = (config: ListConfig) => {
    const entries = (getValue(data, config.path) as any[]) || [];

    return (
      <div className="pricing-list-card">
        <div className="pricing-list-card__header">
          <h5>{config.title}</h5>
          <button className="pricing-chip-button" onClick={() => handleAddListItem(config)}>
            Add
          </button>
        </div>
        <div className="pricing-list-card__body">
          {entries.map((entry, index) => (
            <div key={`${config.title}-${index}`} className="pricing-list-row">
              <div className="pricing-list-row__fields">
                {config.fields.map((field) => {
                  const fieldValue = entry ? entry[field.key] : '';
                  if (field.type === 'boolean') {
                    return (
                      <label key={field.key} className="pricing-field inline">
                        <div className="pricing-field__label">
                          <input
                            type="checkbox"
                            checked={Boolean(fieldValue)}
                            onChange={(e) => handleListChange(config, index, field, e.target.checked)}
                          />
                          <span>{field.label}</span>
                        </div>
                      </label>
                    );
                  }

                  return (
                    <label key={field.key} className="pricing-field inline">
                      <div className="pricing-field__label">{field.label}</div>
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        className="pricing-field__input"
                        value={field.type === 'number' ? fieldValue ?? 0 : fieldValue ?? ''}
                        placeholder={field.placeholder}
                        onChange={(e) => handleListChange(config, index, field, e.target.value)}
                      />
                    </label>
                  );
                })}
              </div>
              <button
                className="pricing-chip-button danger"
                onClick={() => handleRemoveListItem(config, index)}
                aria-label="Remove item"
              >
                Remove
              </button>
            </div>
          ))}
          {entries.length === 0 && (
            <div className="pricing-empty">No items yet. Add one to get started.</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pricing-modal-backdrop" onClick={handleBackdropClick}>
      <div className="pricing-modal">
        <div className="pricing-modal__header">
          <div>
            <h2>Pricing Data (Live Edit)</h2>
            <p className="pricing-modal__lede">
              Adjust labor, material, and equipment costs without touching code. Changes persist locally and apply immediately to pricing calculations.
            </p>
          </div>
          <div className="pricing-modal__actions">
            <button className="pricing-chip-button ghost" onClick={resetPricingData}>
              Reset to defaults
            </button>
            <button className="pricing-modal__close" onClick={onClose} aria-label="Close pricing data">
              x
            </button>
          </div>
        </div>

        <div className="pricing-model-controls">
          <div className="pricing-model-controls__row">
            <div className="pricing-model-controls__left">
              <label className="pricing-field">
                <div className="pricing-field__label">Pricing Model Name</div>
                <input
                  type="text"
                  className="pricing-field__input"
                  value={modelName}
                  placeholder="e.g., 4th of July Pricing"
                  onChange={(e) => setModelName(e.target.value)}
                />
              </label>
            </div>
          <div className="pricing-model-controls__right">
            <label className="pricing-checkbox">
              <input
                type="checkbox"
                checked={setDefaultModel}
                  onChange={(e) => setSetDefaultModel(e.target.checked)}
                />
                <span>Set as default after saving</span>
            </label>
            <button className="pricing-chip-button ghost" type="button" onClick={handleCreateNewModel}>
              Create New Pricing Model
            </button>
            <button className="pricing-chip-button primary" onClick={handleSaveModel} disabled={savingModel}>
              {savingModel ? 'Saving…' : 'Save Pricing Model'}
            </button>
          </div>
        </div>
          {saveError && <div className="pricing-model-error">{saveError}</div>}
          <div className="pricing-model-list">
            <div className="pricing-model-list__header">Existing Pricing Models</div>
            <div className="pricing-model-list__items">
              {pricingModels.length === 0 && <div className="pricing-empty">No models yet.</div>}
              {pricingModels.map((model) => (
                <div key={model.id} className={`pricing-model-chip ${model.isDefault ? 'default' : ''}`}>
                  <div className="pricing-model-chip__main">
                    <div className="pricing-model-chip__name">
                      {model.name} {model.isDefault ? '(Default)' : ''}
                    </div>
                    <div className="pricing-model-chip__meta">
                      Created {new Date(model.createdAt || model.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="pricing-model-chip__actions">
                    <button className="pricing-chip-button ghost" onClick={() => handleLoadModel(model.id)}>
                      Load
                    </button>
                    {!model.isDefault && (
                      <button className="pricing-chip-button ghost" onClick={() => handleSetDefault(model.id)}>
                        Make Default
                      </button>
                    )}
                    {!model.isDefault && (
                      <button className="pricing-chip-button danger" onClick={() => handleDeleteModel(model.id, model.isDefault)}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pricing-modal__content">
          {sections.map((section) => {
            const open = openSections[section.title] ?? true;
            return (
              <section key={section.title} className={`pricing-section ${open ? 'open' : ''}`}>
                <button className="pricing-section__header" onClick={() => toggleSection(section.title)}>
                  <span>{section.title}</span>
                  <span className="chevron">{open ? 'v' : '>'}</span>
                </button>
                {open && (
                  <div className="pricing-section__body">
                    {section.groups.map((group) => (
                      <div key={group.title} className="pricing-group">
                        <div className="pricing-group__heading">
                          <h4>{group.title}</h4>
                        </div>
                        {group.scalars && (
                          <div className="pricing-fields-grid">
                            {group.scalars.map((field) => (
                              <React.Fragment key={`${section.title}-${group.title}-${field.label}`}>
                                {renderScalar(field)}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                        {group.lists && (
                          <div className="pricing-lists">
                            {group.lists.map((list) => (
                              <React.Fragment key={`${group.title}-${list.title}`}>
                                {renderList(list)}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PricingDataModal;
