from __future__ import annotations

import os
import sqlite3
from datetime import datetime
from functools import wraps

from flask import (
    Flask,
    flash,
    g,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE = os.path.join(BASE_DIR, "database.db")

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "chiave-segreta")
app.config["ADMIN_USERNAME"] = os.environ.get("ADMIN_USERNAME", "admin")
app.config["ADMIN_PASSWORD"] = os.environ.get("ADMIN_PASSWORD", "admin123")

RIONI = [
    "POZZOLUNGO NORD",
    "POZZOLUNGO SUD",
    "IANA",
    "CHIANCA",
    "ZITA ROSA",
    "CENTRO",
    "CONSOLAZIONE",
    "PATULA - CUPA QUARTARARU",
]

SPORTS = {
    "Calcio": {"fee": 10.0, "is_double": False},
    "Padel": {"fee": 40.0, "is_double": True},
    "Burraco": {"fee": 5.0, "is_double": True},
    "Tiro con l'arco": {"fee": 10.0, "is_double": False},
    "Biliardino": {"fee": 20.0, "is_double": True},
    "Scopa": {"fee": 5.0, "is_double": True},
    "Volley": {"fee": 10.0, "is_double": False},
    "Scacchi": {"fee": 10.0, "is_double": False},
    "1vs1": {"fee": 5.0, "is_double": False},
    "Tennis": {"fee": 10.0, "is_double": False},
    "Ludopoli": {"fee": 5.0, "is_double": False},
}


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(error=None):
    db = g.pop("db", None)
    if db:
        db.close()


def init_db():
    db = sqlite3.connect(DATABASE)

    db.execute("""
    CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT,
        email TEXT,
        sport TEXT,
        rione TEXT,
        player1_name TEXT
    )
    """)

    db.execute("""
    CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)

    db.commit()
    db.close()


def get_setting(key, default=""):
    db = get_db()
    row = db.execute(
        "SELECT value FROM app_settings WHERE key = ?",
        (key,)
    ).fetchone()

    if row:
        return row["value"]

    return default


def set_setting(key, value):
    db = get_db()

    db.execute(
        """
        INSERT INTO app_settings(key, value)
        VALUES(?, ?)
        ON CONFLICT(key)
        DO UPDATE SET value = excluded.value
        """,
        (key, value),
    )

    db.commit()


def is_sport_open(sport_name):

    closed = get_setting(f"sport_closed::{sport_name}", "0")

    return closed != "1"


def login_required(view_func):

    @wraps(view_func)
    def wrapped(*args, **kwargs):

        if not session.get("admin_logged_in"):
            return redirect(url_for("admin_login"))

        return view_func(*args, **kwargs)

    return wrapped


@app.route("/")
def index():

    sports_status = {}

    for sport in SPORTS:

        sports_status[sport] = is_sport_open(sport)

    return render_template(
        "index.html",
        sports=SPORTS,
        sports_status=sports_status,
        rioni=RIONI,
    )


@app.post("/submit")
def submit_registration():

    sport = request.form.get("sport")

    if not is_sport_open(sport):

        flash("Le iscrizioni per questo sport sono chiuse.")

        return redirect(url_for("index"))

    db = get_db()

    db.execute(
        """
        INSERT INTO registrations (
            created_at,
            email,
            sport,
            rione,
            player1_name
        )
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            request.form.get("email"),
            sport,
            request.form.get("rione"),
            request.form.get("player1_name"),
        ),
    )

    db.commit()

    flash("Iscrizione registrata!")

    return redirect(url_for("index"))


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():

    if request.method == "POST":

        if (
            request.form.get("username")
            == app.config["ADMIN_USERNAME"]
            and request.form.get("password")
            == app.config["ADMIN_PASSWORD"]
        ):

            session["admin_logged_in"] = True

            return redirect(url_for("admin_dashboard"))

        flash("Credenziali non valide")

    return render_template("admin_login.html")


@app.route("/admin/logout")
def admin_logout():

    session.clear()

    return redirect(url_for("admin_login"))


@app.route("/admin")
@login_required
def admin_dashboard():

    sports_status = {}

    for sport in SPORTS:

        sports_status[sport] = is_sport_open(sport)

    return render_template(
        "admin_dashboard.html",
        sports=SPORTS,
        sports_status=sports_status,
    )


@app.post("/admin/toggle-sport/<sport_name>")
@login_required
def toggle_sport(sport_name):

    current = get_setting(
        f"sport_closed::{sport_name}",
        "0",
    )

    if current == "1":

        set_setting(
            f"sport_closed::{sport_name}",
            "0",
        )

        flash(f"{sport_name} riaperto")

    else:

        set_setting(
            f"sport_closed::{sport_name}",
            "1",
        )

        flash(f"{sport_name} chiuso")

    return redirect(url_for("admin_dashboard"))


if __name__ == "__main__":

    if not os.path.exists(DATABASE):

        init_db()

    port = int(os.environ.get("PORT", 10000))

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False,
    )
