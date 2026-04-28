require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const fs = require('fs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const upload = multer({ storage: multer.memoryStorage() });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const RIONI = [
  'POZZOLUNGO SUD',
  'POZZOLUNGO NORD',
  'PATULA CUPA - QUARTARARU',
  'IANA',
  'CENTRO',
  'CHIANCA',
  'ZITA ROSA',
  'CONSOLAZIONE'
];

const RIONE_CRITERIA = [
  'Residenza',
  'Domicilio',
  'Legame familiare',
  'Altro criterio approvato'
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProd ? { rejectUnauthorized: false } : false
});

async function runSchema() {
  const schemaPath = path.join(__dirname, 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
  } else {
    console.warn('db/schema.sql non trovato, avvio senza esecuzione schema.');
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS site_media (id SERIAL PRIMARY KEY, key TEXT UNIQUE NOT NULL, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS news (id SERIAL PRIMARY KEY, titolo TEXT, image_url TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sponsors (id SERIAL PRIMARY KEY, nome TEXT, logo_url TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS regolamenti (id SERIAL PRIMARY KEY, titolo TEXT NOT NULL, file_url TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS site_settings (id SERIAL PRIMARY KEY, key TEXT UNIQUE NOT NULL, value TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kids_registrations (
      id SERIAL PRIMARY KEY,
      child_full_name TEXT NOT NULL,
      child_birth_date DATE NOT NULL,
      child_tax_code TEXT NOT NULL,
      parent_full_name TEXT NOT NULL,
      parent_tax_code TEXT NOT NULL,
      parent_email TEXT NOT NULL,
      parent_phone TEXT NOT NULL,
      privacy_consent TEXT NOT NULL,
      media_consent TEXT DEFAULT 'no',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`ALTER TABLE kids_registrations ADD COLUMN IF NOT EXISTS child_full_name TEXT`);
  await pool.query(`ALTER TABLE kids_registrations ADD COLUMN IF NOT EXISTS child_birth_date DATE`);
  await pool.query(`ALTER TABLE kids_registrations ADD COLUMN IF NOT EXISTS child_tax_code TEXT`);
  await pool.query(`ALTER TABLE kids_registrations ADD COLUMN IF NOT EXISTS parent_full_name TEXT`);
  await pool.query(`ALTER TABLE kids_registrations ADD COLUMN IF NOT EXISTS parent_tax_code TEXT`);
  await pool.query(`ALTER TABLE kids_registrations ADD COLUMN IF NOT EXISTS parent_email TEXT`);
  await pool.query(`ALTER TABLE kids_registrations ADD COLUMN IF NOT EXISTS parent_phone TEXT`);
  await pool.query(`ALTER TABLE kids_registrations ADD COLUMN IF NOT EXISTS privacy_consent TEXT`);
  await pool.query(`ALTER TABLE kids_registrations ADD COLUMN IF NOT EXISTS media_consent TEXT DEFAULT 'no'`);
  await pool.query(`ALTER TABLE kids_registrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);

  await pool.query(`DELETE FROM sports WHERE LOWER(name) = 'corsa'`);
  await pool.query(`CREATE TABLE IF NOT EXISTS pdt_jump_scores (
    id SERIAL PRIMARY KEY,
    nickname TEXT NOT NULL,
    rione TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    coins INTEGER NOT NULL DEFAULT 0,
    level_reached INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  // CANCELLAZIONE DIRETTA TIERRRENNE / TIERRRENNE / TIERRIENNE / TIERRRENNE
  // Cancella il nickname Tierrenne dalla classifica a ogni avvio deploy.
  await pool.query(`
    DELETE FROM pdt_jump_scores
    WHERE LOWER(TRIM(nickname)) = LOWER(TRIM('Tierrenne'))
  `);

  await pool.query(`ALTER TABLE pdt_jump_scores ADD COLUMN IF NOT EXISTS device_id TEXT`);

  await pool.query(`
    DELETE FROM pdt_jump_scores a
    USING pdt_jump_scores b
    WHERE LOWER(TRIM(a.nickname)) = LOWER(TRIM(b.nickname))
      AND LOWER(TRIM(a.rione)) = LOWER(TRIM(b.rione))
      AND (
        a.score < b.score
        OR (a.score = b.score AND a.coins < b.coins)
        OR (a.score = b.score AND a.coins = b.coins AND a.id > b.id)
      )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdt_jump_device
    ON pdt_jump_scores (device_id)
    WHERE device_id IS NOT NULL
  `);


  const cleanupKey = 'pdt_jump_cleanup_duplicates_20260428_3';
  const cleanupCheck = await pool.query('SELECT value FROM site_settings WHERE key = $1', [cleanupKey]);
  if (cleanupCheck.rows.length === 0) {
    await pool.query(`
      DELETE FROM pdt_jump_scores a
      USING pdt_jump_scores b
      WHERE LOWER(TRIM(a.nickname)) = LOWER(TRIM(b.nickname))
        AND LOWER(TRIM(a.rione)) = LOWER(TRIM(b.rione))
        AND (
          a.score < b.score
          OR (a.score = b.score AND a.coins < b.coins)
          OR (a.score = b.score AND a.coins = b.coins AND a.id > b.id)
        )
    `);
    await pool.query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ($1, 'done', NOW())
       ON CONFLICT (key) DO NOTHING`,
      [cleanupKey]
    );
  }

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_pdt_jump_nickname_rione
    ON pdt_jump_scores (LOWER(TRIM(nickname)), LOWER(TRIM(rione)))
  `);

  // Reset classifica PDT JUMP una sola volta per questa correzione.
  const resetKey = 'pdt_jump_reset_20260428_1';
  const resetCheck = await pool.query('SELECT value FROM site_settings WHERE key = $1', [resetKey]);
  if (resetCheck.rows.length === 0) {
    await pool.query('DELETE FROM pdt_jump_scores');
    await pool.query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ($1, 'done', NOW())
       ON CONFLICT (key) DO NOTHING`,
      [resetKey]
    );
  }

}

// Pulizia una tantum PDT JUMP: elimina doppioni per nickname e tiene il punteggio migliore.
async function cleanupPdtJumpNicknames() {
  try {
    await pool.query(`
      DELETE FROM pdt_jump_scores a
      USING pdt_jump_scores b
      WHERE LOWER(TRIM(a.nickname)) = LOWER(TRIM(b.nickname))
        AND (
          a.score < b.score
          OR (a.score = b.score AND a.coins < b.coins)
          OR (a.score = b.score AND a.coins = b.coins AND a.id > b.id)
        )
    `);
  } catch (e) {
    console.error('Errore pulizia PDT JUMP:', e.message);
  }
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new pgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'super-secret-change-me',
  resave: false,
  saveUninitialized: false,
  proxy: isProd,
  cookie: { maxAge: 1000 * 60 * 60 * 12, secure: isProd, sameSite: 'lax' }
}));

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.isAuthenticated = !!req.session.admin;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// Il regolamento non blocca più tutto il sito.
// Verrà mostrato solo quando si accede alla pagina Iscrizioni sport.

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function requireAuth(req, res, next) {
  if (!req.session.admin) {
    setFlash(req, 'error', 'Devi accedere come admin.');
    return res.redirect('/admin/login');
  }
  next();
}

async function getSettingsMap() {
  const { rows } = await pool.query('SELECT key, value FROM site_settings');
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

async function getMediaMap() {
  const { rows } = await pool.query('SELECT key, value FROM site_media');
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
}

function isPairSport(name) {
  const n = String(name || '').toLowerCase();
  return n.includes('coppia') || ['padel', 'burraco', 'scopa', 'biliardino'].some(k => n.includes(k));
}

function formatMaglia(value, size) {
  if (!value) return 'NO';
  const v = String(value).toLowerCase();
  if (v === 'true' || v === 'yes' || v === 'si' || v === 'sì') {
    return size ? `SI - ${size}` : 'SI';
  }
  return 'NO';
}

app.get('/ingresso', async (req, res, next) => {
  try {
    const settings = await getSettingsMap();
    res.render('ingresso', { title: 'Regolamento di accesso', settings });
  } catch (err) {
    next(err);
  }
});

app.post('/ingresso/continua', (req, res) => {
  if (req.body.regolamento_ok !== 'yes') {
    setFlash(req, 'error', 'Devi leggere il regolamento prima di proseguire.');
    return res.redirect('/ingresso');
  }

  // Dopo aver accettato il regolamento si va alle iscrizioni sport.
  return res.redirect('/iscrizioni?ok=1');
});

async function renderIscrizioniPage(req, res, statusCode = 200, formData = {}, errors = []) {
  const sports = await pool.query('SELECT * FROM sports WHERE is_open = true ORDER BY name');
  const settings = await getSettingsMap();
  const media = await getMediaMap();
  return res.status(statusCode).render('iscrizioni', {
    title: 'Iscrizioni',
    sports: sports.rows,
    settings,
    media,
    rioni: RIONI,
    rioneCriteria: RIONE_CRITERIA,
    formData,
    errors
  });
}

app.get('/', async (req, res, next) => {
  try {
    const sports = await pool.query('SELECT * FROM sports WHERE is_open = true ORDER BY name');
    const news = await pool.query('SELECT * FROM news ORDER BY created_at DESC, id DESC');
    const settings = await getSettingsMap();
    const media = await getMediaMap();
    res.render('home', {
      title: 'Il Palio della Torre',
      sports: sports.rows,
      news: news.rows,
      settings,
      media
    });
  } catch (err) {
    next(err);
  }
});

app.get('/iscrizioni', async (req, res, next) => {
  try {
    // Prima di compilare le iscrizioni sport, l'utente deve leggere il regolamento.
    // Questo controllo vale solo per le iscrizioni sport, non per KIDS e non per il resto del sito.
    if (req.query.ok !== '1') {
      return res.redirect('/ingresso');
    }

    return renderIscrizioniPage(req, res);
  } catch (err) {
    next(err);
  }
});

app.get('/kids', async (req, res, next) => {
  try {
    const media = await getMediaMap();

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM kids_registrations'
    );

    const kidsCount = countResult.rows[0]?.total || 0;
    const kidsLimit = 20;

    res.render('kids', {
      title: 'Kids - Summer Palio',
      media,
      formData: {},
      errors: [],
      kidsFull: kidsCount >= kidsLimit,
      kidsCount,
      kidsLimit
    });
  } catch (err) {
    next(err);
  }
});

app.post('/kids', async (req, res, next) => {
  try {
    const {
      child_full_name,
      child_birth_date,
      child_tax_code,
      parent_full_name,
      parent_tax_code,
      parent_email,
      parent_phone,
      privacy_consent,
      media_consent
    } = req.body;

    const errors = [];
    if (!child_full_name?.trim()) errors.push('Inserisci nome e cognome del bambino.');
    if (!child_birth_date) errors.push('Inserisci la data di nascita del bambino.');
    if (!child_tax_code?.trim()) errors.push('Inserisci il codice fiscale del bambino.');
    if (!parent_full_name?.trim()) errors.push('Inserisci nome e cognome del genitore/tutore.');
    if (!parent_tax_code?.trim()) errors.push('Inserisci il codice fiscale del genitore/tutore.');
    if (!parent_email?.trim()) errors.push('Inserisci la mail del genitore/tutore.');
    if (!parent_phone?.trim()) errors.push('Inserisci il numero cellulare del genitore/tutore.');
    if (privacy_consent !== 'yes') errors.push('Devi accettare il trattamento dei dati personali.');

    if (errors.length) {
      const media = await getMediaMap();
      const countResult = await pool.query(
        'SELECT COUNT(*)::int AS total FROM kids_registrations'
      );
      const kidsCount = countResult.rows[0]?.total || 0;
      const kidsLimit = 20;

      return res.status(400).render('kids', {
        title: 'Kids - Summer Palio',
        media,
        formData: req.body,
        errors,
        kidsFull: kidsCount >= kidsLimit,
        kidsCount,
        kidsLimit
      });
    }

    const countResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM kids_registrations'
    );

    const kidsCount = countResult.rows[0]?.total || 0;
    const kidsLimit = 20;

    if (kidsCount >= kidsLimit) {
      const media = await getMediaMap();

      return res.status(400).render('kids', {
        title: 'Kids - Summer Palio',
        media,
        formData: req.body,
        errors: ['Le iscrizioni Kids sono chiuse: è stato raggiunto il numero massimo di 20 bambini.'],
        kidsFull: true,
        kidsCount,
        kidsLimit
      });
    }

    await pool.query(
      `INSERT INTO kids_registrations (
        child_full_name, child_birth_date, child_tax_code,
        parent_full_name, parent_tax_code, parent_email, parent_phone,
        privacy_consent, media_consent
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        child_full_name.trim(),
        child_birth_date,
        child_tax_code.trim(),
        parent_full_name.trim(),
        parent_tax_code.trim(),
        parent_email.trim(),
        parent_phone.trim(),
        privacy_consent,
        media_consent === 'yes' ? 'yes' : 'no'
      ]
    );

    setFlash(req, 'success', 'Iscrizione Kids inviata correttamente.');
    res.redirect('/kids?ok=1');
  } catch (err) {
    next(err);
  }
});

app.get('/regolamenti', async (req, res, next) => {
  try {
    const regulations = await pool.query('SELECT * FROM regolamenti ORDER BY id DESC');
    const media = await getMediaMap();
    res.render('regolamenti', { title: 'Regolamenti', regulations: regulations.rows, media });
  } catch (err) {
    next(err);
  }
});

app.get('/novita', async (req, res, next) => {
  try {
    const news = await pool.query('SELECT * FROM news ORDER BY created_at DESC, id DESC');
    const media = await getMediaMap();
    res.render('novita', { title: 'Novità', news: news.rows, media });
  } catch (err) {
    next(err);
  }
});

app.get('/chi-siamo', async (req, res, next) => {
  try {
    const media = await getMediaMap();
    res.render('chi-siamo', { title: 'Chi siamo', media });
  } catch (err) {
    next(err);
  }
});

app.get('/contatti', async (req, res, next) => {
  try {
    const settings = await getSettingsMap();
    const media = await getMediaMap();
    res.render('contatti', { title: 'Contatti', settings, media });
  } catch (err) {
    next(err);
  }
});

app.get('/sponsor', async (req, res, next) => {
  try {
    const sponsors = await pool.query('SELECT * FROM sponsors ORDER BY id DESC');
    const media = await getMediaMap();
    res.render('sponsor', { title: 'Sponsor', sponsors: sponsors.rows, media });
  } catch (err) {
    next(err);
  }
});

app.post('/iscrizioni', async (req, res, next) => {
  try {
    const {
      email, rione, sport_id, notes,
      player1_full_name, player1_birth_date, player1_tax_code, player1_phone, player1_rione_criteria, player1_rione_address, player1_shirt, player1_shirt_size,
      player2_full_name, player2_birth_date, player2_tax_code, player2_phone, player2_rione_criteria, player2_rione_address, player2_shirt, player2_shirt_size,
      fee_confirmation, terms_rione_check, terms_organizer_confirmation, terms_privacy, terms_images, terms_liability
    } = req.body;

    const errors = [];
    const settings = await getSettingsMap();
    const sports = await pool.query('SELECT * FROM sports WHERE is_open = true ORDER BY name');
    const selectedSport = sports.rows.find(s => String(s.id) === String(sport_id));
    const isPair = isPairSport(selectedSport?.name);

    if (settings.registrations_open !== 'true') errors.push('Le iscrizioni sono momentaneamente chiuse.');
    if (!email?.trim()) errors.push("Inserisci l'email.");
    if (!rione?.trim()) errors.push('Inserisci il rione.');
    if (!sport_id) errors.push('Seleziona uno sport.');
    if (!fee_confirmation || fee_confirmation !== 'yes') errors.push('Devi confermare la quota.');
    if (!selectedSport) errors.push('Lo sport selezionato non è disponibile.');

    if (!player1_full_name?.trim()) errors.push('Inserisci nome e cognome del 1° giocatore.');
    if (!player1_birth_date) errors.push('Inserisci la data di nascita del 1° giocatore.');
    if (!player1_tax_code?.trim()) errors.push('Inserisci il codice fiscale del 1° giocatore.');
    if (!player1_phone?.trim()) errors.push('Inserisci il numero di telefono del 1° giocatore.');
    if (!player1_rione_criteria?.trim()) errors.push('Seleziona il criterio di appartenenza del 1° giocatore.');
    if (!player1_rione_address?.trim()) errors.push("Inserisci l'indirizzo di appartenenza del 1° giocatore.");
    if (!player1_shirt) errors.push('Seleziona se il 1° giocatore vuole la maglia.');
    if (player1_shirt === 'yes' && !player1_shirt_size) errors.push('Seleziona la taglia maglia del 1° giocatore.');

    if (isPair) {
      if (!player2_full_name?.trim()) errors.push('Inserisci nome e cognome del 2° giocatore.');
      if (!player2_birth_date) errors.push('Inserisci la data di nascita del 2° giocatore.');
      if (!player2_tax_code?.trim()) errors.push('Inserisci il codice fiscale del 2° giocatore.');
      if (!player2_phone?.trim()) errors.push('Inserisci il numero di telefono del 2° giocatore.');
      if (!player2_rione_criteria?.trim()) errors.push('Seleziona il criterio di appartenenza del 2° giocatore.');
      if (!player2_rione_address?.trim()) errors.push("Inserisci l'indirizzo di appartenenza del 2° giocatore.");
      if (!player2_shirt) errors.push('Seleziona se il 2° giocatore vuole la maglia.');
      if (player2_shirt === 'yes' && !player2_shirt_size) errors.push('Seleziona la taglia maglia del 2° giocatore.');
    }

    if (terms_rione_check !== 'yes') errors.push('Devi accettare il controllo appartenenza al rione.');
    if (terms_organizer_confirmation !== 'yes') errors.push("Devi accettare la conferma dell'iscrizione dagli organizzatori.");
    if (terms_privacy !== 'yes') errors.push('Devi accettare il trattamento dei dati personali.');
    if (terms_images !== 'yes') errors.push('Devi accettare la pubblicazione delle immagini.');
    if (terms_liability !== 'yes') errors.push('Devi accettare la clausola di responsabilità.');

    if (errors.length) {
      return renderIscrizioniPage(req, res, 400, req.body, errors);
    }

    await pool.query(
      `INSERT INTO registrations (
        full_name, birth_date, phone, email, rione, sport_id, notes,
        player1_full_name, player1_birth_date, player1_tax_code, player1_phone, player1_rione_criteria, player1_rione_address, player1_shirt, player1_shirt_size,
        player2_full_name, player2_birth_date, player2_tax_code, player2_phone, player2_rione_criteria, player2_rione_address, player2_shirt, player2_shirt_size,
        fee_confirmation, terms_rione_check, terms_organizer_confirmation, terms_privacy, terms_images, terms_liability
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,$21,$22,$23,
        $24,$25,$26,$27,$28,$29
      )`,
      [
        player1_full_name.trim(), player1_birth_date || null, player1_phone.trim(), email.trim(), rione.trim(), sport_id, notes?.trim() || null,
        player1_full_name.trim(), player1_birth_date || null, player1_tax_code.trim(), player1_phone.trim(), player1_rione_criteria, player1_rione_address.trim(), player1_shirt, player1_shirt === 'yes' ? player1_shirt_size : null,
        isPair ? player2_full_name.trim() : null, isPair ? (player2_birth_date || null) : null, isPair ? player2_tax_code.trim() : null, isPair ? player2_phone.trim() : null, isPair ? player2_rione_criteria : null, isPair ? player2_rione_address.trim() : null, isPair ? player2_shirt : null, isPair && player2_shirt === 'yes' ? player2_shirt_size : null,
        fee_confirmation, terms_rione_check, terms_organizer_confirmation, terms_privacy, terms_images, terms_liability
      ]
    );

    setFlash(req, 'success', 'Iscrizione inviata correttamente.');
    res.redirect('/iscrizioni?ok=1');
  } catch (err) {
    next(err);
  }
});

app.get('/admin/login', (req, res) => {
  res.render('admin-login', { title: 'Login Admin' });
});

app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const usernameOk = username === adminUsername;
  const passwordOk = password === adminPassword || (adminPassword.startsWith('$2') && await bcrypt.compare(password, adminPassword));
  if (!usernameOk || !passwordOk) {
    setFlash(req, 'error', 'Credenziali non valide.');
    return res.redirect('/admin/login');
  }
  req.session.admin = { username };
  setFlash(req, 'success', 'Accesso effettuato con successo.');
  res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

async function renderAdmin(req, res, next, editItem = null, editKidItem = null) {
  try {
    const registrations = await pool.query(`
      SELECT r.*, s.name AS sport_name, s.price AS sport_price
      FROM registrations r
      JOIN sports s ON s.id = r.sport_id
      WHERE LOWER(s.name) <> 'corsa'
      ORDER BY r.created_at DESC
    `);
    const kidsRegistrations = await pool.query('SELECT * FROM kids_registrations ORDER BY created_at DESC');
    const sports = await pool.query("SELECT * FROM sports WHERE LOWER(name) <> 'corsa' ORDER BY name");
    const sponsors = await pool.query('SELECT * FROM sponsors ORDER BY id DESC');
    const regulations = await pool.query('SELECT * FROM regolamenti ORDER BY id DESC');
    const news = await pool.query('SELECT * FROM news ORDER BY created_at DESC, id DESC');
    const settings = await getSettingsMap();
    const media = await getMediaMap();
    res.render('admin-dashboard', {
      title: 'Pannello Admin', registrations: registrations.rows, kidsRegistrations: kidsRegistrations.rows, sports: sports.rows,
      sponsors: sponsors.rows, regulations: regulations.rows, news: news.rows,
      media, settings, editItem, editKidItem
    });
  } catch (err) {
    next(err);
  }
}

app.get('/admin', requireAuth, (req, res, next) => renderAdmin(req, res, next));

app.get('/admin/registrations/:id/edit', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM registrations WHERE id = $1', [req.params.id]);
    if (!rows[0]) {
      setFlash(req, 'error', 'Iscrizione non trovata.');
      return res.redirect('/admin');
    }
    return renderAdmin(req, res, next, rows[0]);
  } catch (err) {
    next(err);
  }
});

app.post('/admin/registrations/:id/update', requireAuth, async (req, res, next) => {
  try {
    const { full_name, birth_date, phone, email, rione, sport_id, notes } = req.body;
    await pool.query(
      `UPDATE registrations SET full_name=$1, birth_date=$2, phone=$3, email=$4, rione=$5, sport_id=$6, notes=$7, updated_at=NOW() WHERE id=$8`,
      [full_name, birth_date || null, phone, email, rione, sport_id, notes || null, req.params.id]
    );
    setFlash(req, 'success', 'Iscrizione aggiornata con successo.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/registrations/:id/delete', requireAuth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM registrations WHERE id = $1', [req.params.id]);
    setFlash(req, 'success', 'Iscrizione eliminata.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.get('/admin/kids/:id/edit', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM kids_registrations WHERE id = $1', [req.params.id]);
    if (!rows[0]) {
      setFlash(req, 'error', 'Iscrizione Kids non trovata.');
      return res.redirect('/admin');
    }
    return renderAdmin(req, res, next, null, rows[0]);
  } catch (err) {
    next(err);
  }
});

app.post('/admin/kids/:id/update', requireAuth, async (req, res, next) => {
  try {
    const {
      child_full_name,
      child_birth_date,
      child_tax_code,
      parent_full_name,
      parent_tax_code,
      parent_email,
      parent_phone,
      privacy_consent,
      media_consent
    } = req.body;

    await pool.query(
      `UPDATE kids_registrations SET
        child_full_name=$1,
        child_birth_date=$2,
        child_tax_code=$3,
        parent_full_name=$4,
        parent_tax_code=$5,
        parent_email=$6,
        parent_phone=$7,
        privacy_consent=$8,
        media_consent=$9,
        updated_at=NOW()
      WHERE id=$10`,
      [
        child_full_name,
        child_birth_date || null,
        child_tax_code,
        parent_full_name,
        parent_tax_code,
        parent_email,
        parent_phone,
        privacy_consent === 'yes' ? 'yes' : 'no',
        media_consent === 'yes' ? 'yes' : 'no',
        req.params.id
      ]
    );

    setFlash(req, 'success', 'Iscrizione Kids aggiornata.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/kids/:id/delete', requireAuth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM kids_registrations WHERE id = $1', [req.params.id]);
    setFlash(req, 'success', 'Iscrizione Kids eliminata.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/sports/create', requireAuth, async (req, res, next) => {
  try {
    if (!req.body.name?.trim()) {
      setFlash(req, 'error', 'Inserisci il nome dello sport.');
      return res.redirect('/admin');
    }
    await pool.query('INSERT INTO sports (name, price, is_open) VALUES ($1,$2,true)', [req.body.name.trim(), Number(req.body.price || 0)]);
    setFlash(req, 'success', 'Sport aggiunto correttamente.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/sports/:id/update', requireAuth, async (req, res, next) => {
  try {
    await pool.query('UPDATE sports SET name=$1, price=$2, is_open=$3, updated_at=NOW() WHERE id=$4', [req.body.name.trim(), Number(req.body.price || 0), req.body.is_open === 'on', req.params.id]);
    setFlash(req, 'success', 'Sport aggiornato.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/settings/update', requireAuth, async (req, res, next) => {
  try {
    const payload = {
      registrations_open: req.body.registrations_open === 'true' ? 'true' : 'false',
      contact_email: req.body.contact_email || '',
      contact_facebook: req.body.contact_facebook || '',
      contact_instagram: req.body.contact_instagram || '',
      site_regolamento_accesso: req.body.site_regolamento_accesso || ''
    };
    for (const [key, value] of Object.entries(payload)) {
      await pool.query(
        `INSERT INTO site_settings (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
      );
    }
    setFlash(req, 'success', 'Impostazioni aggiornate.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/sponsors/create', requireAuth, upload.single('logo'), async (req, res, next) => {
  try {
    if (!req.file) {
      setFlash(req, 'error', 'Seleziona un logo sponsor.');
      return res.redirect('/admin');
    }
    const result = await uploadToCloudinary(req.file.buffer, { folder: 'palio/sponsors', resource_type: 'image', allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'svg'] });
    await pool.query('INSERT INTO sponsors (nome, logo_url) VALUES ($1, $2)', [req.body.nome || '', result.secure_url]);
    setFlash(req, 'success', 'Sponsor caricato con successo.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/sponsors/:id/delete', requireAuth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM sponsors WHERE id = $1', [req.params.id]);
    setFlash(req, 'success', 'Sponsor eliminato.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ use_filename: true, unique_filename: true, ...options }, (error, uploaded) => {
      if (error) return reject(error);
      resolve(uploaded);
    });
    stream.end(buffer);
  });
}

app.post('/admin/regolamenti/create', requireAuth, upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) {
      setFlash(req, 'error', 'Seleziona un file PDF.');
      return res.redirect('/admin');
    }
    const titolo = (req.body.titolo || 'Regolamento').trim();
    const safeTitle = titolo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const result = await uploadToCloudinary(req.file.buffer, { folder: 'palio/regolamenti', resource_type: 'raw', public_id: `${safeTitle}-${Date.now()}`, format: 'pdf' });
    await pool.query('INSERT INTO regolamenti (titolo, file_url) VALUES ($1, $2)', [titolo, result.secure_url]);
    setFlash(req, 'success', 'Regolamento caricato con successo.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/regolamenti/:id/delete', requireAuth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM regolamenti WHERE id = $1', [req.params.id]);
    setFlash(req, 'success', 'Regolamento eliminato.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/news/create', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      setFlash(req, 'error', 'Seleziona una locandina.');
      return res.redirect('/admin');
    }
    const result = await uploadToCloudinary(req.file.buffer, { folder: 'palio/news', resource_type: 'image', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] });
    await pool.query('INSERT INTO news (titolo, image_url) VALUES ($1, $2)', [req.body.titolo || '', result.secure_url]);
    setFlash(req, 'success', 'Locandina caricata con successo.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/news/:id/delete', requireAuth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM news WHERE id = $1', [req.params.id]);
    setFlash(req, 'success', 'Locandina eliminata.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/media/video', requireAuth, upload.single('video'), async (req, res, next) => {
  try {
    if (!req.file) {
      setFlash(req, 'error', 'Seleziona un video.');
      return res.redirect('/admin');
    }
    const result = await uploadToCloudinary(req.file.buffer, { folder: 'palio/video', resource_type: 'video' });
    await pool.query(`INSERT INTO site_media (key, value, updated_at) VALUES ('homepage_video_url', $1, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [result.secure_url]);
    setFlash(req, 'success', 'Video caricato con successo.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.post('/admin/media/video/delete', requireAuth, async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM site_media WHERE key = 'homepage_video_url'`);
    setFlash(req, 'success', 'Video pubblicitario eliminato.');
    res.redirect('/admin');
  } catch (err) {
    next(err);
  }
});

app.get('/admin/export/excel', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, s.name AS sport, s.price
      FROM registrations r
      JOIN sports s ON s.id = r.sport_id
      ORDER BY s.name ASC, r.created_at DESC
    `);
    const workbook = new ExcelJS.Workbook();
    const grouped = {};
    rows.forEach(row => {
      if (!grouped[row.sport]) grouped[row.sport] = [];
      grouped[row.sport].push({
        nome_cognome: row.player1_full_name || row.full_name || '',
        data_nascita: row.player1_birth_date ? new Date(row.player1_birth_date).toLocaleDateString('it-IT') : (row.birth_date ? new Date(row.birth_date).toLocaleDateString('it-IT') : ''),
        cf: row.player1_tax_code || '', telefono: row.player1_phone || row.phone || '', email: row.email || '', maglietta: formatMaglia(row.player1_shirt, row.player1_shirt_size),
        rione: row.rione || '', sport: row.sport || '', prezzo: row.price != null ? Number(row.price).toFixed(2) : '', criterio_rione: row.player1_rione_criteria || '', indirizzo_rione: row.player1_rione_address || '',
        conferma_quota: row.fee_confirmation || '', controllo_rione: row.terms_rione_check || '', conferma_organizzatori: row.terms_organizer_confirmation || '', privacy: row.terms_privacy || '', immagini: row.terms_images || '', responsabilita: row.terms_liability || '', note: row.notes || '', creato_il: row.created_at ? new Date(row.created_at).toLocaleString('it-IT') : ''
      });
      if (row.player2_full_name) {
        grouped[row.sport].push({
          nome_cognome: row.player2_full_name || '',
          data_nascita: row.player2_birth_date ? new Date(row.player2_birth_date).toLocaleDateString('it-IT') : '',
          cf: row.player2_tax_code || '', telefono: row.player2_phone || '', email: row.email || '', maglietta: formatMaglia(row.player2_shirt, row.player2_shirt_size),
          rione: row.rione || '', sport: row.sport || '', prezzo: row.price != null ? Number(row.price).toFixed(2) : '', criterio_rione: row.player2_rione_criteria || '', indirizzo_rione: row.player2_rione_address || '',
          conferma_quota: row.fee_confirmation || '', controllo_rione: row.terms_rione_check || '', conferma_organizzatori: row.terms_organizer_confirmation || '', privacy: row.terms_privacy || '', immagini: row.terms_images || '', responsabilita: row.terms_liability || '', note: row.notes || '', creato_il: row.created_at ? new Date(row.created_at).toLocaleString('it-IT') : ''
        });
      }
    });
    Object.keys(grouped).forEach(sportName => {
      const sheet = workbook.addWorksheet(String(sportName).substring(0, 31));
      sheet.columns = [
        { header: 'NOME COGNOME', key: 'nome_cognome', width: 28 }, { header: 'DATA DI NASCITA', key: 'data_nascita', width: 18 }, { header: 'CF', key: 'cf', width: 22 }, { header: 'NUMERO TELEFONO', key: 'telefono', width: 18 }, { header: 'EMAIL', key: 'email', width: 28 }, { header: 'MAGLIETTA', key: 'maglietta', width: 16 }, { header: 'RIONE', key: 'rione', width: 20 }, { header: 'SPORT', key: 'sport', width: 24 }, { header: 'PREZZO', key: 'prezzo', width: 12 }, { header: 'CRITERIO RIONE', key: 'criterio_rione', width: 22 }, { header: 'INDIRIZZO RIONE', key: 'indirizzo_rione', width: 28 }, { header: 'CONFERMA QUOTA', key: 'conferma_quota', width: 18 }, { header: 'CONTROLLO RIONE', key: 'controllo_rione', width: 18 }, { header: 'CONFERMA ORGANIZZATORI', key: 'conferma_organizzatori', width: 24 }, { header: 'PRIVACY', key: 'privacy', width: 12 }, { header: 'IMMAGINI', key: 'immagini', width: 12 }, { header: 'RESPONSABILITÀ', key: 'responsabilita', width: 16 }, { header: 'NOTE', key: 'note', width: 30 }, { header: 'CREATO IL', key: 'creato_il', width: 22 }
      ];
      grouped[sportName].forEach(item => sheet.addRow(item));
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });
    if (!Object.keys(grouped).length) {
      const sheet = workbook.addWorksheet('Iscrizioni');
      sheet.columns = [{ header: 'Messaggio', key: 'msg', width: 30 }];
      sheet.addRow({ msg: 'Nessuna iscrizione presente' });
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="iscrizioni-palio-divise-per-sport.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});


app.get('/admin/export/kids', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM kids_registrations ORDER BY child_full_name ASC');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Iscrizioni Kids');

    sheet.columns = [
      { header: 'NOME COGNOME BAMBINO', key: 'child_full_name', width: 30 },
      { header: 'DATA NASCITA BAMBINO', key: 'child_birth_date', width: 20 },
      { header: 'CF BAMBINO', key: 'child_tax_code', width: 22 },
      { header: 'NOME COGNOME GENITORE', key: 'parent_full_name', width: 30 },
      { header: 'CF GENITORE', key: 'parent_tax_code', width: 22 },
      { header: 'EMAIL GENITORE', key: 'parent_email', width: 30 },
      { header: 'CELLULARE GENITORE', key: 'parent_phone', width: 22 },
      { header: 'CONSENSO PRIVACY', key: 'privacy_consent', width: 18 },
      { header: 'CONSENSO FOTO VIDEO', key: 'media_consent', width: 22 }
    ];

    rows.forEach(row => {
      sheet.addRow({
        child_full_name: row.child_full_name || '',
        child_birth_date: row.child_birth_date ? new Date(row.child_birth_date).toLocaleDateString('it-IT') : '',
        child_tax_code: row.child_tax_code || '',
        parent_full_name: row.parent_full_name || '',
        parent_tax_code: row.parent_tax_code || '',
        parent_email: row.parent_email || '',
        parent_phone: row.parent_phone || '',
        privacy_consent: row.privacy_consent === 'yes' ? 'SI' : 'NO',
        media_consent: row.media_consent === 'yes' ? 'SI' : 'NO'
      });
    });

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="iscrizioni-kids-summer-palio.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});


/* PDT JUMP - GIOCO */
app.get('/gioco', async (req, res, next) => {
  try {
    const media = await getMediaMap();
    const leaderboard = await pool.query(`
      SELECT nickname, rione, score, coins, level_reached
      FROM pdt_jump_scores
      ORDER BY score DESC, coins DESC, created_at ASC
      LIMIT 10
    `);

    res.render('gioco', {
      title: 'PDT JUMP',
      media,
      leaderboard: leaderboard.rows
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/pdt-jump/leaderboard', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT nickname, rione, score, coins, level_reached
      FROM pdt_jump_scores
      ORDER BY score DESC, coins DESC, created_at ASC
      LIMIT 10
    `);

    res.json({ ok: true, leaderboard: rows });
  } catch (err) {
    next(err);
  }
});

app.post('/api/pdt-jump/score', async (req, res, next) => {
  try {
    const nickname = String(req.body.nickname || '').trim().substring(0, 24);
    const rione = String(req.body.rione || '').trim().substring(0, 60);
    const deviceId = String(req.body.device_id || '').trim().substring(0, 80);
    const score = Math.max(0, Math.min(Number.parseInt(req.body.score, 10) || 0, 999999));
    const coins = Math.max(0, Math.min(Number.parseInt(req.body.coins, 10) || 0, 9999));
    const levelReached = Math.max(1, Math.min(Number.parseInt(req.body.level_reached, 10) || 1, 8));

    if (!nickname || !rione) {
      return res.status(400).json({ ok: false, error: 'Nickname e rione obbligatori.' });
    }

    /*
      FIX DEFINITIVO:
      Ogni nickname compare UNA SOLA VOLTA.
      Se il nuovo punteggio è migliore, aggiorna quel nickname.
      Se è peggiore, lascia il record migliore già presente.
    */

    const existing = await pool.query(
      `SELECT id, nickname, rione, device_id, score, coins, level_reached
       FROM pdt_jump_scores
       WHERE LOWER(TRIM(nickname)) = LOWER(TRIM($1))
       ORDER BY score DESC, coins DESC, id ASC`,
      [nickname]
    );

    if (existing.rows.length) {
      const best = existing.rows[0];

      if (score > Number(best.score || 0)) {
        await pool.query(
          `UPDATE pdt_jump_scores
           SET rione = $1,
               device_id = NULLIF($2, ''),
               score = $3,
               coins = $4,
               level_reached = $5,
               created_at = NOW()
           WHERE id = $6`,
          [rione, deviceId, score, coins, levelReached, best.id]
        );
      } else if (score === Number(best.score || 0) && coins > Number(best.coins || 0)) {
        await pool.query(
          `UPDATE pdt_jump_scores
           SET rione = $1,
               device_id = COALESCE(device_id, NULLIF($2, '')),
               coins = $3,
               level_reached = GREATEST(level_reached, $4)
           WHERE id = $5`,
          [rione, deviceId, coins, levelReached, best.id]
        );
      } else if (deviceId && !best.device_id) {
        await pool.query(
          `UPDATE pdt_jump_scores
           SET device_id = $1
           WHERE id = $2`,
          [deviceId, best.id]
        );
      }

      // Cancella eventuali altri record dello stesso nickname.
      await pool.query(
        `DELETE FROM pdt_jump_scores
         WHERE LOWER(TRIM(nickname)) = LOWER(TRIM($1))
           AND id <> $2`,
        [nickname, best.id]
      );
    } else {
      await pool.query(
        `INSERT INTO pdt_jump_scores (nickname, rione, device_id, score, coins, level_reached, created_at)
         VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, NOW())`,
        [nickname, rione, deviceId, score, coins, levelReached]
      );
    }

    // Pulizia generale: un solo record per nickname, tiene il migliore.
    await pool.query(`
      DELETE FROM pdt_jump_scores a
      USING pdt_jump_scores b
      WHERE LOWER(TRIM(a.nickname)) = LOWER(TRIM(b.nickname))
        AND (
          a.score < b.score
          OR (a.score = b.score AND a.coins < b.coins)
          OR (a.score = b.score AND a.coins = b.coins AND a.id > b.id)
        )
    `);

    const { rows } = await pool.query(`
      SELECT nickname, rione, score, coins, level_reached
      FROM pdt_jump_scores
      ORDER BY score DESC, coins DESC, created_at ASC
      LIMIT 10
    `);

    res.json({
      ok: true,
      saved_score: score,
      leaderboard: rows
    });
  } catch (err) {
    console.error('ERRORE SALVATAGGIO PDT JUMP:', err);
    next(err);
  }
});


app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Errore interno del server. Controlla la configurazione del database e delle variabili ambiente.');
});

runSchema()
  .then(() => app.listen(PORT, () => console.log(`Server avviato su http://localhost:${PORT}`)))
  .catch(err => {
    console.error('Errore avvio applicazione:', err);
    process.exit(1);
  });
