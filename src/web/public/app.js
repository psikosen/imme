/* eslint-env browser */
/* global document, fetch, window */

const state = {
  selectedProjectId: null,
  editorProjectId: null,
  editorTaskId: null,
  projects: [],
  tasks: []
};

const fields = {
  name: document.querySelector('[data-field="workspace-name"]'),
  environment: document.querySelector('[data-field="workspace-environment"]'),
  logPath: document.querySelector('[data-field="workspace-log"]'),
  database: document.querySelector('[data-field="workspace-database"]'),
  updated: document.querySelector('[data-field="workspace-updated"]'),
  tasksContext: document.querySelector('[data-field="tasks-context"]'),
  editorMode: document.querySelector('[data-field="editor-mode"]'),
  projectFeedback: document.querySelector('[data-field="project-feedback"]'),
  taskEditorMode: document.querySelector('[data-field="task-editor-mode"]'),
  taskFeedback: document.querySelector('[data-field="task-feedback"]')
};

const elements = {
  refresh: document.querySelector('.refresh-button'),
  projectList: document.querySelector('.project-list'),
  taskList: document.querySelector('.task-list'),
  projectForm: document.querySelector('.project-form'),
  projectName: document.querySelector('[name="project-name"]'),
  projectDescription: document.querySelector('[name="project-description"]'),
  projectStatus: document.querySelector('[name="project-status"]'),
  projectReset: document.querySelector('[data-action="reset-editor"]'),
  projectSubmit: document.querySelector('[data-action="submit-project"]'),
  taskForm: document.querySelector('.task-form'),
  taskTitle: document.querySelector('[name="task-title"]'),
  taskStatus: document.querySelector('[name="task-status"]'),
  taskAssignees: document.querySelector('[name="task-assignees"]'),
  taskNotes: document.querySelector('[name="task-notes"]'),
  taskSubmit: document.querySelector('[data-action="submit-task"]'),
  taskReset: document.querySelector('[data-action="reset-task"]'),
  taskDelete: document.querySelector('[data-action="delete-task"]')
};

let taskFormBusy = false;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}

function formatDate(value) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function populateEditorFields(project) {
  if (!elements.projectForm) {
    return;
  }

  elements.projectName.value = project?.name ?? '';
  elements.projectDescription.value = project?.description ?? '';
  elements.projectStatus.value = project?.status ?? 'proposed';
}

function updateEditorModeCopy() {
  if (!fields.editorMode || !elements.projectSubmit || !elements.projectReset) {
    return;
  }

  if (state.editorProjectId) {
    fields.editorMode.textContent = 'Editing the selected project. Changes persist immediately after saving.';
    elements.projectSubmit.textContent = 'Update Project';
    elements.projectReset.textContent = 'Switch to Create Mode';
  } else {
    fields.editorMode.textContent = 'Create a new project to track upcoming work.';
    elements.projectSubmit.textContent = 'Create Project';
    elements.projectReset.textContent = 'Clear';
  }
}

function setEditorProject(project) {
  state.editorProjectId = project?.id ?? null;
  populateEditorFields(project ?? null);
  updateEditorModeCopy();
}

function resetProjectEditor() {
  setEditorProject(null);
  clearProjectFeedback();
  resetTaskEditor();
}

function clearProjectFeedback() {
  if (!fields.projectFeedback) {
    return;
  }
  fields.projectFeedback.textContent = '';
  delete fields.projectFeedback.dataset.variant;
}

function showProjectFeedback(message, variant = 'info') {
  if (!fields.projectFeedback) {
    return;
  }
  fields.projectFeedback.textContent = message;
  fields.projectFeedback.dataset.variant = variant;
}

function setProjectFormBusy(isBusy) {
  if (!elements.projectForm) {
    return;
  }
  if (isBusy) {
    elements.projectForm.setAttribute('aria-busy', 'true');
  } else {
    elements.projectForm.removeAttribute('aria-busy');
  }
  elements.projectSubmit.disabled = isBusy;
  elements.projectReset.disabled = isBusy;
}

function renderWorkspaceSummary(workspace) {
  fields.name.textContent = workspace.name;
  fields.environment.textContent = workspace.environment;
  fields.logPath.textContent = workspace.logPath ?? '—';
  fields.database.textContent = `${workspace.database.client} → ${workspace.databasePath}`;
  fields.updated.textContent = formatDate(workspace.lastUpdated);
}

