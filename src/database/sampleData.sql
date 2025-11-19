-- Sample Pool Models
INSERT INTO pool_models (type, model, length, width, depth, base_price) VALUES
('Fiberglass', 'Small Fiberglass Caesar', 14, 7, 4.5, 25000),
('Fiberglass', 'Medium Fiberglass Lagoon', 16, 10, 5, 32000),
('Fiberglass', 'Large Fiberglass Paradise', 20, 12, 6, 45000),
('Concrete', 'Custom Concrete Rectangle', 16, 8, 5, 35000),
('Concrete', 'Custom Concrete Kidney', 18, 10, 5.5, 40000),
('Concrete', 'Custom Concrete Freeform', 20, 14, 6, 55000),
('Vinyl', 'Vinyl Rectangle Economy', 14, 8, 4, 18000),
('Vinyl', 'Vinyl Oval Standard', 16, 10, 5, 22000);

-- Sample Excavation Rates
INSERT INTO excavation_rates (difficulty, price_per_cubic_yard) VALUES
('Easy', 45),
('Medium', 65),
('Hard', 95);

-- Sample Plumbing Rates
INSERT INTO plumbing_rates (pipe_type, price_per_foot) VALUES
('PVC Schedule 40', 8),
('PVC Schedule 80', 12),
('Flexible PVC', 10),
('CPVC', 15);

-- Sample Tile Rates
INSERT INTO tile_rates (type, price_per_square_foot) VALUES
('Glass mosaic', 35),
('Ceramic', 15),
('Porcelain', 22),
('Natural stone', 45);

-- Sample Coping Rates
INSERT INTO coping_rates (type, price_per_linear_foot) VALUES
('Precast concrete', 25),
('Natural stone', 55),
('Brick', 35),
('Travertine', 65),
('Cantilever', 30);

-- Sample Decking Rates
INSERT INTO decking_rates (type, price_per_square_foot) VALUES
('Concrete - Brushed', 12),
('Concrete - Stamped', 18),
('Pavers', 25),
('Travertine', 35),
('Flagstone', 40),
('Wood', 22);

-- Sample Equipment Catalog
INSERT INTO equipment_catalog (category, name, model, price) VALUES
('Pump', 'Variable Speed Pump', 'Pentair SuperFlo VS', 1200),
('Pump', 'Single Speed Pump', 'Hayward SP2610X15', 450),
('Pump', 'Two Speed Pump', 'Pentair WhisperFlo', 650),
('Filter', 'Sand Filter', 'Hayward Pro Series S244T', 550),
('Filter', 'Cartridge Filter', 'Pentair Clean & Clear 420', 850),
('Filter', 'DE Filter', 'Hayward Perflex EC65', 900),
('Cleaner', 'Robotic Cleaner', 'Dolphin Nautilus CC Plus', 650),
('Cleaner', 'Pressure Side Cleaner', 'Polaris 360', 400),
('Cleaner', 'Suction Side Cleaner', 'Hayward AquaNaut', 350),
('Heater', 'Gas Heater 250K BTU', 'Hayward H250FDN', 2200),
('Heater', 'Gas Heater 400K BTU', 'Pentair MasterTemp 400', 3000),
('Heater', 'Heat Pump', 'Hayward HeatPro HP21404T', 3500),
('Heater', 'Solar Heater', 'Fafco Solar Bear', 1800),
('Other', 'Salt System', 'Hayward AquaRite', 950),
('Other', 'UV Sanitizer', 'SpectraLight', 1100),
('Other', 'Automation System', 'Pentair ScreenLogic', 1800);

-- Sample Water Features Catalog
INSERT INTO water_features_catalog (type, name, price) VALUES
('Deck Jet', 'LED Deck Jet', 450),
('Deck Jet', 'Laminar Deck Jet', 650),
('Bubbler', 'Rock Bubbler', 350),
('Bubbler', 'LED Bubbler', 500),
('Wok Pot', 'Copper Wok Pot', 1200),
('Wok Pot', 'Stone Wok Pot', 1500),
('Waterfall', 'Rock Waterfall Small', 2500),
('Waterfall', 'Rock Waterfall Medium', 4500),
('Waterfall', 'Rock Waterfall Large', 7500),
('Waterfall', 'Sheer Descent', 1800),
('Fountain', 'Deck Fountain', 800),
('Fountain', 'Spray Fountain', 1200);

-- Sample Interior Finish Rates
INSERT INTO finish_rates (type, price_per_square_foot) VALUES
('Plaster - White', 6),
('Plaster - Colored', 8),
('Pebble Tec', 12),
('Pebble Sheen', 14),
('Glass Bead', 16),
('Tile', 35),
('Vinyl Liner', 4);

-- Sample Drainage Rates
INSERT INTO drainage_rates (drain_type, price_per_unit) VALUES
('Main drain', 450),
('Deck drain', 200),
('Overflow drain', 300),
('French drain', 150);
