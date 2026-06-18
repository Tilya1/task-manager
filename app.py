"""
app.py
------
This is the main Flask application. It defines all the web routes (URLs)
that the browser talks to:

    GET  /                       -> show all tasks (with search/filter)
    POST /add                    -> create a new task
    POST /edit/<id>              -> update an existing task
    POST /delete/<id>            -> delete a task
    POST /toggle/<id>            -> mark a task complete / pending
    GET  /api/task/<id>          -> return one task as JSON (used by the edit modal)

The HTML page is rendered with a Jinja template (templates/index.html).
The look and behaviour live in static/style.css and static/script.js.

Run the app with:
    python app.py
Then open http://127.0.0.1:5000 in your browser.
"""

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

# Create the Flask application.
app = Flask(__name__)

# A secret key is required to use flash() messages (the little notifications
# shown after adding/editing/deleting). For a real production app you would
# load this from an environment variable instead of hard-coding it.
app.secret_key = "change-this-secret-key-in-production"

# Make sure the database and table exist before we serve any request.
database.init_db()


@app.route("/")
def index():
    """
    Home page.

    Reads optional query-string parameters:
        ?search=...    -> search by title
        ?priority=...  -> filter by priority (Low/Medium/High)
        ?status=...    -> filter by status (Pending/Completed)

    Then renders index.html with the matching tasks.
    """
    # `request.args.get` returns None if the parameter is missing.
    # We strip whitespace from the search box and treat empty strings as "no filter".
    search = request.args.get("search", "").strip() or None
    priority = request.args.get("priority", "").strip() or None
    status = request.args.get("status", "").strip() or None

    tasks = database.get_all_tasks(search=search, priority=priority, status=status)

    return render_template(
        "index.html",
        tasks=tasks,
        # Pass the current filter values back so the form stays filled in.
        current_search=search or "",
        current_priority=priority or "",
        current_status=status or "",
    )


@app.route("/add", methods=["POST"])
def add():
    """Create a new task from the submitted form data."""
    title = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip()
    priority = request.form.get("priority", "Medium")
    due_date = request.form.get("due_date", "").strip()

    # Title is the only required field. If it is empty we send the user back
    # with an error message instead of saving an invalid task.
    if not title:
        flash("Title is required.", "error")
        return redirect(url_for("index"))

    database.create_task(title, description, priority, due_date, "Pending")
    flash("Task added successfully.", "success")
    return redirect(url_for("index"))


@app.route("/edit/<int:task_id>", methods=["POST"])
def edit(task_id):
    """Update all fields of an existing task."""
    title = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip()
    priority = request.form.get("priority", "Medium")
    due_date = request.form.get("due_date", "").strip()
    status = request.form.get("status", "Pending")

    if not title:
        flash("Title is required.", "error")
        return redirect(url_for("index"))

    # Make sure the task actually exists before trying to update it.
    if database.get_task(task_id) is None:
        flash("Task not found.", "error")
        return redirect(url_for("index"))

    database.update_task(task_id, title, description, priority, due_date, status)
    flash("Task updated successfully.", "success")
    return redirect(url_for("index"))


@app.route("/delete/<int:task_id>", methods=["POST"])
def delete(task_id):
    """Delete a task. The confirmation dialog happens in the browser (script.js)."""
    database.delete_task(task_id)
    flash("Task deleted.", "success")
    return redirect(url_for("index"))


@app.route("/toggle/<int:task_id>", methods=["POST"])
def toggle(task_id):
    """
    Flip a task between 'Pending' and 'Completed'.
    Used by the "Mark complete" / "Mark pending" button on each card.
    """
    task = database.get_task(task_id)
    if task is None:
        flash("Task not found.", "error")
        return redirect(url_for("index"))

    new_status = "Completed" if task["status"] == "Pending" else "Pending"
    database.set_task_status(task_id, new_status)
    return redirect(url_for("index"))


@app.route("/api/task/<int:task_id>")
def api_task(task_id):
    """
    Return a single task as JSON.

    The frontend JavaScript calls this when the user clicks "Edit" so it can
    pre-fill the edit form without reloading the page.
    """
    task = database.get_task(task_id)
    if task is None:
        return jsonify({"error": "Task not found"}), 404

    # sqlite3.Row supports dict() conversion thanks to row_factory in database.py.
    return jsonify(dict(task))


if __name__ == "__main__":
    # debug=True gives helpful error pages and auto-reloads when you edit code.
    # Turn this off in a real production deployment.
    app.run(debug=True)
