-- Sample Pool Models
INSERT INTO pool_models (type, model, length, width, depth, base_price) VALUES
('fiberglass', 'Small Fiberglass Caesar', 14, 7, 4.5, 25000),
('fiberglass', 'Medium Fiberglass Lagoon', 16, 10, 5, 32000),
('fiberglass', 'Large Fiberglass Paradise', 20, 12, 6, 45000),
('concrete', 'Custom Concrete Rectangle', 16, 8, 5, 35000),
('concrete', 'Custom Concrete Kidney', 18, 10, 5.5, 40000),
('concrete', 'Custom Concrete Freeform', 20, 14, 6, 55000),
('vinyl', 'Vinyl Rectangle Economy', 14, 8, 4, 18000),
('vinyl', 'Vinyl Oval Standard', 16, 10, 5, 22000);

-- Sample Excavation Rates
INSERT INTO excavation_rates (difficulty, price_per_cubic_yard) VALUES
('easy', 45),
('medium', 65),
('hard', 95);

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
('pump', 'Variable Speed Pump', 'Pentair SuperFlo VS', 1200),
('pump', 'Single Speed Pump', 'Hayward SP2610X15', 450),
('pump', 'Two Speed Pump', 'Pentair WhisperFlo', 650),
('filter', 'Sand Filter', 'Hayward Pro Series S244T', 550),
('filter', 'Cartridge Filter', 'Pentair Clean & Clear 420', 850),
('filter', 'DE Filter', 'Hayward Perflex EC65', 900),
('cleaner', 'Robotic Cleaner', 'Dolphin Nautilus CC Plus', 650),
('cleaner', 'Pressure Side Cleaner', 'Polaris 360', 400),
('cleaner', 'Suction Side Cleaner', 'Hayward AquaNaut', 350),
('heater', 'Gas Heater 250K BTU', 'Hayward H250FDN', 2200),
('heater', 'Gas Heater 400K BTU', 'Pentair MasterTemp 400', 3000),
('heater', 'Heat Pump', 'Hayward HeatPro HP21404T', 3500),
('heater', 'Solar Heater', 'Fafco Solar Bear', 1800),
('other', 'Salt System', 'Hayward AquaRite', 950),
('other', 'UV Sanitizer', 'SpectraLight', 1100),
('other', 'Automation System', 'Pentair ScreenLogic', 1800);

-- Sample Water Features Catalog
INSERT INTO water_features_catalog (type, name, price) VALUES
('deck-jet', 'LED Deck Jet', 450),
('deck-jet', 'Laminar Deck Jet', 650),
('bubbler', 'Rock Bubbler', 350),
('bubbler', 'LED Bubbler', 500),
('wok-pot', 'Copper Wok Pot', 1200),
('wok-pot', 'Stone Wok Pot', 1500),
('waterfall', 'Rock Waterfall Small', 2500),
('waterfall', 'Rock Waterfall Medium', 4500),
('waterfall', 'Rock Waterfall Large', 7500),
('waterfall', 'Sheer Descent', 1800),
('fountain', 'Deck Fountain', 800),
('fountain', 'Spray Fountain', 1200);

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
