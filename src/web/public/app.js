/* eslint-env browser */
/* global document, fetch */

const state = {
  selectedProjectId: null,
  editorProjectId: null,
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
  projectFeedback: document.querySelector('[data-field="project-feedback"]')
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
  projectSubmit: document.querySelector('[data-action="submit-project"]')
};

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
    return;
  }

  if (tasks.length === 0) {
    fields.tasksContext.textContent = 'No tasks yet — time to plan the next move.';
    const empty = document.createElement('li');
    empty.className = 'empty-state';
    empty.textContent = 'Tasks will appear here once they are added to the project.';
    elements.taskList.appendChild(empty);
    return;
  }

  fields.tasksContext.textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'} linked to this project.`;

  for (const task of tasks) {
    const item = document.createElement('li');
    item.className = 'task-card';

    const heading = document.createElement('h3');
    heading.textContent = task.title;

    const status = document.createElement('span');
    status.className = 'status-pill';
    status.dataset.status = task.status;
    status.textContent = task.status.replace(/_/g, ' ');

    const notes = document.createElement('p');
    notes.textContent = task.notes || 'No notes yet.';

    item.append(heading, status);

    if (task.assignees?.length) {
      const assignees = document.createElement('p');
      assignees.textContent = `Assigned to: ${task.assignees.join(', ')}`;
      item.append(assignees);
    }

    item.append(notes);
    elements.taskList.appendChild(item);
  }
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
  const project = state.projects.find((item) => item.id === projectId);
  if (project) {
    setEditorProject(project);
  }
  renderProjects(state.projects);
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

document.addEventListener('DOMContentLoaded', () => {
  resetProjectEditor();
  refresh();
});