function renderProjects(projects) {
  elements.projectList.innerHTML = '';
  if (projects.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'No projects yet. Use the editor below to create your first project.';
    elements.projectList.appendChild(empty);
    return;
  }

  for (const project of projects) {
    const item = document.createElement('li');
    item.className = 'project-card';
    if (project.id === state.selectedProjectId) {
      item.classList.add('active');
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-project-id', project.id);
    button.addEventListener('click', () => selectProject(project.id));

    const heading = document.createElement('h3');
    heading.textContent = project.name;
    const description = document.createElement('p');
    description.textContent = project.description || 'No description yet.';

    const status = document.createElement('span');
    status.className = 'status-pill';
    status.dataset.status = project.status;
    status.textContent = project.status.replace(/_/g, ' ');

    button.append(heading, description, status);
    item.append(button);
    elements.projectList.appendChild(item);
  }
}

function renderTasks(tasks) {
  elements.taskList.innerHTML = '';
  if (!state.selectedProjectId) {
    fields.tasksContext.textContent = 'Choose a project to load its tasks.';
    updateTaskEditorModeCopy();
    return;
  }

  if (tasks.length === 0) {
    fields.tasksContext.textContent = 'No tasks yet — time to plan the next move.';
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Tasks will appear here once they are added to the project.';
    elements.taskList.appendChild(empty);
    updateTaskEditorModeCopy();
    return;
  }

  fields.tasksContext.textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'} linked to this project.`;

  for (const task of tasks) {
    const item = document.createElement('li');
    item.className = 'task-card';
    if (task.id === state.editorTaskId) {
      item.classList.add('active');
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-task-id', task.id);
    button.addEventListener('click', () => setTaskEditor(task));

    const heading = document.createElement('h3');
    heading.textContent = task.title;

    const status = document.createElement('span');
    status.className = 'status-pill';
    status.dataset.status = task.status;
    status.textContent = task.status.replace(/_/g, ' ');

    const notes = document.createElement('p');
    notes.textContent = task.notes || 'No notes yet.';

    button.append(heading, status, notes);

    if (task.assignees?.length) {
      const assignees = document.createElement('p');
      assignees.textContent = `Assigned to: ${task.assignees.join(', ')}`;
      button.append(assignees);
    }

    item.append(button);
    elements.taskList.appendChild(item);
  }

  updateTaskEditorModeCopy();
}

function showTasksLoadingState() {
  if (!fields.tasksContext || !elements.taskList) {
    return;
  }

  fields.tasksContext.textContent = 'Loading tasks…';
  elements.taskList.innerHTML = '';
}

async function loadWorkspace() {
  const { workspace } = await fetchJson('/api/workspace');
  renderWorkspaceSummary(workspace);
}

async function loadProjects() {
  const { projects } = await fetchJson('/api/projects');
  state.projects = projects;
  if (state.selectedProjectId && !projects.some((project) => project.id === state.selectedProjectId)) {
    state.selectedProjectId = null;
    state.tasks = [];
    resetProjectEditor();
  } else if (state.editorProjectId) {
    const project = projects.find((item) => item.id === state.editorProjectId);
    if (project) {
      populateEditorFields(project);
    } else {
      resetProjectEditor();
    }
  } else {
    updateEditorModeCopy();
  }
  renderProjects(projects);
  syncTaskFormEnabled();
  if (state.selectedProjectId) {
    await loadTasks(state.selectedProjectId);
  } else {
    renderTasks([]);
  }
}

async function loadTasks(projectId) {
  const { tasks } = await fetchJson(`/api/projects/${projectId}/tasks`);
  state.tasks = tasks;
  renderTasks(tasks);
}

async function selectProject(projectId) {
  state.selectedProjectId = projectId;
  state.tasks = [];
  showTasksLoadingState();
  resetTaskEditor({ skipRender: true });
  const project = state.projects.find((item) => item.id === projectId);
  if (project) {
    setEditorProject(project);
  }
  renderProjects(state.projects);
  syncTaskFormEnabled();
  await loadTasks(projectId);
}

async function handleProjectSubmit(event) {
  event.preventDefault();
  clearProjectFeedback();

  const name = elements.projectName.value.trim();
  const description = elements.projectDescription.value.trim();
  const status = elements.projectStatus.value;

  if (!name) {
    showProjectFeedback('Project name is required.', 'error');
    elements.projectName.focus();
    return;
  }

  const payload = { name, description, status };
  setProjectFormBusy(true);

  try {
    const endpoint = state.editorProjectId ? `/api/projects/${state.editorProjectId}` : '/api/projects';
    const method = state.editorProjectId ? 'PUT' : 'POST';
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      throw new Error(result.error ?? `Request failed with status ${response.status}`);
    }

    if (!result.project) {
      throw new Error('Unexpected API response: missing project payload.');
    }

    const successMessage = state.editorProjectId ? 'Project updated successfully.' : 'Project created successfully.';
    showProjectFeedback(successMessage, 'success');

    state.selectedProjectId = result.project.id;
    setEditorProject(result.project);

    try {
      await loadProjects();
    } catch (refreshError) {
      console.error('Project saved but refresh failed:', refreshError);
      showProjectFeedback(`${successMessage} Refresh failed: ${refreshError.message}`, 'warning');
    }
  } catch (error) {
    console.error('Project submission failed:', error);
    showProjectFeedback(error.message, 'error');
  } finally {
    setProjectFormBusy(false);
  }
}

function parseAssigneesInput(value) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function populateTaskEditorFields(task) {
  if (!elements.taskForm) {
    return;
  }

  elements.taskTitle.value = task?.title ?? '';
  elements.taskStatus.value = task?.status ?? 'todo';
  elements.taskAssignees.value = task?.assignees?.join(', ') ?? '';
  elements.taskNotes.value = task?.notes ?? '';
}

function updateTaskEditorModeCopy() {
  if (!fields.taskEditorMode || !elements.taskSubmit) {
    return;
  }

  if (!state.selectedProjectId) {
    fields.taskEditorMode.textContent = 'Select a project to enable the task editor.';
    return;
  }

  if (state.editorTaskId) {
    fields.taskEditorMode.textContent = 'Editing an existing task. Save to persist your updates.';
    elements.taskSubmit.textContent = 'Update Task';
    if (elements.taskReset) {
      elements.taskReset.textContent = 'Switch to Create Mode';
    }
  } else {
    fields.taskEditorMode.textContent = 'Create a new task for the selected project.';
    elements.taskSubmit.textContent = 'Create Task';
    if (elements.taskReset) {
      elements.taskReset.textContent = 'Clear';
    }
  }
}

function clearTaskFeedback() {
  if (!fields.taskFeedback) {
    return;
  }
  fields.taskFeedback.textContent = '';
  delete fields.taskFeedback.dataset.variant;
}

function showTaskFeedback(message, variant = 'info') {
  if (!fields.taskFeedback) {
    return;
  }
  fields.taskFeedback.textContent = message;
  fields.taskFeedback.dataset.variant = variant;
}

function syncTaskFormEnabled() {
  if (!elements.taskForm) {
    return;
  }

  const shouldEnable = Boolean(state.selectedProjectId) && !taskFormBusy;
  const controls = elements.taskForm.querySelectorAll('input, textarea, select, button');
  for (const control of controls) {
    control.disabled = !shouldEnable;
  }

  if (shouldEnable) {
    elements.taskForm.removeAttribute('aria-disabled');
  } else {
    elements.taskForm.setAttribute('aria-disabled', 'true');
  }

  if (elements.taskDelete) {
    elements.taskDelete.disabled = !shouldEnable || !state.editorTaskId;
  }
}

function setTaskFormBusy(isBusy) {
  if (!elements.taskForm) {
    return;
  }
  taskFormBusy = isBusy;
  if (isBusy) {
    elements.taskForm.setAttribute('aria-busy', 'true');
  } else {
    elements.taskForm.removeAttribute('aria-busy');
  }
  syncTaskFormEnabled();
}

function setTaskEditor(task) {
  state.editorTaskId = task?.id ?? null;
  populateTaskEditorFields(task ?? null);
  clearTaskFeedback();
  updateTaskEditorModeCopy();
  renderTasks(state.tasks);
  syncTaskFormEnabled();
}

function resetTaskEditor({ skipRender = false } = {}) {
  state.editorTaskId = null;
  populateTaskEditorFields(null);
  clearTaskFeedback();
  updateTaskEditorModeCopy();
  syncTaskFormEnabled();
  if (!skipRender) {
    renderTasks(state.tasks);
  }
}

async function handleTaskSubmit(event) {
  event.preventDefault();
  clearTaskFeedback();

  if (!state.selectedProjectId) {
    showTaskFeedback('Select a project before creating tasks.', 'error');
    return;
  }

  const title = elements.taskTitle.value.trim();
  if (!title) {
    showTaskFeedback('Task title is required.', 'error');
    elements.taskTitle.focus();
    return;
  }

  const payload = {
    title,
    status: elements.taskStatus.value,
    assignees: parseAssigneesInput(elements.taskAssignees.value),
    notes: elements.taskNotes.value
  };

  const endpoint = state.editorTaskId
    ? `/api/tasks/${state.editorTaskId}`
    : `/api/projects/${state.selectedProjectId}/tasks`;
  const method = state.editorTaskId ? 'PUT' : 'POST';

  setTaskFormBusy(true);

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let result = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok) {
      throw new Error(result.error ?? `Request failed with status ${response.status}`);
    }

    if (!result.task) {
      throw new Error('Unexpected API response: missing task payload.');
    }

    const successMessage = state.editorTaskId ? 'Task updated successfully.' : 'Task created successfully.';
    showTaskFeedback(successMessage, 'success');

    state.editorTaskId = result.task.id;
    populateTaskEditorFields(result.task);
    updateTaskEditorModeCopy();

    try {
      await loadTasks(state.selectedProjectId);
    } catch (refreshError) {
      console.error('Task saved but refresh failed:', refreshError);
      showTaskFeedback(`${successMessage} Refresh failed: ${refreshError.message}`, 'warning');
    }
  } catch (error) {
    console.error('Task submission failed:', error);
    showTaskFeedback(error.message, 'error');
  } finally {
    setTaskFormBusy(false);
  }
}

