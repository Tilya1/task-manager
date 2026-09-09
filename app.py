"""
app.py
------
Main Flask application.

The page is a single-screen app: templates/index.html is the shell,
static/script.js loads the tasks from the JSON API below and renders them
in the browser, so every action (add, edit, complete, delete) happens
without a page reload.

JSON API (used by the frontend):

    GET    /api/tasks                -> list tasks (?search= &priority= &status=)
    POST   /api/tasks                -> create a task
    PUT    /api/tasks/<id>           -> update any subset of a task's fields
    POST   /api/tasks/<id>/toggle    -> flip Pending <-> Completed
    DELETE /api/tasks/<id>           -> delete a task
    GET    /api/task/<id>            -> return one task (kept for compatibility)

Classic form routes (still work, redirect back to the page):

    POST /add, POST /edit/<id>, POST /delete/<id>, POST /toggle/<id>

Run the app with:
    python app.py
Then open http://127.0.0.1:5000 in your browser.
"""

import os
from datetime import datetime

from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    jsonify,
    flash,
)

import database  # our own database.py module

app = Flask(__name__)

# A secret key is required for flash() messages. In production set the
# SECRET_KEY environment variable; locally we fall back to a default value.
app.secret_key = os.environ.get("SECRET_KEY", "change-this-secret-key-in-production")

VALID_PRIORITIES = ("Low", "Medium", "High")
VALID_STATUSES = ("Pending", "Completed")

# Make sure the database and table exist before we serve any request.
database.init_db()


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def clean_date(value):
    """Return a YYYY-MM-DD string, None for empty, or raise ValueError."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise ValueError("Due date must be in YYYY-MM-DD format.")
    return value


def clean_task_fields(data, existing=None):
    """
    Validate the fields of a task and return them as a dict.

    `data` is a dict-like object (JSON body or form). When `existing` is
    given (an update), any field missing from `data` keeps its current value,
    so the JSON API supports partial updates.
    """
    current = dict(existing) if existing is not None else {}

    def pick(key, default):
        return data[key] if key in data else current.get(key, default)

    title = (pick("title", "") or "").strip()
    if not title:
        raise ValueError("Title is required.")

    description = (pick("description", "") or "").strip()

    priority = pick("priority", "Medium") or "Medium"
    if priority not in VALID_PRIORITIES:
        raise ValueError("Priority must be Low, Medium or High.")

    status = pick("status", "Pending") or "Pending"
    if status not in VALID_STATUSES:
        raise ValueError("Status must be Pending or Completed.")

    due_date = clean_date(pick("due_date", None))

    return {
        "title": title,
        "description": description,
        "priority": priority,
        "due_date": due_date,
        "status": status,
    }


def task_to_dict(row):
    """sqlite3.Row -> plain dict (jsonify cannot serialise Row objects)."""
    return dict(row)


# ---------------------------------------------------------------------------
# Page
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    """Render the app shell. The task list itself is loaded via /api/tasks."""
    return render_template("index.html")


# ---------------------------------------------------------------------------
# JSON API
# ---------------------------------------------------------------------------


@app.route("/api/tasks")
def api_list_tasks():
    """Return all tasks as JSON, with optional search / priority / status filters."""
    search = request.args.get("search", "").strip() or None
    priority = request.args.get("priority", "").strip() or None
    status = request.args.get("status", "").strip() or None

    rows = database.get_all_tasks(search=search, priority=priority, status=status)
    return jsonify({"tasks": [task_to_dict(r) for r in rows]})


@app.route("/api/tasks", methods=["POST"])
def api_create_task():
    """Create a task from a JSON body and return the new task."""
    data = request.get_json(silent=True) or {}
    try:
        fields = clean_task_fields(data)
    except ValueError as err:
        return jsonify({"error": str(err)}), 400

    new_id = database.create_task(
        fields["title"],
        fields["description"],
        fields["priority"],
        fields["due_date"],
        fields["status"],
    )
    return jsonify(task_to_dict(database.get_task(new_id))), 201


@app.route("/api/tasks/<int:task_id>", methods=["PUT", "PATCH"])
def api_update_task(task_id):
    """Update any subset of a task's fields (partial update) and return it."""
    existing = database.get_task(task_id)
    if existing is None:
        return jsonify({"error": "Task not found."}), 404

    data = request.get_json(silent=True) or {}
    try:
        fields = clean_task_fields(data, existing=existing)
    except ValueError as err:
        return jsonify({"error": str(err)}), 400

    database.update_task(
        task_id,
        fields["title"],
        fields["description"],
        fields["priority"],
        fields["due_date"],
        fields["status"],
    )
    return jsonify(task_to_dict(database.get_task(task_id)))


@app.route("/api/tasks/<int:task_id>/toggle", methods=["POST"])
def api_toggle_task(task_id):
    """Flip a task between Pending and Completed and return it."""
    task = database.get_task(task_id)
    if task is None:
        return jsonify({"error": "Task not found."}), 404

    new_status = "Completed" if task["status"] == "Pending" else "Pending"
    database.set_task_status(task_id, new_status)
    return jsonify(task_to_dict(database.get_task(task_id)))


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def api_delete_task(task_id):
    """Delete a task."""
    if database.get_task(task_id) is None:
        return jsonify({"error": "Task not found."}), 404
    database.delete_task(task_id)
    return jsonify({"ok": True})


@app.route("/api/task/<int:task_id>")
def api_task(task_id):
    """Return a single task as JSON (older endpoint, kept for compatibility)."""
    task = database.get_task(task_id)
    if task is None:
        return jsonify({"error": "Task not found."}), 404
    return jsonify(task_to_dict(task))


# ---------------------------------------------------------------------------
# Classic form routes (no JavaScript required)
# ---------------------------------------------------------------------------


@app.route("/add", methods=["POST"])
def add():
    """Create a new task from submitted form data."""
    try:
        fields = clean_task_fields(request.form)
    except ValueError as err:
        flash(str(err), "error")
        return redirect(url_for("index"))

    database.create_task(
        fields["title"],
        fields["description"],
        fields["priority"],
        fields["due_date"],
        "Pending",
    )
    flash("Task added successfully.", "success")
    return redirect(url_for("index"))


@app.route("/edit/<int:task_id>", methods=["POST"])
def edit(task_id):
    """Update all fields of an existing task from submitted form data."""
    existing = database.get_task(task_id)
    if existing is None:
        flash("Task not found.", "error")
        return redirect(url_for("index"))

    try:
        fields = clean_task_fields(request.form, existing=existing)
    except ValueError as err:
        flash(str(err), "error")
        return redirect(url_for("index"))

    database.update_task(
        task_id,
        fields["title"],
        fields["description"],
        fields["priority"],
        fields["due_date"],
        fields["status"],
    )
    flash("Task updated successfully.", "success")
    return redirect(url_for("index"))


@app.route("/delete/<int:task_id>", methods=["POST"])
def delete(task_id):
    """Delete a task."""
    database.delete_task(task_id)
    flash("Task deleted.", "success")
    return redirect(url_for("index"))


@app.route("/toggle/<int:task_id>", methods=["POST"])
def toggle(task_id):
    """Flip a task between 'Pending' and 'Completed'."""
    task = database.get_task(task_id)
    if task is None:
        flash("Task not found.", "error")
        return redirect(url_for("index"))

    new_status = "Completed" if task["status"] == "Pending" else "Pending"
    database.set_task_status(task_id, new_status)
    return redirect(url_for("index"))


if __name__ == "__main__":
    # Local development only (python app.py). On Render the app is started by
    # gunicorn (see render.yaml / README), which imports `app` directly.
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)
