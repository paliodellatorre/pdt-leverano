
from flask import Flask, render_template, request, redirect, url_for, session, send_file
import sqlite3
import os
import pandas as pd
import io

app = Flask(__name__)
app.secret_key = "supersecretkey"

DATABASE = "database.db"

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    conn.execute(
        "CREATE TABLE IF NOT EXISTS registrations ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "name TEXT,"
        "phone TEXT,"
        "team TEXT,"
        "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ")"
    )
    conn.commit()
    conn.close()

init_db()

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
        (name, phone, team)
    )
    conn.commit()
    conn.close()

    return redirect(url_for("index"))

@app.route("/admin-login", methods=["GET", "POST"])
def admin_login():
    if request.method == "POST":
        password = request.form.get("password")
        if password == "1234":
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

@app.route("/delete/<int:id>")
def delete_registration(id):
    if not session.get("admin"):
        return redirect(url_for("admin_login"))

    conn = get_db_connection()
    conn.execute("DELETE FROM registrations WHERE id = ?", (id,))
    conn.commit()
    conn.close()

    return redirect(url_for("admin_dashboard"))

@app.route("/export_excel")
def export_excel():
    if not session.get("admin"):
        return redirect(url_for("admin_login"))

    conn = get_db_connection()
    registrations = conn.execute(
        "SELECT * FROM registrations ORDER BY created_at DESC"
    ).fetchall()
    conn.close()

    data = [dict(row) for row in registrations]
    df = pd.DataFrame(data)

    output = io.BytesIO()
    df.to_excel(output, index=False)
    output.seek(0)

    return send_file(
        output,
        download_name="iscrizioni.xlsx",
        as_attachment=True,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
