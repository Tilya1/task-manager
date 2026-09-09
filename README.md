# Task Manager

A fast, single-page task manager with smart lists, priorities, due dates and a
detail panel with auto-save. Built with Flask and SQLite on the backend and
plain JavaScript on the frontend, with no build step.

The layout follows the familiar three-column pattern of modern task apps:
smart lists on the left, the task list with a quick-add bar in the middle, and
an editable detail panel on the right. Light and dark themes are included.

## Features

- **Quick add.** Type a title, pick a date and a priority, press Enter.
  The bar pre-fills sensible defaults for the list you are in.
- **Smart lists.** All, Today (including overdue), Next 7 Days, No Date,
  Completed, and one list per priority, each with a live count.
- **Grouping and sorting.** Tasks are grouped into Overdue, Today, Next 7 Days,
  Later and No Date; sort by due date, priority, title or creation time.
- **Detail panel.** Click a task to edit its title, description, date, priority
  and status. Changes save automatically.
- **Search.** Filters by title and description as you type.
- **Priority-coloured checkboxes** and overdue highlighting.
- **Light and dark themes** with the system preference as the default.
- **Responsive.** On phones the sidebar and the detail panel become drawers.
- **Keyboard.** `N` focuses the quick-add bar, `/` focuses search, `Esc`
  closes panels.

## Tech stack

| Layer     | Technology                                   |
|-----------|----------------------------------------------|
| Backend   | Python 3.8+, Flask 3                          |
| Database  | SQLite via the standard library               |
| Frontend  | Vanilla JavaScript, CSS custom properties    |
| Icons     | Bootstrap Icons (CDN)                        |
| Server    | gunicorn (Render) or Vercel Python runtime   |

## Quick start

```bash
git clone https://github.com/Tilya1/task-manager.git
cd task-manager
python -m venv venv
# Windows: venv\Scripts\activate   macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000. The database file and a few sample tasks are
created on first run.

## Configuration

All settings are environment variables. Every one of them is optional.

| Variable        | Purpose                                              | Default                          |
|-----------------|------------------------------------------------------|----------------------------------|
| `PORT`          | Port for the local development server                | `5000`                           |
| `SECRET_KEY`    | Signs the session cookie used for flash messages     | development placeholder          |
| `DATABASE_PATH` | Location of the SQLite file                          | `./tasks.db` (`/tmp/tasks.db` on Vercel) |
| `FLASK_DEBUG`   | `1` enables the reloader and debugger locally        | `1`                              |

## API

The frontend talks to the backend only through this JSON API, so it can be
reused by other clients.

| Method   | Endpoint                 | Description                                            |
|----------|--------------------------|--------------------------------------------------------|
| `GET`    | `/api/tasks`             | List tasks. Optional `search`, `priority`, `status`.   |
| `POST`   | `/api/tasks`             | Create a task. Returns `201` with the new task.        |
| `PUT`    | `/api/tasks/<id>`        | Update any subset of fields. Returns the task.         |
| `POST`   | `/api/tasks/<id>/toggle` | Flip `Pending` and `Completed`. Returns the task.      |
| `DELETE` | `/api/tasks/<id>`        | Delete a task. Returns `{"ok": true}`.                 |

Task shape:

```json
{
  "id": 1,
  "title": "Finish project report",
  "description": "Write the final section and proofread.",
  "priority": "High",
  "due_date": "2026-06-25",
  "status": "Pending",
  "created_at": "2026-06-18 15:35:58"
}
```

Validation rules: `title` is required, `priority` is `Low`, `Medium` or
`High`, `status` is `Pending` or `Completed`, `due_date` is `YYYY-MM-DD` or
`null`. Invalid input returns `400` with `{"error": "..."}`.

The classic form routes `POST /add`, `/edit/<id>`, `/delete/<id>` and
`/toggle/<id>` are still available and redirect back to the page.

## Deployment

### Vercel

The repository includes `vercel.json`, so importing it at
https://vercel.com/new is enough. The Python runtime runs `app.py` as a
serverless function and serves the static assets through Flask.

Vercel's filesystem is read-only except for `/tmp`, so the SQLite file lives
there and is **reset whenever the function is recycled**. That makes the
Vercel deployment a live demo rather than persistent storage. For persistent
data point `DATABASE_PATH` at a mounted disk on a host such as Render, or
swap the storage layer in `database.py` for a hosted database.

### Render

`render.yaml` and `Procfile` are included. Create a Blueprint from the
repository, or a Web Service with:

- Build command: `pip install -r requirements.txt`
- Start command: `gunicorn app:app --bind 0.0.0.0:$PORT`

On the free plan the filesystem is ephemeral as well. Attach a persistent
disk and set `DATABASE_PATH=/var/data/tasks.db` to keep the data.

## Project structure

```
task-manager/
├── app.py               # Flask app: page route, JSON API, validation
├── database.py          # SQLite connection, schema, CRUD helpers
├── templates/
│   └── index.html       # Application shell
├── static/
│   ├── style.css        # Layout, themes, components
│   └── script.js        # State, rendering, API calls
├── requirements.txt
├── vercel.json          # Vercel deployment
├── render.yaml          # Render deployment
└── Procfile
```

## License

MIT
