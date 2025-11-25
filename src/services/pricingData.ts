// ============================================================================
// PRICING DATA - Extracted from Excel Spreadsheet
// ============================================================================

const pricingData = {
  // PAP (Preferred Approved Provider) Discount Rates
  // These are applied as negative line items in various sections
  papDiscountRates: {
    excavation: 0.10, // 10%
    plumbing: 0.10, // 10%
    steel: 0.10, // 10%
    electrical: 0.00, // No discount in Excel
    shotcrete: 0.10, // 10% (combined labor + material)
    tileCopingLabor: 0.10, // 10%
    tileCopingMaterial: 0.10, // 10% (on specific quantities)
    equipment: 0.10, // 10%
    interiorFinish: 0.10, // 10%
    startup: 0.10, // 10%
  },
  plans: {
    poolOnly: 410,
    spa: 80,
    waterfall: 15,
    waterFeature: 10,
    soilSampleEngineer: 750,
  },
  excavation: {
    // Base pricing table from EXC sheet (surface area breakpoints)
    baseRanges: [
      { max: 400, price: 2700 },
      { max: 450, price: 2700 },
      { max: 500, price: 2700 },
      { max: 550, price: 2700 },
      { max: 600, price: 2700 },
      { max: 650, price: 2700 },
      { max: 700, price: 2700 },
      { max: 750, price: 2700 },
      { max: 800, price: 2750 },
      { max: 850, price: 3000 },
      { max: 900, price: 3100 },
      { max: 950, price: 3150 },
      { max: 1000, price: 3150 },
    ],
    over1000Sqft: 4900,
    additional6InchDepth: 90,
    rbb6: 5,
    rbb12: 6.5,
    rbb18: 7.5,
    rbb24: 8.5,
    rbb30: 9,
    rbb36: 10,
    baseSpa: 200,
    raisedSpa: 350,
    sitePrep: 200,
    backfill: 600,
    gravelPerSqft: 2.75,
    dirtHaulPerYard: 18,
    coverBox: 450,
    travelPerMile: 7,
    misc: 75,
  },
  plumbing: {
    shortStub: 550,
    spaBase: 750,
    poolOverrunPerFt: 25,
    poolOverrunThreshold: 33,
    spaOverrunPerFt: 22,
    spaOverrunThreshold: 30,
    gasOverrunPerFt: 11,
    gasOverrunThreshold: 25,
    heaterSet: 300,
    waterFeatureRun: {
      setup: 200,
      baseAllowanceFt: 30,
      perFt: 5.5,
    },
    additionalWaterFeatureRunPerFt: 5.5,
    spaPlumbing: 5,
    twoInchPipe: 5.5,
    twoPointFiveInchPipe: 7,
    threeInchPipe: 8.75,
    infloorPerFt: 10,
    conduitPerFt: 2.75,
    manifold: 175,
    stripForms: 700,
    cleanerPerFt: 3.25,
    autoFillPerFt: 3.5,
    additionalSkimmer: 275,
    travelPerMile: 5,
  },
  waterFeatures: {
    // Pricing pulled from Regular pricing.xlsx, Equip tab, column S
    catalog: [
      { id: 'sheer-12', name: '12" Sheer Descent', category: 'Sheer Descents', unitPrice: 760, note: 'Cascading Water Feature' },
      { id: 'sheer-18', name: '18" Sheer Descent', category: 'Sheer Descents', unitPrice: 780, note: 'Cascading Water Feature' },
      { id: 'sheer-2', name: "2' Sheer Descent", category: 'Sheer Descents', unitPrice: 820, note: 'Cascading Water Feature' },
      { id: 'sheer-3', name: "3' Sheer Descent", category: 'Sheer Descents', unitPrice: 880, note: 'Cascading Water Feature' },
      { id: 'sheer-4', name: "4' Sheer Descent", category: 'Sheer Descents', unitPrice: 1000, note: 'Cascading Water Feature' },
      { id: 'sheer-5', name: "5' Sheer Descent (Requires 2nd Pump)", category: 'Sheer Descents', unitPrice: 1120, note: 'Requires second pump' },
      { id: 'sheer-6', name: "6' Sheer Descent (Requires 2nd Pump)", category: 'Sheer Descents', unitPrice: 1300, note: 'Requires second pump' },
      { id: 'deck-jet', name: 'Deck Jet', category: 'Jets', unitPrice: 420 },
      { id: 'laminar-jet', name: 'Laminar Jet', category: 'Jets', unitPrice: 1760 },
      { id: 'wok-water-30', name: '30" Precast Wok - Water Only', category: 'Precast Woks - Water Only', unitPrice: 1920 },
      { id: 'wok-water-32', name: '32" Precast Wok - Water Only', category: 'Precast Woks - Water Only', unitPrice: 2060 },
      { id: 'wok-water-36', name: '36" Precast Wok - Water Only', category: 'Precast Woks - Water Only', unitPrice: 2260, note: 'Add $500 for Copper' },
      { id: 'wok-fire-water-30', name: '30" Precast Wok - Fire & Water', category: 'Precast Woks - Fire & Water', unitPrice: 5060, note: 'Match throw add $588, auto add $2134, add $500 for copper' },
      { id: 'wok-fire-water-36', name: '36" Precast Wok - Fire & Water', category: 'Precast Woks - Fire & Water', unitPrice: 6020, note: 'Match throw add $588, auto add $2134, add $500 for copper' },
      { id: 'wok-fire-30', name: '30" Precast Wok - Fire Only', category: 'Precast Woks - Fire Only', unitPrice: 1760, note: 'Match throw add $588, auto add $2134, add $500 for copper' },
      { id: 'wok-fire-36', name: '36" Precast Wok - Fire Only', category: 'Precast Woks - Fire Only', unitPrice: 2100, note: 'Match throw add $588, auto add $2134, add $500 for copper' },
      { id: 'led-bubbler', name: 'LED Bubbler (with light)', category: 'Bubblers & Lighting', unitPrice: 1380, note: 'Includes bubbler and light; add matching light run + water feature run' },
    ],
  },
  electrical: {
      baseElectrical: 1650, // Includes first 65ft of electric run
      overrunPerFt: 18, // Excel ELEC!B5
      overrunThreshold: 65,
      spaElectrical: 255,
      lightAdditionalPerLight: 100, // Each light beyond the first
      lightRunPerFt: 2.75,
      lightRunConduitMultiplier: 1.25,
      baseGas: 1500,
      gasPerFtOverThreshold: 11,
      heatPumpElectricalBase: 450,
      heatPumpElectrical: 450,
      heatPumpOverrunThreshold: 40,
      heatPumpPerFtOver: 6,
      saltSystem: 200,
      automation: 250,
      bonding: 300,
      outlet: 85,
      travelPerMile: 7,
      autoFillPerFt: 3,
    },
  steel: {
    poolBase: 25,
    spaBase: 450,
    fourBarBeam: 100,
    raisedSpa: 150,
    stepsPerLnft: 8,
    tanningShelf: 275,
    depthOver8Ft: 80,
    rbb6PerLnft: 3,
    rbb12PerLnft: 4,
    rbb18PerLnft: 5,
    rbb24PerLnft: 6,
    rbb30PerLnft: 7,
    rbb36PerLnft: 7,
    doubleCurtainPerLnft: 35,
    spaDoubleCurtain: 75,
    poolBonding: 500,
    muckOut: 100, // Unit price (Excel: $100 × 2 qty = $200)
    muckOutQty: 2,
    automaticCover: 0,
    travelPerMile: 7,
  },
  shotcrete: {
    labor: {
      poolBase: 90,
      minimumYards: 32,
      spa: 250,
      autoCover: 250,
      distance250to300: 500,
      distance300to350: 1000,
      travelPerMile: 7,
    },
    material: {
      perYard: 228,
      cleanOut: 125,
      envFuelPerYard: 25,
      misc: 125, // Fixed: Excel shows $125, not $150
      travelPerMile: 7,
      taxRate: 0.0725, // Default 7.25% (can be overridden by county-based calculation)
    },
  },
  tileCoping: {
    materialTaxRate: 0.0725,
    tileMaterialTaxRate: 0.075,
    flagstoneQuantityMultiplier: 1.1, // 10% overage for flagstone materials (Excel rows 192-197)
    rockworkMaterialWaste: {
      panelLedge: 1.15, // 15% material overage on panel ledge (matches TILE COPING sheet)
    },
    tile: {
      labor: {
        level1: 10,
        level2: 10,
        level3: 10,
        stepTrim: 10,
      },
      material: {
        level1: 7,
        level2Upgrade: 20,
        level3Upgrade: 50,
        stepTrim: 4,
      },
    },
    coping: {
      cantilever: 0,
      flagstone: 15,
      pavers: 12,
      travertineLevel1: 12,
      travertineLevel2: 12,
      concrete: 16.5,
      bullnoseLabor: 8,
      doubleBullnoseLabor: 8,
      spillwayLabor: 150,
    },
    decking: {
      labor: {
        pavers: 8,
        travertine: 8,
        concrete: 16.5,
        concreteSteps: 27,
      },
      material: {
        pavers: 7,
        travertineLevel1: 7.5,
        travertineLevel2: 9.75,
        concrete: 7,
        concreteSteps: 7.5,
        flagstone: 25,
        coping: {
        paver: 9,
        travertineLevel1: 11,
        travertineLevel2: 12,
        travertinelevel1: 11,
        travertinelevel2: 12,
        concrete: 7,
      },
        rockwork: {
          panelLedge: 13,
          stackedStone: 27,
          tile: 0,
        },
        bullnose: 0,
        doubleBullnose: 0,
        spillway: 0,
      },
      rockworkLabor: {
        panelLedge: 12.5,
        stackedStone: 16,
        tile: 0,
      },
      bullnoseLabor: 8,
      doubleBullnoseLabor: 8,
      spillwayLabor: 150,
      spillwayMaterial: 150,
    },
  },
  equipment: {
    pumps: [
      { name: 'No Pump (Select pump)', model: 'NONE', price: 0 },
      { name: 'Jandy 1.65HP Variable Pump', model: 'VS-1.65HP', price: 2310 },
      { name: 'Jandy 1.85HP Variable Pump', model: 'VS-1.85HP', price: 2540 },
      { name: 'Jandy 2.7HP Variable Pump', model: 'VS-2.7HP', price: 2174.15 },
      { name: 'Jandy 1.0HP Single Speed Pump', model: 'SS-1.0HP', price: 1900 },
      { name: 'Jandy 2.0HP Single Speed Pump', model: 'SS-2.0HP', price: 2060 },
    ],
    filters: [
      { name: 'No Filter (Select filter)', sqft: 0, price: 0 },
      { name: '200 SQFT Cartridge Filter', sqft: 200, price: 1103.57 },
      { name: '340 SQFT Cartridge Filter', sqft: 340, price: 1618.57 },
      { name: '460 SQFT Cartridge Filter', sqft: 460, price: 1174.20 },
      { name: '580 SQFT Cartridge Filter', sqft: 580, price: 2133.57 },
      { name: '4.9 SQFT Sand Filter', sqft: 0, price: 1115.2 },
      { name: '60 SQFT DE Filter', sqft: 60, price: 1224.37 },
    ],
    cleaners: [
      { name: 'Polaris Epic IQ', price: 1540 },
      { name: 'Polaris Alpha IQ', price: 1397.13 },
      { name: 'Polaris 360 Standard', price: 1618.57 },
      { name: 'Polaris 360 Black', price: 1677.43 },
      { name: 'Polaris 280 w/ Booster', price: 2133.57 },
      { name: 'No Cleaner', price: 0 },
    ],
    heaters: [
      { name: 'No Heater (Select heater)', btu: 0, price: 0, isVersaFlo: false },
      { name: 'Jandy 400K BTU - VersaFlo', btu: 400000, price: 3297, isVersaFlo: true },
      { name: 'Jandy LXI 250K BTU', btu: 250000, price: 1885, isVersaFlo: false },
      { name: 'Jandy JXI 400K - No Bypass', btu: 400000, price: 2308, isVersaFlo: false },
      { name: 'Jandy JXI 400K - w/ Bypass', btu: 400000, price: 2475, isVersaFlo: false },
      { name: 'Heat Pump', btu: 0, price: 0, isVersaFlo: false },
    ],
    lights: {
      nicheLightPrice: 601, // 24 Watt - Jandy Nicheless LED (Excel)
      spaLightAddon: 0,
      additionalLightPrice: 601,
      catalog: [],
    },
    automation: [
      // Automation prices include the 6614 base panel and any required install adders (matches EQUIP sheet rows 61-69)
      { name: 'No Automation', price: 0, hasChemistry: false },
      { name: '6614 APL BASE PANEL', price: 1600, hasChemistry: false },
      { name: 'Additional JVA', price: 1800, hasChemistry: false }, // base panel + JVA
      { name: 'Jandy TCX Controler (1 JVA, Lights and Heater Control)', price: 2250, hasChemistry: false }, // base + 650
      { name: 'iAqualink Only P-4 (H.O. To Provide WiFi)', price: 2575, hasChemistry: false }, // base + 650 + install
      { name: 'iAqualink Only PS-4 (H.O. To Provide WiFi) Only use with Infinite Light System', price: 3025, hasChemistry: false }, // base + 1100 + install
      { name: 'iAqualink Only PS-6 (H.O. To Provide WiFi)', price: 3722, hasChemistry: false }, // base + 1797 + install
      { name: 'iAqualink Only PS-8 (H.O. To Provide WiFi)', price: 4525, hasChemistry: false }, // base + 2600 + install
      { name: 'IQ Pump 01', price: 1721, hasChemistry: false }, // base + 121
    ],
    automationZoneAddon: 365, // Per additional zone
    saltSystem: [
      { name: 'Jandy AquaPure 1400', model: 'AquaPure', price: 0 },
      { name: 'Jandy Tru-Clear', model: 'TruClear', price: 1150 },
      { name: 'Salt/mineral System - Fusion Soft', model: 'FusionSoft', price: 1000 },
      { name: 'No Salt System', model: 'None', price: 0 },
    ],
    blanketReel: 0,
    solarBlanket: 0,
    autoFill: 0,
    handrail: 0,
    startupChemicals: 0,
    baseWhiteGoods: 1046.1,
    taxRate: 0.0725, // Equipment tax rate (Excel shows 7.3% -> effective 7.25% with rounding)
  },
  interiorFinish: {
    minimumChargeSqft: 850,
    labor: {
      plasterBase: 0,
      plasterPer100SqftOver500: 0,
      pebbleBase: 6.3,
      pebblePer100SqftOver500: 0,
      quartzBase: 7.9,
      quartzPer100SqftOver500: 0,
      polishedBase: 6.75,
      polishedPer100SqftOver500: 0,
      tileBase: 9.25,
      tilePer100SqftOver500: 0,
      spa: 850,
    },
    material: {
      pebbleTecL1: 6.3,
      pebbleTecL2: 7.9,
      pebbleTecL3: 8.85,
      pebbleSheenL1: 6.75,
      pebbleSheenL2: 7.85,
      pebbleSheenL3: 9.25,
      pebbleFinaL1: 7.75,
      pebbleFinaL2: 10,
      pebbleBrilliance: 17,
      pebbleBreeze: 23,
      spaFinish: 1150,
    },
    waterTruck: {
      base: 490,
      loadSizeGallons: 7000,
    },
    extras: {
      poolPrepBase: 750,
      poolPrepThreshold: 1200,
      poolPrepOverRate: 1,
      spaPrep: 100,
      misc: 100,
      travelPerMile: 10,
      stepDetailPerLnftOver20: 20,
      waterproofingPerSqft: 1.95, // Waterproofing rate per sqft (INT sheet)
      waterproofingRaisedSpa: 300,
    },
  },
  cleanup: {
    basePool: 700,
    spa: 100,
    perSqftOver500: 0.5,
    rbbPerSqft: 2.5,
    travelPerMile: 7,
    roughGrading: 700,
  },
  fiberglass: {
    small: 12192,
    medium: 15120,
    large: 18228,
    crystite: 16632,
    spaSmall: 8727,
    spaMedium: 10242,
    spaLarge: 13857,
    spillover: 1000,
    crane: 2500,
    noCrane: 150, // FIBER!D66 (applies when fiberglass is not selected)
    freight: 900, // Per shell (Excel: SUM(FIBER!G62:G64))
    surcharge2022: 0, // 2022 surcharge per shell (Excel: FIBER!C65)
    discountRate: 0.10, // 10% discount on shell costs
    taxRate: 0.0725, // 7.25% tax on total
    fiberglassInstall: {
      labor: 2500, // Installation labor
      gravel: 600, // Gravel for base
    },
    spaModels: [
      { name: 'Meridian', price: 4794 },
      { name: 'Mystic', price: 4575 },
      { name: 'Regal', price: 5000 },
      { name: 'Royal', price: 5000 },
      { name: 'Shasta', price: 4150 },
    ],
    models: [
      { name: 'Caeser', size: 'small', price: 11325, perimeter: 48 },
      { name: 'Chateau & Gayla 12', size: 'small', price: 14825, perimeter: 70 },
      { name: 'Gayla 12/Freeport', size: 'small', price: 14375, perimeter: 64 },
      { name: 'Lotus 12/Bermuda', size: 'small', price: 15375, perimeter: 73 },
      { name: 'Santorini & Bliss 12', size: 'small', price: 12825, perimeter: 59 },
      { name: 'Belvedere', size: 'medium', price: 22801, perimeter: 84 },
      { name: 'Martinique Grand', size: 'medium', price: 23825, perimeter: 92 },
      { name: 'Noveau 14', size: 'medium', price: 23625, perimeter: 83 },
      { name: 'Lotus 14', size: 'medium', price: 20650, perimeter: 74 },
      { name: 'Renaissance 14', size: 'medium', price: 23625, perimeter: 81 },
      { name: 'Sovereign & Gayla 14', size: 'medium', price: 21275, perimeter: 90 },
      { name: 'Belvedere/Olympia 14', size: 'medium', price: 24100, perimeter: 85 },
      { name: 'Aristocrat', size: 'large', price: 25075, perimeter: 104 },
      { name: 'Lotus XL', size: 'large', price: 26100, perimeter: 101 },
      { name: 'Elysium Grand', size: 'large', price: 25600, perimeter: 114 },
      { name: 'Grand Palace', size: 'large', price: 30000, perimeter: 137 },
      { name: 'Imperial', size: 'large', price: 21700, perimeter: 94 },
      { name: 'Gayla 16', size: 'large', price: 24000, perimeter: 96 },
      { name: 'Oasis 16', size: 'large', price: 23300, perimeter: 87 },
      { name: 'Gayla XDL', size: 'large', price: 27725, perimeter: 83 },
      { name: 'Versailles', size: 'large', price: 30500, perimeter: 108 },
      { name: 'Villa Reale', size: 'large', price: 29600, perimeter: 107 },
    ],
    spas: [
      { name: 'Meridian', price: 4794 },
      { name: 'Mystic', price: 4575 },
      { name: 'Regal', price: 5000 },
      { name: 'Royal', price: 5000 },
    ],
  },
  misc: {
    layout: {
      poolOnly: 50,
      spa: 15,
      siltFencing: 500,
    },
    permit: {
      poolOnly: 850,
      spa: 150,
      permitRunner: 75,
    },
    equipmentSet: {
      base: 750,
      spa: 100,
      automation: 200,
      heatPump: 100,
      additionalPump: 150,
      ozoneBase: 200,
      heater: 200,
      poolBonding: 125,
    },
    drainage: {
      baseCost: 150, // includes first 10 ft
      includedFt: 10,
      perFtOver: 12.5,
    },
    startup: {
      base: 700,
      automationAdd: 300,
      premium: 800,
      taxRate: 0.0725,
    },
  },
  masonry: {
    columnBase: 500,
    labor: {
      rbbFacing: {
        tile: 0,
        panelLedge: 12.5,
        stackedStone: 16,
      },
      raisedSpaFacing: {
        tile: 0,
        ledgestone: 12.5,
        stackedStone: 16,
      },
      spillway: 150,
    },
    raisedSpaFacing: {
      tile: 350,
      ledgestone: 400,
      stackedStone: 450,
    },
    rbbFacing: {
      tile: 300,
      panelLedge: 350,
      stackedStone: 400,
    },
    material: {
      rbbFacing: {
        tile: 0,
        panelLedge: 13,
        stackedStone: 27,
      },
      raisedSpaFacing: {
        tile: 0,
        ledgestone: 13,
        stackedStone: 27,
      },
      spillway: 150,
    },
    raisedSpaWasteMultiplier: 1.125, // Waste factor applied to raised spa facing area
    raisedSpaMaterialWaste: 1.15, // Material overage for raised spa facing
    retainingWalls: [
      { name: 'No Retaining Wall', heightFt: 0, costPerSqft: 0 },
      { name: '12" High - Standard', heightFt: 2, costPerSqft: 50 },
      { name: '24" High - Standard', heightFt: 3, costPerSqft: 50 },
      { name: '36" High - Standard', heightFt: 4, costPerSqft: 50 },
      { name: '48" High - Standard', heightFt: 5, costPerSqft: 50 },
      { name: '12" High - CMU - Veneer Facing - 1-Side', heightFt: 2, costPerSqft: 65 },
      { name: '24" High - CMU - Veneer Facing - 1-Side', heightFt: 3, costPerSqft: 65 },
      { name: '36" High - CMU - Veneer Facing - 1-Side', heightFt: 4, costPerSqft: 65 },
      { name: '48" High - CMU - Veneer Facing - 1-Side', heightFt: 5, costPerSqft: 65 },
      { name: '12" High - CMU - Veneer Facing - 2-Sides', heightFt: 2, costPerSqft: 75 },
      { name: '24" High - CMU - Veneer Facing - 2-Sides', heightFt: 3, costPerSqft: 75 },
      { name: '36" High - CMU - Veneer Facing - 2-Sides', heightFt: 4, costPerSqft: 75 },
      { name: '48" High - CMU - Veneer Facing - 2-Sides', heightFt: 5, costPerSqft: 75 },
    ],
  },
};

export default pricingData;
