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
  // Manual retail adjustments (designer-facing)
  manualAdjustments: {
    positive1: 0,
    positive2: 0,
    negative1: 0,
    negative2: 0,
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
    // Pricing pulled from Regular pricing.xlsx, Equip tab (Name + Base + Adders)
    retailMargin: 0.7, // Normal 70% retail margin applied to COGS
    sheerDescents: [
      { id: 'sheer-12', name: '12" Sheer Descent', basePrice: 760, addCost1: 0, addCost2: 0, note: 'Cascading Water Feature' },
      { id: 'sheer-18', name: '18" Sheer Descent', basePrice: 780, addCost1: 0, addCost2: 0, note: 'Cascading Water Feature' },
      { id: 'sheer-2', name: "2' Sheer Descent", basePrice: 820, addCost1: 0, addCost2: 0, note: 'Cascading Water Feature' },
      { id: 'sheer-3', name: "3' Sheer Descent", basePrice: 880, addCost1: 0, addCost2: 0, note: 'Cascading Water Feature' },
      { id: 'sheer-4', name: "4' Sheer Descent", basePrice: 1000, addCost1: 0, addCost2: 0, note: 'Cascading Water Feature' },
      { id: 'sheer-5', name: "5' Sheer Descent (Requires 2nd Pump)", basePrice: 1120, addCost1: 0, addCost2: 0, note: 'Requires second pump' },
      { id: 'sheer-6', name: "6' Sheer Descent (Requires 2nd Pump)", basePrice: 1300, addCost1: 0, addCost2: 0, note: 'Requires second pump' },
    ],
    jets: [
      { id: 'deck-jet', name: 'Deck Jet', basePrice: 420, addCost1: 0, addCost2: 0 },
      { id: 'laminar-jet', name: 'Laminar Jet', basePrice: 1760, addCost1: 0, addCost2: 0 },
    ],
    woks: {
      waterOnly: [
        { id: 'wok-water-30', name: '30" Precast Wok - Water Only', basePrice: 1920, addCost1: 0, addCost2: 0 },
        { id: 'wok-water-32', name: '32" Precast Wok - Water Only', basePrice: 2060, addCost1: 0, addCost2: 0 },
        { id: 'wok-water-36', name: '36" Precast Wok - Water Only', basePrice: 2260, addCost1: 0, addCost2: 0, note: 'Add $500 for Copper' },
      ],
      fireOnly: [
        { id: 'wok-fire-30', name: '30" Precast Wok - Fire Only', basePrice: 1760, addCost1: 0, addCost2: 0, note: 'Match throw add $588, auto add $2134, add $500 for copper' },
        { id: 'wok-fire-36', name: '36" Precast Wok - Fire Only', basePrice: 2100, addCost1: 0, addCost2: 0, note: 'Match throw add $588, auto add $2134, add $500 for copper' },
      ],
      waterAndFire: [
        { id: 'wok-fire-water-30', name: '30" Precast Wok - Water & Fire', basePrice: 5060, addCost1: 0, addCost2: 0, note: 'Match throw add $588, auto add $2134, add $500 for copper' },
        { id: 'wok-fire-water-36', name: '36" Precast Wok - Water & Fire', basePrice: 6020, addCost1: 0, addCost2: 0, note: 'Match throw add $588, auto add $2134, add $500 for copper' },
      ],
    },
    bubblers: [
      { id: 'led-bubbler', name: 'LED Bubbler (with light)', basePrice: 1380, addCost1: 0, addCost2: 0, note: 'Includes bubbler and light; add matching light run + water feature run' },
    ],
  },
  electrical: {
      baseElectrical: 1650, // Includes first 65ft of electric run
      overrunPerFt: 18, // Excel ELEC!B5
      overrunThreshold: 65,
      spaElectrical: 255, // Heater electrical cost (ELEC!Row7)
      heaterElectrical: 255, // alias for naming clarity/backward compatibility
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
      concrete: 0,
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
        concrete: 0,
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
    pumpOverheadMultiplier: 1.1, // Pumps only: (base + add1 + add2) * 1.1 before COGS
    pumps: [
      { name: 'No Pump (Select pump)', basePrice: 0, addCost1: 0, addCost2: 0 },
      { name: 'Jandy 1.65HP Variable Pump', basePrice: 2310, addCost1: 0, addCost2: 0 },
      { name: 'Jandy 1.85HP Variable Pump', basePrice: 2540, addCost1: 0, addCost2: 0 },
      { name: 'Jandy 2.7HP Variable Pump', basePrice: 2174.15, addCost1: 0, addCost2: 0 },
      { name: 'Jandy 1.0HP Single Speed Pump', basePrice: 1900, addCost1: 0, addCost2: 0 },
      { name: 'Jandy 2.0HP Single Speed Pump', basePrice: 2060, addCost1: 0, addCost2: 0 },
    ],
    filters: [
      { name: 'No Filter (Select filter)', sqft: 0, basePrice: 0, addCost1: 0, addCost2: 0 },
      { name: '200 SQFT Cartridge Filter', sqft: 200, basePrice: 1103.57, addCost1: 0, addCost2: 0 },
      { name: '340 SQFT Cartridge Filter', sqft: 340, basePrice: 1618.57, addCost1: 0, addCost2: 0 },
      { name: '460 SQFT Cartridge Filter', sqft: 460, basePrice: 1174.20, addCost1: 0, addCost2: 0 },
      { name: '580 SQFT Cartridge Filter', sqft: 580, basePrice: 2133.57, addCost1: 0, addCost2: 0 },
      { name: '4.9 SQFT Sand Filter', sqft: 0, basePrice: 1115.2, addCost1: 0, addCost2: 0 },
      { name: '60 SQFT DE Filter', sqft: 60, basePrice: 1224.37, addCost1: 0, addCost2: 0 },
    ],
    cleaners: [
      { name: 'Polaris Epic IQ', basePrice: 1540, addCost1: 0, addCost2: 0 },
      { name: 'Polaris Alpha IQ', basePrice: 1397.13, addCost1: 0, addCost2: 0 },
      { name: 'Polaris 360 Standard', basePrice: 1618.57, addCost1: 0, addCost2: 0 },
      { name: 'Polaris 360 Black', basePrice: 1677.43, addCost1: 0, addCost2: 0 },
      { name: 'Polaris 280 w/ Booster', basePrice: 2133.57, addCost1: 0, addCost2: 0 },
      { name: 'No Cleaner', basePrice: 0, addCost1: 0, addCost2: 0 },
    ],
    heaters: [
      { name: 'No Heater (Select heater)', btu: 0, basePrice: 0, addCost1: 0, addCost2: 0, isVersaFlo: false },
      { name: 'Jandy 400K BTU - VersaFlo', btu: 400000, basePrice: 3297, addCost1: 0, addCost2: 0, isVersaFlo: true },
      { name: 'Jandy LXI 250K BTU', btu: 250000, basePrice: 1885, addCost1: 0, addCost2: 0, isVersaFlo: false },
      { name: 'Jandy JXI 400K - No Bypass', btu: 400000, basePrice: 2308, addCost1: 0, addCost2: 0, isVersaFlo: false },
      { name: 'Jandy JXI 400K - w/ Bypass', btu: 400000, basePrice: 2475, addCost1: 0, addCost2: 0, isVersaFlo: false },
      { name: 'Heat Pump', btu: 0, basePrice: 0, addCost1: 0, addCost2: 0, isVersaFlo: false },
    ],
    lights: {
      poolLights: [
        { name: '24W Nicheless LED (Included by default)', basePrice: 601, addCost1: 0, addCost2: 0 },
        { name: 'Low Voltage LED', basePrice: 650, addCost1: 0, addCost2: 0 },
      ],
      spaLights: [
        { name: 'Spa LED (Included by default)', basePrice: 528, addCost1: 0, addCost2: 0 },
        { name: 'Spa Color LED', basePrice: 650, addCost1: 0, addCost2: 0 },
      ],
    },
    automation: [
      // Automation prices include the 6614 base panel and any required install adders (matches EQUIP sheet rows 61-69)
      { name: 'No Automation', basePrice: 0, addCost1: 0, addCost2: 0 },
      { name: '6614 APL BASE PANEL', basePrice: 1600, addCost1: 0, addCost2: 0 },
      { name: 'Additional JVA', basePrice: 1800, addCost1: 0, addCost2: 0 }, // base panel + JVA
      { name: 'Jandy TCX Controler (1 JVA, Lights and Heater Control)', basePrice: 2250, addCost1: 0, addCost2: 0 }, // base + 650
      { name: 'iAqualink Only P-4 (H.O. To Provide WiFi)', basePrice: 2575, addCost1: 0, addCost2: 0 }, // base + 650 + install
      { name: 'iAqualink Only PS-4 (H.O. To Provide WiFi) Only use with Infinite Light System', basePrice: 3025, addCost1: 0, addCost2: 0 }, // base + 1100 + install
      { name: 'iAqualink Only PS-6 (H.O. To Provide WiFi)', basePrice: 3722, addCost1: 0, addCost2: 0 }, // base + 1797 + install
      { name: 'iAqualink Only PS-8 (H.O. To Provide WiFi)', basePrice: 4525, addCost1: 0, addCost2: 0 }, // base + 2600 + install
      { name: 'IQ Pump 01', basePrice: 1721, addCost1: 0, addCost2: 0 }, // base + 121
    ],
    automationZoneAddon: 365, // Per additional zone
    saltSystem: [
      { name: 'Jandy AquaPure 1400', model: 'AquaPure', basePrice: 0, addCost1: 0, addCost2: 0 },
      { name: 'Jandy Tru-Clear', model: 'TruClear', basePrice: 1150, addCost1: 0, addCost2: 0 },
      { name: 'Salt/mineral System - Fusion Soft', model: 'FusionSoft', basePrice: 1000, addCost1: 0, addCost2: 0 },
      { name: 'No Salt System', model: 'None', basePrice: 0, addCost1: 0, addCost2: 0 },
    ],
    autoFillSystem: [
      { name: 'No Auto-Fill System', basePrice: 0, addCost1: 0, addCost2: 0 },
      { name: 'Auto-Fill System', basePrice: 0, addCost1: 0, addCost2: 0 },
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
    finishes: [
      {
        id: 'ivory-quartz',
        name: 'Ivory Quartz',
        costPerSqft: 5.5,
        spaFinishCost: 850,
        colors: ['Bordeaux', 'Desert Gold', 'French Grey', 'Irish Mist', 'White Diamonds', 'HighTech Carribean Blue'],
      },
      {
        id: 'pebble-tec-l1',
        name: 'Pebble Tec - Level 1',
        costPerSqft: 6.3,
        spaFinishCost: 1150,
        colors: ['Bordeaux', 'Desert Gold', 'French Grey', 'Irish Mist', 'White Diamonds', 'HighTech Carribean Blue'],
      },
      {
        id: 'pebble-tec-l2',
        name: 'Pebble Tec - Level 2',
        costPerSqft: 7.9,
        spaFinishCost: 1150,
        colors: ['Bordeaux', 'Desert Gold', 'French Grey', 'Irish Mist', 'White Diamonds', 'HighTech Carribean Blue'],
      },
      {
        id: 'pebble-tec-l3',
        name: 'Pebble Tec - Level 3',
        costPerSqft: 8.85,
        spaFinishCost: 1150,
        colors: ['Bordeaux', 'Desert Gold', 'French Grey', 'Irish Mist', 'White Diamonds', 'HighTech Carribean Blue'],
      },
      {
        id: 'pebble-sheen-l1',
        name: 'Pebble Sheen - Level 1',
        costPerSqft: 6.75,
        spaFinishCost: 1250,
        colors: ['Bordeaux', 'Desert Gold', 'French Grey', 'Irish Mist', 'White Diamonds', 'HighTech Carribean Blue'],
      },
      {
        id: 'pebble-sheen-l2',
        name: 'Pebble Sheen - Level 2',
        costPerSqft: 7.85,
        spaFinishCost: 1250,
        colors: ['Bordeaux', 'Desert Gold', 'French Grey', 'Irish Mist', 'White Diamonds', 'HighTech Carribean Blue'],
      },
      {
        id: 'pebble-sheen-l3',
        name: 'Pebble Sheen - Level 3',
        costPerSqft: 9.25,
        spaFinishCost: 1250,
        colors: ['Bordeaux', 'Desert Gold', 'French Grey', 'Irish Mist', 'White Diamonds', 'HighTech Carribean Blue'],
      },
      {
        id: 'pebble-fina-l1',
        name: 'Pebble Fina - Level 1',
        costPerSqft: 7.75,
        spaFinishCost: 1050,
        colors: ['Bordeaux', 'Desert Gold', 'French Grey', 'Irish Mist', 'White Diamonds', 'HighTech Carribean Blue'],
      },
      {
        id: 'pebble-fina-l2',
        name: 'Pebble Fina - Level 2',
        costPerSqft: 10,
        spaFinishCost: 1675,
        colors: ['Bordeaux', 'Desert Gold', 'French Grey', 'Irish Mist', 'White Diamonds', 'HighTech Carribean Blue'],
      },
      {
        id: 'pebble-brilliance',
        name: 'Pebble Brilliance',
        costPerSqft: 17,
        spaFinishCost: 1050,
        colors: ['Bordeaux', 'Desert Gold', 'French Grey', 'Irish Mist', 'White Diamonds', 'HighTech Carribean Blue'],
      },
      {
        id: 'pebble-breeze',
        name: 'Pebble Breeze',
        costPerSqft: 23,
        spaFinishCost: 1150,
        colors: ['Bordeaux', 'Desert Gold', 'French Grey', 'Irish Mist', 'White Diamonds', 'HighTech Carribean Blue'],
      },
      {
        id: 'pebble-essence',
        name: 'Pebble Essence',
        costPerSqft: 17.5,
        spaFinishCost: 1150,
        colors: ['Bordeaux', 'Desert Gold', 'French Grey', 'Irish Mist', 'White Diamonds', 'HighTech Carribean Blue'],
      },
    ],
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
