import os
import sqlite3
from flask import Flask, render_template, request, redirect, url_for, session

app = Flask(__name__)
app.secret_key = "supersecretkey"

DATABASE = "database.db"


# -----------------------
# FILTRO VALUTA €
# -----------------------

@app.template_filter("currency")
def currency_filter(value):
    try:
        value = float(value)
        return f"€ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except:
        return value


# -----------------------
# DATABASE
# -----------------------

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    if not os.path.exists(DATABASE):
        conn = get_db_connection()
        with open("schema.sql", "r") as f:
            conn.executescript(f.read())
        conn.close()


def ensure_db_schema():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            phone TEXT,
            team TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()


# -----------------------
# ROUTES
# -----------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/register", methods=["POST"])
def register():
    name = request.form.get("name")
    phone = request.form.get("phone")
    team = request.form.get("team")

    conn = get_db_connection()
    conn.execute(
        "INSERT INTO registrations (name, phone, team) VALUES (?, ?, ?)",
        (name, phone, team),
    )
    conn.commit()
    conn.close()

    return redirect(url_for("success"))


@app.route("/success")
def success():
    return render_template("success.html")


# -----------------------
# ADMIN LOGIN
# -----------------------

@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if request.method == "POST":
        password = request.form.get("password")

        if password == "admin123":
            session["admin"] = True
            return redirect(url_for("admin_dashboard"))

    return render_template("admin_login.html")


@app.route("/admin")
def admin_dashboard():
    if not session.get("admin"):
        return redirect(url_for("admin_login"))

    conn = get_db_connection()
    registrations = conn.execute(
        "SELECT * FROM registrations ORDER BY created_at DESC"
    ).fetchall()
    conn.close()

    return render_template(
        "admin_dashboard.html",
        registrations=registrations
    )


@app.route("/admin/delete/<int:id>")
def delete_registration(id):
    if not session.get("admin"):
        return redirect(url_for("admin_login"))

    conn = get_db_connection()
    conn.execute(
        "DELETE FROM registrations WHERE id = ?",
        (id,)
    )
    conn.commit()
    conn.close()

    return redirect(url_for("admin_dashboard"))


# -----------------------
# HEALTH CHECK
# -----------------------

@app.route("/health")
def health():
    return {"status": "ok"}


# -----------------------
# START APP (IMPORTANTE PER RENDER)
# -----------------------

if __name__ == "__main__":

    if not os.path.exists(DATABASE):
        init_db()
    else:
        with app.app_context():
            ensure_db_schema()

    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )
