"""
database.py
-----------
This module handles everything related to the SQLite database:

    * Connecting to the database
    * Creating the "tasks" table on first run
    * Inserting sample/demo data so the app is not empty the first time it runs
    * Small helper functions used by app.py to read and write tasks

Everything here uses Python's built-in `sqlite3` module, so there is
nothing extra to install. The database file (tasks.db) is created
automatically the first time you run the application.
"""

import sqlite3
import os

# Absolute path to the database file.
# We build it from this file's location so the app works no matter where
# you run `python app.py` from.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, "tasks.db")


def get_connection():
    """
    Open a new connection to the SQLite database.

    We set `row_factory` to `sqlite3.Row` so that the rows we get back
    behave like dictionaries (e.g. row["title"]) instead of plain tuples.
    This makes the code in app.py much easier to read.
    """
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    """
    Create the database and the `tasks` table if they do not exist yet.

    This is called once when the application starts (see app.py).
    If the table already exists, this function does nothing harmful.
    """
    connection = get_connection()
    cursor = connection.cursor()

    # Create the tasks table.
    # Each column is explained below:
    #   id          -> unique number for every task (auto-incremented)
    #   title       -> short name of the task (required)
    #   description -> longer text explaining the task (optional)
    #   priority    -> "Low", "Medium" or "High"
    #   due_date    -> date the task should be finished (stored as text: YYYY-MM-DD)
    #   status      -> "Pending" or "Completed"
    #   created_at  -> timestamp set automatically when the row is inserted
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT    NOT NULL,
            description TEXT,
            priority    TEXT    NOT NULL DEFAULT 'Medium',
            due_date    TEXT,
            status      TEXT    NOT NULL DEFAULT 'Pending',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    connection.commit()

    # If the table is completely empty, add some sample tasks so the
    # user sees something useful the very first time they open the app.
    cursor.execute("SELECT COUNT(*) AS total FROM tasks")
    if cursor.fetchone()["total"] == 0:
        insert_sample_data(connection)

    connection.close()


def insert_sample_data(connection):
    """
    Insert a few example tasks. This only runs once (when the table is empty).
    It gives new users some data to play with immediately.
    """
    sample_tasks = [
        (
            "Finish project report",
            "Write the final section and proofread the whole document.",
            "High",
            "2026-06-25",
            "Pending",
        ),
        (
            "Buy groceries",
            "Milk, eggs, bread, vegetables and coffee.",
            "Low",
            "2026-06-20",
            "Pending",
        ),
        (
            "Team meeting",
            "Weekly sync with the development team about the new release.",
            "Medium",
            "2026-06-19",
            "Completed",
        ),
        (
            "Pay electricity bill",
            "Pay the monthly bill online before the due date.",
            "High",
            "2026-06-22",
            "Pending",
        ),
    ]

    connection.executemany(
        """
        INSERT INTO tasks (title, description, priority, due_date, status)
        VALUES (?, ?, ?, ?, ?)
        """,
        sample_tasks,
    )
    connection.commit()


# ---------------------------------------------------------------------------
# CRUD helper functions
# These are thin wrappers around SQL so app.py stays clean and readable.
# ---------------------------------------------------------------------------


def get_all_tasks(search=None, priority=None, status=None):
    """
    Return a list of tasks, optionally filtered by:
        * search   -> text that must appear in the title (case-insensitive)
        * priority -> "Low", "Medium" or "High"
        * status   -> "Pending" or "Completed"

    Tasks are ordered so that Pending tasks come before Completed ones,
    then by priority (High first), then by due date.
    """
    connection = get_connection()

    # We build the query dynamically depending on which filters were given.
    query = "SELECT * FROM tasks WHERE 1=1"
    params = []

    if search:
        query += " AND LOWER(title) LIKE ?"
        params.append("%" + search.lower() + "%")

    if priority:
        query += " AND priority = ?"
        params.append(priority)

    if status:
        query += " AND status = ?"
        params.append(status)

    # Order results in a sensible way:
    #   - Pending tasks first (status = 'Pending' sorts before 'Completed')
    #   - Then High > Medium > Low priority
    #   - Then by the earliest due date
    query += """
        ORDER BY
            CASE status WHEN 'Pending' THEN 0 ELSE 1 END,
            CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END,
            due_date IS NULL, due_date ASC
    """

    rows = connection.execute(query, params).fetchall()
    connection.close()
    return rows


def get_task(task_id):
    """Return a single task by its id, or None if it does not exist."""
    connection = get_connection()
    row = connection.execute(
        "SELECT * FROM tasks WHERE id = ?", (task_id,)
    ).fetchone()
    connection.close()
    return row


def create_task(title, description, priority, due_date, status="Pending"):
    """Insert a new task and return its new id."""
    connection = get_connection()
    cursor = connection.execute(
        """
        INSERT INTO tasks (title, description, priority, due_date, status)
        VALUES (?, ?, ?, ?, ?)
        """,
        (title, description, priority, due_date, status),
    )
    connection.commit()
    new_id = cursor.lastrowid
    connection.close()
    return new_id


def update_task(task_id, title, description, priority, due_date, status):
    """Update every field of an existing task."""
    connection = get_connection()
    connection.execute(
        """
        UPDATE tasks
        SET title = ?, description = ?, priority = ?, due_date = ?, status = ?
        WHERE id = ?
        """,
        (title, description, priority, due_date, status, task_id),
    )
    connection.commit()
    connection.close()


def set_task_status(task_id, status):
    """Update only the status of a task (used by the 'mark complete' button)."""
    connection = get_connection()
    connection.execute(
        "UPDATE tasks SET status = ? WHERE id = ?", (status, task_id)
    )
    connection.commit()
    connection.close()


def delete_task(task_id):
    """Delete a task permanently by its id."""
    connection = get_connection()
    connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    connection.commit()
    connection.close()
