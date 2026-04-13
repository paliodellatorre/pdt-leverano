
CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    cognome TEXT,
    email TEXT,
    telefono TEXT,
    sport TEXT,
    rione TEXT,
    maglia BOOLEAN,
    taglia TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
