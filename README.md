# Torneo dei Rioni - Web App

Web app Flask con grafica scura per raccogliere iscrizioni da smartphone senza credenziali e con pannello admin separato per vedere le iscrizioni ed esportarle in Excel.

## Funzioni incluse

- accesso pubblico senza login per i partecipanti
- grafica responsive con sfondo nero
- 11 sport già configurati con i prezzi indicati
- gestione sport di coppia: Padel, Burraco, Biliardino, Scopa
- scelta rione
- raccolta email, codice fiscale, telefono, indirizzo e criterio di appartenenza
- maglia del rione facoltativa a € 5 per ogni giocatore
- conferme obbligatorie su quota, privacy, immagini e responsabilità
- pannello admin con filtro per sport
- esportazione Excel con un foglio riepilogo + un foglio per ogni sport

## Sport configurati

- Calcio — €10
- Padel — €40 a coppia
- Burraco — €5
- Tiro con l'arco — €10
- Biliardino — €20 a coppia
- Scopa — €5
- Volley — €10
- Scacchi — €10
- 1vs1 — €5
- Tennis — €10
- Ludopoli — €5

## Credenziali admin predefinite

- username: `admin`
- password: `admin123`

Puoi cambiarle con variabili ambiente:

- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SECRET_KEY`

## Avvio in locale

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Poi apri:

- modulo pubblico: `http://127.0.0.1:5000/`
- admin: `http://127.0.0.1:5000/admin/login`

## Deploy consigliato

Per farla usare dal telefono a tutti, va pubblicata online su un hosting tipo:

- Render
- Railway
- PythonAnywhere
- VPS con Nginx + Gunicorn

## Note

- Il database è SQLite (`database.db`)
- Alla prima esecuzione viene creato automaticamente
- L'export Excel è disponibile dal pannello admin


## Aggiornamento v3
- Taglia maglietta per 1° e 2° giocatore
- Conteggio magliette rione per rione nel pannello admin
- Export Excel dedicato alle magliette per rione
- Export anagrafica aggiornato con taglia maglia


## Aggiornamento v5
- Chiusura iscrizioni con un click dal pannello admin
- Data di chiusura automatica delle iscrizioni
- Modifica iscrizione dal manageriale
- Eliminazione iscrizione dal manageriale