async function handleTaskDelete(event) {
  event.preventDefault();
  clearTaskFeedback();

  if (!state.selectedProjectId || !state.editorTaskId) {
    showTaskFeedback('Select an existing task before deleting.', 'error');
    return;
  }

  const confirmed = window.confirm('Delete this task? This action cannot be undone.');
  if (!confirmed) {
    return;
  }

  setTaskFormBusy(true);

  try {
    const response = await fetch(`/api/tasks/${state.editorTaskId}`, {
      method: 'DELETE'
    });

    if (response.status === 404) {
      throw new Error('Task not found. It may have already been deleted.');
    }

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    showTaskFeedback('Task deleted successfully.', 'success');
    resetTaskEditor({ skipRender: true });

    try {
      await loadTasks(state.selectedProjectId);
    } catch (refreshError) {
      console.error('Task deleted but refresh failed:', refreshError);
      showTaskFeedback(`Task deleted. Refresh failed: ${refreshError.message}`, 'warning');
    }
  } catch (error) {
    console.error('Task deletion failed:', error);
    showTaskFeedback(error.message, 'error');
  } finally {
    setTaskFormBusy(false);
  }
}

async function refresh() {
  try {
    elements.refresh.setAttribute('aria-busy', 'true');
    elements.refresh.disabled = true;
    await Promise.all([loadWorkspace(), loadProjects()]);
  } catch (error) {
    console.error('Failed to refresh workspace:', error);
    fields.tasksContext.textContent = 'Something went wrong. Check the logs and try again.';
  } finally {
    elements.refresh.disabled = false;
    elements.refresh.removeAttribute('aria-busy');
  }
}

elements.refresh.addEventListener('click', () => {
  refresh();
});

if (elements.projectForm) {
  elements.projectForm.addEventListener('submit', handleProjectSubmit);
}

if (elements.projectReset) {
  elements.projectReset.addEventListener('click', (event) => {
    event.preventDefault();
    resetProjectEditor();
  });
}

if (elements.taskForm) {
  elements.taskForm.addEventListener('submit', handleTaskSubmit);
}

if (elements.taskReset) {
  elements.taskReset.addEventListener('click', (event) => {
    event.preventDefault();
    if (state.editorTaskId) {
      resetTaskEditor();
    } else {
      populateTaskEditorFields(null);
      clearTaskFeedback();
      updateTaskEditorModeCopy();
    }
  });
}

if (elements.taskDelete) {
  elements.taskDelete.addEventListener('click', handleTaskDelete);
}

document.addEventListener('DOMContentLoaded', () => {
  resetProjectEditor();
  resetTaskEditor();
  refresh();
});
