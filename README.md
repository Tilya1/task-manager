# 📝 Task Manager

A simple, modern, **production-ready web Task Manager** built with **Python Flask** and **SQLite**.
Create, view, edit, delete, search, filter, and complete tasks — all from a clean, mobile-friendly interface.

---

## ✨ Features

- **Add tasks** with a Title (required), Description, Priority (Low / Medium / High) and Due Date
- **View all tasks** in a responsive card layout
- **Edit tasks** — every field can be updated, with existing values pre-filled
- **Delete tasks** with a confirmation dialog
- **Search** tasks by title
- **Filter** tasks by priority and status
- **Mark tasks** as Completed or reopen them as Pending
- **Modern responsive UI** using Bootstrap 5 — works on phones, tablets and desktops
- **Automatic database creation** with sample data on first run

---

## 🧱 Tech Stack

| Layer     | Technology              |
|-----------|-------------------------|
| Backend   | Python, Flask           |
| Database  | SQLite (built-in)       |
| Frontend  | HTML, CSS, JavaScript   |
| Templates | Jinja2                  |
| Styling   | Bootstrap 5 + custom CSS|

---

## 📂 Project Structure

```
task-manager/
├── app.py              # Main Flask application (routes / controllers)
├── database.py         # Database connection, table creation, CRUD helpers
├── requirements.txt    # Python dependencies
├── README.md           # This file
├── tasks.db            # SQLite database (created automatically on first run)
├── templates/
│   └── index.html      # Main HTML page (Jinja template)
└── static/
    ├── style.css       # Custom styling
    └── script.js       # Browser-side JavaScript (modal + confirm dialogs)
```

> **Where do the files go?**
> Keep the exact structure above. `templates/` and `static/` are special folders
> that Flask looks for automatically. `tasks.db` does **not** need to exist
> beforehand — it is created the first time you run the app.

---

## 🚀 Installation

You need **Python 3.8 or newer** installed.

1. **Get the project**

   Copy the `task-manager` folder to your computer (or clone it), then open a
   terminal inside that folder:

   ```bash
   cd task-manager
   ```

2. **(Recommended) Create a virtual environment**

   On **Windows**:
   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```

   On **macOS / Linux**:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install the dependencies**

   ```bash
   pip install -r requirements.txt
   ```

---

## ▶️ Running the App

```bash
python app.py
```

Then open your browser at:

```
http://127.0.0.1:5000
```

The database (`tasks.db`) and a few **sample tasks** are created automatically
the first time you run the app.

To stop the server, press `Ctrl + C` in the terminal.

---

## 🧪 Sample Test Data

On first run, the app inserts these example tasks so the page isn't empty:

| Title                 | Priority | Due Date   | Status    |
|-----------------------|----------|------------|-----------|
| Finish project report | High     | 2026-06-25 | Pending   |
| Buy groceries         | Low      | 2026-06-20 | Pending   |
| Team meeting          | Medium   | 2026-06-19 | Completed |
| Pay electricity bill  | High     | 2026-06-22 | Pending   |

> Want a clean slate? Just delete the `tasks.db` file and restart the app —
> it will be recreated with the sample data again.

---

## 🔗 Routes Overview

| Method | URL                 | Purpose                                  |
|--------|---------------------|------------------------------------------|
| GET    | `/`                 | Show all tasks (supports search/filter)  |
| POST   | `/add`              | Create a new task                        |
| POST   | `/edit/<id>`        | Update an existing task                  |
| POST   | `/delete/<id>`      | Delete a task                            |
| POST   | `/toggle/<id>`      | Mark a task complete / pending           |
| GET    | `/api/task/<id>`    | Return one task as JSON (for edit modal) |

---

## ☁️ Deploy to Render.com

This repo is ready to deploy on [Render](https://render.com) — it includes a
`render.yaml` blueprint, a `Procfile`, and `gunicorn` (a production server).

**Option A — Blueprint (easiest):**

1. Push this project to GitHub (already done if you cloned it from there).
2. In the [Render dashboard](https://dashboard.render.com), click
   **New → Blueprint**.
3. Connect your GitHub account and select the `task-manager` repository.
4. Render reads `render.yaml`, sets everything up, and clicks **Apply**.
5. When the build finishes, open the `https://<your-app>.onrender.com` URL.

**Option B — Manual Web Service:**

1. **New → Web Service**, connect the repo.
2. Set:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app --bind 0.0.0.0:$PORT`
3. (Optional) Add an env var `SECRET_KEY` with any long random string.
4. Click **Create Web Service**.

> ⚠️ **Important — data persistence.**
> Render's **free** tier has an *ephemeral* filesystem: the `tasks.db` file is
> **wiped on every redeploy or restart**, and the sample data is recreated.
> That's fine for a demo. To keep your data permanently you must either:
> - attach a **persistent disk** (paid plan) — uncomment the `disk:` block and
>   the `DATABASE_PATH` env var in `render.yaml`, **or**
> - switch the storage to a managed **PostgreSQL** database.
>
> The app reads the optional `DATABASE_PATH` environment variable, so you can
> point SQLite at a mounted disk (e.g. `/var/data/tasks.db`) without code changes.

**Environment variables the app understands:**

| Variable        | Purpose                                          | Default          |
|-----------------|--------------------------------------------------|------------------|
| `PORT`          | Port to listen on (Render sets this for you)     | `5000`           |
| `SECRET_KEY`    | Secret used to sign sessions / flash messages    | a dev placeholder|
| `DATABASE_PATH` | Where the SQLite file lives (use for a disk)     | `./tasks.db`     |

---

## ❓ Troubleshooting

- **`python` not found** → try `python3` instead.
- **Port 5000 already in use** → edit the last line of `app.py`:
  `app.run(debug=True, port=5001)` and open `http://127.0.0.1:5001`.
- **Want to reset everything** → delete `tasks.db` and run `python app.py` again.

---

## 📜 License

Free to use for learning and personal projects. Enjoy! 🎉
