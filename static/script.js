/*
 * script.js
 * ---------
 * Browser-side logic for the task app. Everything happens on one page:
 *
 *   - tasks are loaded once from GET /api/tasks and kept in `state.tasks`
 *   - the sidebar switches between "smart lists" (All, Today, Next 7 Days,
 *     No Date, Completed, and one list per priority)
 *   - the quick-add bar creates tasks (Enter to save)
 *   - clicking a row opens the detail panel; edits there auto-save
 *   - the checkbox toggles Pending / Completed
 *
 * All server calls go through the small `api()` helper at the bottom.
 */

(function () {
    "use strict";

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    var state = {
        tasks: [],
        view: "all",          // which smart list is shown
        sort: "default",
        search: "",
        selectedId: null,     // task open in the detail panel
        collapsed: {},        // group key -> true when collapsed
    };

    var VIEWS = {
        all:       { title: "All",         icon: "bi-inbox" },
        today:     { title: "Today",       icon: "bi-calendar-check" },
        week:      { title: "Next 7 Days", icon: "bi-calendar-week" },
        nodate:    { title: "No Date",     icon: "bi-calendar-x" },
        completed: { title: "Completed",   icon: "bi-check-circle" },
        "p-high":  { title: "High priority",   priority: "High" },
        "p-medium":{ title: "Medium priority", priority: "Medium" },
        "p-low":   { title: "Low priority",    priority: "Low" },
    };

    var PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 };

    // ------------------------------------------------------------------
    // DOM references
    // ------------------------------------------------------------------

    var $ = function (id) { return document.getElementById(id); };

    var appEl = $("app");
    var sidebarEl = $("sidebar");
    var taskListEl = $("taskList");
    var emptyEl = $("emptyState");
    var emptyTextEl = $("emptyText");
    var viewTitleEl = $("viewTitle");
    var viewSubtitleEl = $("viewSubtitle");
    var searchInput = $("searchInput");
    var sortSelect = $("sortSelect");

    var addForm = $("addForm");
    var addTitle = $("addTitle");
    var addDate = $("addDate");
    var addDateChip = $("addDateChip");
    var addDateText = $("addDateText");
    var addPriorityBtn = $("addPriorityBtn");

    var detailEl = $("detail");
    var detailCheck = $("detailCheck");
    var detailDate = $("detailDate");
    var detailDateText = $("detailDateText");
    var detailDateChip = detailDate.parentElement;
    var detailPriorityBtn = $("detailPriorityBtn");
    var detailTitle = $("detailTitle");
    var detailDesc = $("detailDesc");
    var detailMeta = $("detailMeta");
    var detailDelete = $("detailDelete");
    var detailClose = $("detailClose");

    var popover = $("priorityPopover");
    var scrim = $("scrim");
    var toastEl = $("toast");
    var themeToggle = $("themeToggle");
    var menuBtn = $("menuBtn");

    // ------------------------------------------------------------------
    // Date helpers (all dates are plain YYYY-MM-DD strings, local time)
    // ------------------------------------------------------------------

    function pad(n) { return (n < 10 ? "0" : "") + n; }

    function toISO(d) {
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }

    function parseISO(iso) {
        var p = iso.split("-").map(Number);
        return new Date(p[0], p[1] - 1, p[2]);
    }

    function todayISO() { return toISO(new Date()); }

    function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

    function addDays(iso, n) {
        var d = parseISO(iso);
        d.setDate(d.getDate() + n);
        return toISO(d);
    }

    /** Human friendly label: Today, Tomorrow, Yesterday, Friday, Sep 12, Sep 12 2027 */
    function formatDate(iso, options) {
        if (!iso) return "";
        options = options || {};
        var today = todayISO();
        if (iso === today) return "Today";
        if (iso === addDays(today, 1)) return "Tomorrow";
        if (iso === addDays(today, -1)) return "Yesterday";

        var d = parseISO(iso);
        var diff = Math.round((d - parseISO(today)) / 86400000);
        if (!options.noWeekday && diff > 1 && diff < 7) {
            return capitalize(d.toLocaleDateString(undefined, { weekday: "long" }));
        }
        var fmt = { month: "short", day: "numeric" };
        if (d.getFullYear() !== new Date().getFullYear()) fmt.year = "numeric";
        return d.toLocaleDateString(undefined, fmt);
    }

    function formatTimestamp(ts) {
        // SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC.
        if (!ts) return "";
        var d = new Date(ts.replace(" ", "T") + "Z");
        if (isNaN(d.getTime())) return ts;
        return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }

    // ------------------------------------------------------------------
    // Filtering, grouping, sorting
    // ------------------------------------------------------------------

    function matchesView(task, view) {
        var today = todayISO();
        var weekEnd = addDays(today, 6);
        var v = VIEWS[view];

        if (v && v.priority) return task.priority === v.priority;

        switch (view) {
            case "today":
                // Pending: overdue + due today. Completed: only if due today.
                if (task.status === "Pending") return !!task.due_date && task.due_date <= today;
                return task.due_date === today;
            case "week":
                return !!task.due_date && task.due_date >= today && task.due_date <= weekEnd;
            case "nodate":
                return !task.due_date;
            case "completed":
                return task.status === "Completed";
            default:
                return true;
        }
    }

    function matchesSearch(task, q) {
        if (!q) return true;
        q = q.toLowerCase();
        return (task.title || "").toLowerCase().indexOf(q) !== -1 ||
               (task.description || "").toLowerCase().indexOf(q) !== -1;
    }

    function visibleTasks() {
        return state.tasks.filter(function (t) {
            return matchesView(t, state.view) && matchesSearch(t, state.search);
        });
    }

    function compareTasks(a, b) {
        var byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        var byDate = compareDates(a.due_date, b.due_date);
        var byCreated = (b.created_at || "").localeCompare(a.created_at || "") || (b.id - a.id);
        var byTitle = (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });

        switch (state.sort) {
            case "date":     return byDate || byPriority || byTitle;
            case "priority": return byPriority || byDate || byTitle;
            case "title":    return byTitle || byDate;
            case "created":  return byCreated;
            default:         return byPriority || byDate || (a.id - b.id);
        }
    }

    function compareDates(a, b) {
        if (!a && !b) return 0;
        if (!a) return 1;   // tasks without a date go last
        if (!b) return -1;
        return a < b ? -1 : a > b ? 1 : 0;
    }

    /** Decide which section a pending task belongs to. */
    function groupFor(task) {
        var today = todayISO();
        if (state.view === "week") {
            var label = formatDate(task.due_date);
            var d = parseISO(task.due_date);
            var sub = capitalize(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
            if (label !== sub) label += " · " + sub;
            return { key: "d-" + task.due_date, label: label, order: task.due_date };
        }
        if (!task.due_date)             return { key: "nodate",  label: "No Date",     order: "5" };
        if (task.due_date < today)      return { key: "overdue", label: "Overdue",     order: "0", overdue: true };
        if (task.due_date === today)    return { key: "today",   label: "Today",       order: "1" };
        if (task.due_date <= addDays(today, 6)) return { key: "week", label: "Next 7 Days", order: "2" };
        return { key: "later", label: "Later", order: "3" };
    }

    function buildGroups(tasks) {
        var groups = {};
        var order = [];

        tasks.forEach(function (t) {
            var g = t.status === "Completed"
                ? { key: "completed", label: "Completed", order: "9", completed: true }
                : groupFor(t);
            if (!groups[g.key]) {
                groups[g.key] = { key: g.key, label: g.label, order: g.order, overdue: !!g.overdue, completed: !!g.completed, tasks: [] };
                order.push(g.key);
            }
            groups[g.key].tasks.push(t);
        });

        return order.map(function (k) { return groups[k]; }).sort(function (a, b) {
            return a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
        }).map(function (g) {
            if (g.completed) {
                // Most recently completed / latest due first.
                g.tasks.sort(function (a, b) { return -compareDates(a.due_date, b.due_date) || (b.id - a.id); });
            } else {
                g.tasks.sort(compareTasks);
            }
            return g;
        });
    }

    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------

    function escapeHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function renderAll() {
        renderSidebarCounts();
        renderHeader();
        renderList();
        renderDetail();
    }

    function renderSidebarCounts() {
        var pending = state.tasks.filter(function (t) { return t.status === "Pending"; });
        var counts = {
            all: pending.length,
            today: pending.filter(function (t) { return matchesView(t, "today"); }).length,
            week: pending.filter(function (t) { return matchesView(t, "week"); }).length,
            nodate: pending.filter(function (t) { return !t.due_date; }).length,
            completed: state.tasks.length - pending.length,
            "p-high": pending.filter(function (t) { return t.priority === "High"; }).length,
            "p-medium": pending.filter(function (t) { return t.priority === "Medium"; }).length,
            "p-low": pending.filter(function (t) { return t.priority === "Low"; }).length,
        };
        Object.keys(counts).forEach(function (k) {
            var el = sidebarEl.querySelector('[data-count="' + k + '"]');
            if (el) el.textContent = counts[k] ? counts[k] : "";
        });
        Array.prototype.forEach.call(sidebarEl.querySelectorAll(".nav-item"), function (btn) {
            btn.classList.toggle("active", btn.getAttribute("data-view") === state.view);
        });
    }

    function renderHeader() {
        var v = VIEWS[state.view] || VIEWS.all;
        viewTitleEl.textContent = state.search ? "Search" : v.title;
        var subtitle = "";
        if (state.search) {
            subtitle = "“" + state.search + "” in " + v.title;
        } else if (state.view === "today") {
            subtitle = capitalize(new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }));
        }
        viewSubtitleEl.textContent = subtitle;
        addTitle.placeholder = "Add task to " + v.title;
        // The quick-add bar makes no sense inside the Completed list.
        addForm.classList.toggle("hidden", state.view === "completed");
    }

    function renderList() {
        var tasks = visibleTasks();
        taskListEl.innerHTML = "";

        if (tasks.length === 0) {
            emptyEl.classList.remove("hidden");
            emptyTextEl.textContent = state.search
                ? "No tasks match your search."
                : state.view === "completed" ? "No completed tasks yet." : "All clear. Add a task above.";
            return;
        }
        emptyEl.classList.add("hidden");

        var groups = buildGroups(tasks);
        var singleGroup = groups.length === 1 && !groups[0].completed && state.view !== "week";

        groups.forEach(function (g) {
            // Completed section starts collapsed unless the user is in the Completed list.
            if (state.collapsed[g.key] === undefined && g.completed && state.view !== "completed") {
                state.collapsed[g.key] = true;
            }
            var collapsed = !!state.collapsed[g.key];
            var wrap = document.createElement("section");
            wrap.className = "group" + (collapsed ? " collapsed" : "");
            wrap.setAttribute("data-group", g.key);

            var html = "";
            if (!singleGroup) {
                html += '<button type="button" class="group-header' + (g.overdue ? " overdue" : "") + (collapsed ? " collapsed" : "") + '">' +
                        '<i class="bi bi-chevron-down"></i>' + escapeHtml(g.label) +
                        '<span class="group-count">' + g.tasks.length + "</span></button>";
            }
            html += '<div class="group-body">' + g.tasks.map(renderRow).join("") + "</div>";
            wrap.innerHTML = html;
            taskListEl.appendChild(wrap);
        });
    }

    function renderRow(t) {
        var done = t.status === "Completed";
        var today = todayISO();
        var dateClass = "";
        if (t.due_date && !done) {
            if (t.due_date < today) dateClass = " overdue";
            else if (t.due_date === today) dateClass = " today";
        }
        return '<div class="task-row' + (done ? " done" : "") + (t.id === state.selectedId ? " selected" : "") + '" data-id="' + t.id + '">' +
            '<button type="button" class="check p-' + t.priority.toLowerCase() + (done ? " done" : "") + '" aria-label="Toggle complete"><i class="bi bi-check"></i></button>' +
            '<div class="task-main">' +
                '<div class="task-title">' + escapeHtml(t.title) + "</div>" +
                (t.description ? '<div class="task-desc">' + escapeHtml(t.description) + "</div>" : "") +
            "</div>" +
            '<div class="task-meta">' +
                (t.due_date ? '<span class="task-date' + dateClass + '">' + escapeHtml(formatDate(t.due_date)) + "</span>" : "") +
            "</div>" +
        "</div>";
    }

    function renderDetail() {
        var task = findTask(state.selectedId);
        if (!task) {
            appEl.classList.remove("detail-open");
            return;
        }
        appEl.classList.add("detail-open");
        var done = task.status === "Completed";

        detailCheck.className = "check p-" + task.priority.toLowerCase() + (done ? " done" : "");
        // Only overwrite the text fields if they differ, so typing is not disturbed.
        if (detailTitle.value !== task.title) detailTitle.value = task.title;
        if (detailDesc.value !== (task.description || "")) detailDesc.value = task.description || "";
        detailTitle.classList.toggle("done", done);

        detailDate.value = task.due_date || "";
        setDateChip(detailDateChip, detailDateText, task.due_date, "Date");
        setPriority(detailPriorityBtn, task.priority);

        detailMeta.textContent = (done ? "Completed" : "Pending") +
            (task.created_at ? " · Created " + formatTimestamp(task.created_at) : "");
    }

    function setDateChip(chip, textEl, iso, emptyLabel) {
        textEl.textContent = iso ? formatDate(iso, { noWeekday: false }) : (emptyLabel || "");
        chip.classList.toggle("has-date", !!iso);
        chip.classList.toggle("overdue", !!iso && iso < todayISO());
    }

    function setPriority(btn, priority) {
        btn.setAttribute("data-priority", priority);
        btn.title = "Priority: " + priority;
    }

    // ------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------

    function findTask(id) {
        for (var i = 0; i < state.tasks.length; i++) {
            if (state.tasks[i].id === id) return state.tasks[i];
        }
        return null;
    }

    function replaceTask(updated) {
        var idx = state.tasks.findIndex(function (t) { return t.id === updated.id; });
        if (idx === -1) state.tasks.push(updated); else state.tasks[idx] = updated;
    }

    function loadTasks() {
        return api("GET", "/api/tasks").then(function (data) {
            state.tasks = data.tasks || [];
            renderAll();
        }).catch(function (err) { toast(err.message, true); });
    }

    function createTask(fields) {
        return api("POST", "/api/tasks", fields).then(function (task) {
            state.tasks.push(task);
            renderAll();
            return task;
        }).catch(function (err) { toast(err.message, true); });
    }

    function updateTask(id, patch) {
        // Optimistic update: apply locally first, then confirm with the server.
        var task = findTask(id);
        if (!task) return Promise.resolve();
        var before = Object.assign({}, task);
        Object.assign(task, patch);
        renderAll();

        return api("PUT", "/api/tasks/" + id, patch).then(function (saved) {
            replaceTask(saved);
            renderAll();
        }).catch(function (err) {
            Object.assign(task, before);
            renderAll();
            toast(err.message, true);
        });
    }

    function toggleTask(id) {
        var task = findTask(id);
        if (!task) return;
        task.status = task.status === "Pending" ? "Completed" : "Pending";
        renderAll();
        api("POST", "/api/tasks/" + id + "/toggle").then(function (saved) {
            replaceTask(saved);
            renderAll();
        }).catch(function (err) {
            task.status = task.status === "Pending" ? "Completed" : "Pending";
            renderAll();
            toast(err.message, true);
        });
    }

    function deleteTask(id) {
        var task = findTask(id);
        if (!task) return;
        if (!confirm('Delete "' + task.title + '"? This cannot be undone.')) return;

        api("DELETE", "/api/tasks/" + id).then(function () {
            state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
            if (state.selectedId === id) state.selectedId = null;
            renderAll();
            toast("Task deleted.");
        }).catch(function (err) { toast(err.message, true); });
    }

    function selectTask(id) {
        state.selectedId = id;
        renderAll();
        if (id !== null && window.innerWidth <= 900) closeSidebar();
    }

    function setView(view) {
        state.view = view;
        state.selectedId = null;
        resetAddBar();
        renderAll();
        closeSidebar();
    }

    // ------------------------------------------------------------------
    // Quick add bar
    // ------------------------------------------------------------------

    function resetAddBar() {
        addTitle.value = "";
        var v = VIEWS[state.view] || {};
        // Sensible defaults per list: Today pre-fills today's date, a priority
        // list pre-selects that priority.
        addDate.value = state.view === "today" ? todayISO() : "";
        setDateChip(addDateChip, addDateText, addDate.value, "");
        setPriority(addPriorityBtn, v.priority || "Medium");
    }

    addForm.addEventListener("submit", function (e) {
        e.preventDefault();
        var title = addTitle.value.trim();
        if (!title) return;
        createTask({
            title: title,
            description: "",
            priority: addPriorityBtn.getAttribute("data-priority"),
            due_date: addDate.value || null,
        }).then(function (task) {
            if (!task) return;
            var keepDate = addDate.value;
            var keepPriority = addPriorityBtn.getAttribute("data-priority");
            resetAddBar();
            // Keep the chosen date/priority so several similar tasks can be added quickly.
            addDate.value = keepDate;
            setDateChip(addDateChip, addDateText, keepDate, "");
            setPriority(addPriorityBtn, keepPriority);
            addTitle.focus();
            if (!matchesView(task, state.view)) toast("Added to " + listNameFor(task) + ".");
        });
    });

    function listNameFor(task) {
        if (!task.due_date) return "No Date";
        var today = todayISO();
        if (task.due_date < today) return "Overdue";
        if (task.due_date === today) return "Today";
        if (task.due_date <= addDays(today, 6)) return "Next 7 Days";
        return "All";
    }

    // The form has no visible submit button, so Enter has to be handled by hand.
    addTitle.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            addForm.requestSubmit ? addForm.requestSubmit() : addForm.dispatchEvent(new Event("submit", { cancelable: true }));
        }
    });

    addDate.addEventListener("change", function () {
        setDateChip(addDateChip, addDateText, addDate.value, "");
    });

    addPriorityBtn.addEventListener("click", function () {
        openPriorityPopover(addPriorityBtn, addPriorityBtn.getAttribute("data-priority"), function (p) {
            setPriority(addPriorityBtn, p);
        });
    });

    // ------------------------------------------------------------------
    // Task list events (delegated)
    // ------------------------------------------------------------------

    taskListEl.addEventListener("click", function (e) {
        var header = e.target.closest(".group-header");
        if (header) {
            var key = header.parentElement.getAttribute("data-group");
            state.collapsed[key] = !state.collapsed[key];
            renderList();
            return;
        }
        var row = e.target.closest(".task-row");
        if (!row) return;
        var id = Number(row.getAttribute("data-id"));
        if (e.target.closest(".check")) {
            toggleTask(id);
        } else {
            selectTask(id);
        }
    });

    // ------------------------------------------------------------------
    // Detail panel events
    // ------------------------------------------------------------------

    detailClose.addEventListener("click", function () { selectTask(null); });
    detailCheck.addEventListener("click", function () { if (state.selectedId) toggleTask(state.selectedId); });
    detailDelete.addEventListener("click", function () { if (state.selectedId) deleteTask(state.selectedId); });

    detailDate.addEventListener("change", function () {
        if (state.selectedId) updateTask(state.selectedId, { due_date: detailDate.value || null });
    });

    detailPriorityBtn.addEventListener("click", function () {
        openPriorityPopover(detailPriorityBtn, detailPriorityBtn.getAttribute("data-priority"), function (p) {
            if (state.selectedId) updateTask(state.selectedId, { priority: p });
        });
    });

    // Title / description: save shortly after the user stops typing, and on blur.
    var saveTimer = null;
    function scheduleTextSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveText, 600);
    }
    function saveText() {
        clearTimeout(saveTimer);
        var task = findTask(state.selectedId);
        if (!task) return;
        var title = detailTitle.value.trim();
        var description = detailDesc.value.trim();
        if (!title) {
            // An empty title is invalid; restore the previous one.
            detailTitle.value = task.title;
            return;
        }
        if (title === task.title && description === (task.description || "")) return;
        updateTask(task.id, { title: title, description: description });
    }
    detailTitle.addEventListener("input", scheduleTextSave);
    detailDesc.addEventListener("input", scheduleTextSave);
    detailTitle.addEventListener("blur", saveText);
    detailDesc.addEventListener("blur", saveText);
    detailTitle.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); saveText(); detailDesc.focus(); }
    });

    // ------------------------------------------------------------------
    // Priority popover
    // ------------------------------------------------------------------

    var popoverCallback = null;

    function openPriorityPopover(anchor, current, onPick) {
        popoverCallback = onPick;
        Array.prototype.forEach.call(popover.querySelectorAll(".popover-item"), function (item) {
            item.classList.toggle("active", item.getAttribute("data-priority") === current);
        });
        popover.classList.remove("hidden");

        var r = anchor.getBoundingClientRect();
        var w = popover.offsetWidth, h = popover.offsetHeight;
        var left = Math.min(r.left, window.innerWidth - w - 8);
        var top = r.bottom + 6;
        if (top + h > window.innerHeight - 8) top = r.top - h - 6;
        popover.style.left = Math.max(8, left) + "px";
        popover.style.top = Math.max(8, top) + "px";
    }

    function closePopover() {
        popover.classList.add("hidden");
        popoverCallback = null;
    }

    popover.addEventListener("click", function (e) {
        var item = e.target.closest(".popover-item");
        if (!item) return;
        var cb = popoverCallback;
        closePopover();
        if (cb) cb(item.getAttribute("data-priority"));
    });

    document.addEventListener("mousedown", function (e) {
        if (popover.classList.contains("hidden")) return;
        if (popover.contains(e.target) || e.target.closest(".flag-btn")) return;
        closePopover();
    });

    // ------------------------------------------------------------------
    // Sidebar, search, sort, theme, keyboard
    // ------------------------------------------------------------------

    sidebarEl.addEventListener("click", function (e) {
        var item = e.target.closest(".nav-item");
        if (item) setView(item.getAttribute("data-view"));
    });

    var searchTimer = null;
    searchInput.addEventListener("input", function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
            state.search = searchInput.value.trim();
            renderAll();
        }, 150);
    });

    sortSelect.addEventListener("change", function () {
        state.sort = sortSelect.value;
        try { localStorage.setItem("tm-sort", state.sort); } catch (err) {}
        renderList();
    });

    function openSidebar() { appEl.classList.add("sidebar-open"); }
    function closeSidebar() { appEl.classList.remove("sidebar-open"); }
    menuBtn.addEventListener("click", function () {
        appEl.classList.contains("sidebar-open") ? closeSidebar() : openSidebar();
    });
    scrim.addEventListener("click", function () {
        closeSidebar();
        if (window.innerWidth <= 900) selectTask(null);
    });

    function applyTheme(theme) {
        if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
        else document.documentElement.removeAttribute("data-theme");
        themeToggle.innerHTML = theme === "dark" ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon"></i>';
    }
    themeToggle.addEventListener("click", function () {
        var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        applyTheme(next);
        try { localStorage.setItem("tm-theme", next); } catch (err) {}
    });

    document.addEventListener("keydown", function (e) {
        var tag = (e.target.tagName || "").toLowerCase();
        var typing = tag === "input" || tag === "textarea" || tag === "select";
        if (e.key === "Escape") {
            if (!popover.classList.contains("hidden")) { closePopover(); return; }
            if (appEl.classList.contains("sidebar-open")) { closeSidebar(); return; }
            if (state.selectedId !== null) { selectTask(null); return; }
            if (typing) e.target.blur();
            return;
        }
        if (typing) return;
        if (e.key === "/") { e.preventDefault(); searchInput.focus(); }
        if (e.key === "n" || e.key === "N") { e.preventDefault(); addTitle.focus(); }
    });

    // ------------------------------------------------------------------
    // Toast & API helper
    // ------------------------------------------------------------------

    var toastTimer = null;
    function toast(message, isError) {
        toastEl.textContent = message;
        toastEl.classList.toggle("error", !!isError);
        toastEl.classList.remove("hidden");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.add("hidden"); }, isError ? 4000 : 2200);
    }

    function api(method, url, body) {
        var options = { method: method, headers: {} };
        if (body !== undefined) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }
        return fetch(url, options).then(function (res) {
            return res.json().catch(function () { return null; }).then(function (data) {
                if (!res.ok) {
                    throw new Error((data && data.error) || ("Request failed (" + res.status + ")"));
                }
                return data;
            });
        });
    }

    // ------------------------------------------------------------------
    // Start-up
    // ------------------------------------------------------------------

    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
    try {
        var savedSort = localStorage.getItem("tm-sort");
        if (savedSort) { state.sort = savedSort; sortSelect.value = savedSort; }
    } catch (err) {}

    // Show any flash messages left by the classic form routes.
    Array.prototype.forEach.call(document.querySelectorAll(".flash-msg"), function (el) {
        toast(el.textContent, el.getAttribute("data-category") === "error");
    });

    resetAddBar();
    renderAll();
    loadTasks();
})();
