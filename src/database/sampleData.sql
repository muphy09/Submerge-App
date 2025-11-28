-- Default franchise seed to allow the app to start with a scoped pricing bucket
INSERT INTO franchises (id, name, franchise_code, is_active)
VALUES ('default', 'Default Franchise', 'DEFAULT-CODE', 1);

-- Starter franchises
INSERT OR IGNORE INTO franchises (id, name, franchise_code, is_active)
VALUES ('franchise-1111', 'Franchise 1111', '1111', 0);

INSERT OR IGNORE INTO franchises (id, name, franchise_code, is_active)
VALUES ('franchise-2222', 'Franchise 2222', '2222', 0);
