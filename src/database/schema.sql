-- Proposals table
CREATE TABLE IF NOT EXISTS proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposal_number TEXT UNIQUE NOT NULL,
    created_date TEXT NOT NULL,
    last_modified TEXT NOT NULL,
    status TEXT NOT NULL,
    data TEXT NOT NULL,
    subtotal REAL NOT NULL,
    tax_rate REAL NOT NULL,
    tax_amount REAL NOT NULL,
    total_cost REAL NOT NULL
);

-- Pool Models Reference Table
CREATE TABLE IF NOT EXISTS pool_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    model TEXT NOT NULL,
    length REAL NOT NULL,
    width REAL NOT NULL,
    depth REAL NOT NULL,
    base_price REAL NOT NULL
);

-- Excavation Rates
CREATE TABLE IF NOT EXISTS excavation_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    difficulty TEXT NOT NULL,
    price_per_cubic_yard REAL NOT NULL
);

-- Plumbing Rates
CREATE TABLE IF NOT EXISTS plumbing_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pipe_type TEXT NOT NULL,
    price_per_foot REAL NOT NULL
);

-- Tile Rates
CREATE TABLE IF NOT EXISTS tile_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    price_per_square_foot REAL NOT NULL
);

-- Coping Rates
CREATE TABLE IF NOT EXISTS coping_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    price_per_linear_foot REAL NOT NULL
);

-- Decking Rates
CREATE TABLE IF NOT EXISTS decking_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    price_per_square_foot REAL NOT NULL
);

-- Equipment Catalog
CREATE TABLE IF NOT EXISTS equipment_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    model TEXT NOT NULL,
    price REAL NOT NULL
);

-- Water Features Catalog
CREATE TABLE IF NOT EXISTS water_features_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL
);

-- Interior Finish Rates
CREATE TABLE IF NOT EXISTS finish_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    price_per_square_foot REAL NOT NULL
);

-- Drainage Rates
CREATE TABLE IF NOT EXISTS drainage_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drain_type TEXT NOT NULL,
    price_per_unit REAL NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_proposals_number ON proposals(proposal_number);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_pool_models_type ON pool_models(type);
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment_catalog(category);
