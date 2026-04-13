CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    email TEXT NOT NULL,
    sport TEXT NOT NULL,
    rione TEXT NOT NULL,
    base_fee REAL NOT NULL,
    shirt_price REAL NOT NULL,
    total_fee REAL NOT NULL,
    player1_name TEXT NOT NULL,
    player1_cf TEXT NOT NULL,
    player1_phone TEXT NOT NULL,
    player1_belonging TEXT NOT NULL,
    player1_address TEXT NOT NULL,
    player1_shirt INTEGER NOT NULL DEFAULT 0,
    player1_shirt_size TEXT,
    player2_name TEXT,
    player2_cf TEXT,
    player2_phone TEXT,
    player2_belonging TEXT,
    player2_address TEXT,
    player2_shirt INTEGER NOT NULL DEFAULT 0,
    player2_shirt_size TEXT,
    confirm_fee INTEGER NOT NULL DEFAULT 1,
    confirm_rione_check INTEGER NOT NULL DEFAULT 1,
    confirm_approval INTEGER NOT NULL DEFAULT 1,
    privacy_ok INTEGER NOT NULL DEFAULT 1,
    images_ok INTEGER NOT NULL DEFAULT 1,
    liability_ok INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
