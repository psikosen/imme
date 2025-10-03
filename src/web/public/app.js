/* eslint-env browser */
/* global document, fetch */

const state = {
  selectedProjectId: null,
  projects: [],
  tasks: []
};

const fields = {
  name: document.querySelector('[data-field="workspace-name"]'),
  environment: document.querySelector('[data-field="workspace-environment"]'),
  logPath: document.querySelector('[data-field="workspace-log"]'),
  database: document.querySelector('[data-field="workspace-database"]'),
  updated: document.querySelector('[data-field="workspace-updated"]'),
  tasksContext: document.querySelector('[data-field="tasks-context"]')
};

const elements = {
  refresh: document.querySelector('.refresh-button'),
  projectList: document.querySelector('.project-list'),
  taskList: document.querySelector('.task-list')
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
    empty.textContent = 'No projects yet. Create one via the CLI to get started.';
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
  renderProjects(state.projects);
  await loadTasks(projectId);
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

document.addEventListener('DOMContentLoaded', () => {
  refresh();
});
