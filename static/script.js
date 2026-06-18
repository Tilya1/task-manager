/*
 * script.js
 * ---------
 * Small amount of browser-side JavaScript that powers:
 *
 *   1. openAddModal()    -> prepares the shared modal for creating a new task
 *   2. openEditModal(id) -> fetches a task from the server and pre-fills the
 *                           modal so it can be edited
 *   3. confirmDelete()   -> shows a confirmation dialog before deleting
 *
 * The modal markup lives in templates/index.html. We simply change its
 * title, its form `action` URL, and its field values from here.
 */

// Grab the elements we need once, so we don't look them up repeatedly.
const taskForm = document.getElementById("taskForm");
const taskModalLabel = document.getElementById("taskModalLabel");
const statusWrapper = document.getElementById("statusWrapper");

/**
 * Prepare the modal for ADDING a new task.
 * Called when the top "Add Task" button is clicked.
 */
function openAddModal() {
    // Point the form at the /add route.
    taskForm.action = "/add";
    taskModalLabel.textContent = "Add Task";

    // Reset every field to its default value.
    taskForm.reset();
    document.getElementById("priority").value = "Medium";

    // Status only matters when editing, so hide it for new tasks.
    statusWrapper.style.display = "none";
}

/**
 * Prepare the modal for EDITING an existing task.
 * Called with the task's id when an "Edit" button is clicked.
 *
 * We ask the server for the task's current data (as JSON) and copy each
 * value into the form so the user sees the existing values pre-filled.
 */
function openEditModal(taskId) {
    // Point the form at the /edit/<id> route.
    taskForm.action = "/edit/" + taskId;
    taskModalLabel.textContent = "Edit Task";

    // Status is relevant when editing, so make it visible.
    statusWrapper.style.display = "block";

    // Fetch the task data from our small JSON API and fill in the form.
    fetch("/api/task/" + taskId)
        .then(function (response) {
            if (!response.ok) {
                throw new Error("Could not load task.");
            }
            return response.json();
        })
        .then(function (task) {
            document.getElementById("title").value = task.title || "";
            document.getElementById("description").value = task.description || "";
            document.getElementById("priority").value = task.priority || "Medium";
            document.getElementById("due_date").value = task.due_date || "";
            document.getElementById("status").value = task.status || "Pending";
        })
        .catch(function (error) {
            // If something goes wrong, tell the user instead of failing silently.
            alert(error.message);
        });
}

/**
 * Ask the user to confirm before a task is deleted.
 * Returning false stops the form from submitting.
 *
 * @param {Event} event - the form submit event
 * @returns {boolean} true if the user confirmed, false otherwise
 */
function confirmDelete(event) {
    const confirmed = confirm("Are you sure you want to delete this task? This cannot be undone.");
    if (!confirmed) {
        event.preventDefault(); // stop the form submission
        return false;
    }
    return true;
}
