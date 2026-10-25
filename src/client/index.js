/**
 * Client Entry Point for Naya Overleaf
 */

import './styles/tokens.css';
import './styles/themes.css';
import './styles/main.css';
import { dispatchToastNotification } from './react/overlays/notificationBridge';
import { mountReactIslands } from './react/bootstrap/mountReactIslands';

const clientEnv = typeof process !== 'undefined' ? process.env || {} : {};

window.AI_SERVICE_URL = clientEnv.AI_SERVICE_URL || '/api/ai';
window.AI_ENABLED = clientEnv.AI_ENABLED !== 'false';

let editor = null;
let pdfPreview = null;
let aiChatSidebar = null;
let LatexEditorClass = null;
let PdfPreviewClass = null;
let currentDocumentId = null;
let currentProjectId = null;
let currentProject = null;
let openingProjectId = null;
let projectsCache = [];
let pendingDocumentProjectId = null;
let socket = null;

const LATEX_PREAMBLE = `\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{geometry}
\\geometry{margin=1in}
`;

const LATEX_TEMPLATES = {
  article: `\\documentclass[12pt]{article}
${LATEX_PREAMBLE}
\\title{Untitled Document}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}

Start writing your document here.

\\end{document}
`,
  report: `\\documentclass[12pt]{report}
${LATEX_PREAMBLE}
\\title{Untitled Report}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle
\\tableofcontents

\\chapter{Introduction}

Start writing your report here.

\\end{document}
`,
  book: `\\documentclass[12pt]{book}
${LATEX_PREAMBLE}
\\title{Untitled Book}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\frontmatter
\\maketitle
\\tableofcontents

\\mainmatter
\\chapter{Introduction}

Start writing your book here.

\\end{document}
`,
  presentation: `\\documentclass{beamer}
\\usetheme{default}

\\title{Untitled Presentation}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{Introduction}
Start writing your presentation here.
\\end{frame}

\\end{document}
`
};

const DEFAULT_LATEX_TEMPLATE = LATEX_TEMPLATES.article;

document.addEventListener('DOMContentLoaded', async () => {
  mountReactIslands();
  await loadRuntimeConfig();
  setupUI();
  checkAuth();
  setupModals();
  connectSocket();
});

async function loadRuntimeConfig() {
  try {
    const response = await fetch('/api/config', {
      headers: { Accept: 'application/json' },
      credentials: 'include'
    });

    if (!response.ok) {
      return;
    }

    const config = await response.json();
    window.AI_ENABLED = config.aiEnabled !== false;
    window.AI_SERVICE_URL = config.aiServiceUrl || '/api/ai';
  } catch (error) {
    console.error('Failed to load runtime configuration:', error.message);
  }
}

function setupUI() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = e.target.getAttribute('data-target');
      navigateTo(target);
    });
  });
  
  const compileButton = document.getElementById('compile-button');
  if (compileButton) {
    compileButton.addEventListener('click', () => {
      if (currentDocumentId) {
        compileDocument(currentDocumentId);
      }
    });
  }
  
  const newProjectButton = document.getElementById('new-project-button');
  if (newProjectButton) {
    newProjectButton.addEventListener('click', () => {
      showNewProjectModal();
    });
  }
  
  const aiKeysLink = document.querySelector('.nav-link[data-target="ai-keys"]');
  if (aiKeysLink) {
    aiKeysLink.parentElement.style.display = window.AI_ENABLED ? '' : 'none';
  }

  if (window.AI_ENABLED) {
    initAiComponents();
  }

  updateWorkspaceHeader();
}

function initAiComponents() {
  import('./editor/AiChatSidebar.js').then(module => {
    const AiChatSidebarClass = module.default || module.AiChatSidebar || window.AiChatSidebar;
    aiChatSidebar = new AiChatSidebarClass({
      editor,
      userId: window.currentUserId || 'dev-user-123',
      getDocumentContent: () => (editor ? editor.getContent() : '')
    });
    
    const aiChatBtn = document.createElement('button');
    aiChatBtn.className = 'btn btn-sm';
    aiChatBtn.id = 'ai-chat-button';
    aiChatBtn.innerHTML = '🤖 AI Chat';
    aiChatBtn.style.marginLeft = 'auto';
    
    const header = document.querySelector('.header .user-info');
    if (header) {
      header.insertBefore(aiChatBtn, header.firstChild);
    }
    
    aiChatBtn.addEventListener('click', () => {
      if (aiChatSidebar) {
        aiChatSidebar.toggle();
      }
    });
  }).catch(err => {
    console.error('Failed to load AI chat:', err);
  });
}

function updateWorkspaceHeader() {
  const projectNameElement = document.getElementById('workspace-project-name');
  const documentNameElement = document.getElementById('workspace-document-name');
  const compileButton = document.getElementById('compile-button');

  if (projectNameElement) {
    projectNameElement.textContent = currentProject?.name || 'No project open';
  }

  if (documentNameElement) {
    const currentDocument = currentProject?.documents?.find(doc => doc._id === currentDocumentId);
    documentNameElement.textContent = currentDocument?.name || (currentProject ? 'Choose a file' : 'Select a project');
  }

  if (compileButton) {
    compileButton.disabled = !currentDocumentId;
  }
}

function connectSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = io(`${protocol}//${window.location.host}`, {
    transports: ['websocket']
  });
  
  socket.on('connect', () => {
    console.log('Connected to server');
    if (currentDocumentId) {
      socket.emit('join-document', currentDocumentId);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
  
  socket.on('connect_error', (error) => {
    console.error('Realtime connection failed:', error.message);
  });

  socket.on('realtime-error', (data) => {
    if (data?.error) {
      showNotification(data.error, 'error');
    }
  });

  socket.on('compilation-complete', async (data) => {
    if (data.documentId !== currentDocumentId) {
      return;
    }

    const preview = await ensurePdfPreview();
    if (!preview) {
      return;
    }

    if (data.type === 'failed') {
      preview.showError(
        'Compilation failed: ' + (data.error || 'Unknown error')
      );
      return;
    }

    preview.loadPdf(`/api/documents/${data.documentId}/pdf?jobId=${data.jobId}`);
  });
}

async function checkAuth() {
  try {
    const response = await fetch('/auth/profile', {
      credentials: 'include'
    });
    
    if (response.ok) {
      const userData = await response.json();
      updateUserInfo(userData);
      loadProjects();
    } else {
      navigateTo('login');
    }
  } catch (error) {
    console.error('Error checking authentication:', error);
    navigateTo('login');
  }
}

function updateUserInfo(userData) {
  const userNameElement = document.getElementById('user-name');
  if (userNameElement) {
    userNameElement.textContent = userData.name || userData.email || 'User';
  }
}

async function loadProjects() {
  try {
    const response = await fetch('/api/projects', {
      credentials: 'include'
    });
    
    if (response.ok) {
      const projects = await response.json();
      projectsCache = projects;
      displayProjects(projects);
    } else {
      console.error('Error loading projects');
    }
  } catch (error) {
    console.error('Error loading projects:', error);
  }
}

function displayProjects(projects) {
  const projectsList = document.getElementById('projects-list');
  if (!projectsList) return;

  projectsCache = projects;
  
  projectsList.innerHTML = '';
  
  if (projects.length === 0) {
    projectsList.innerHTML = `
      <div class="empty-state empty-state-panel">
        <strong>No projects yet</strong>
        <span>Create a new project to start editing.</span>
      </div>
    `;
    return;
  }
  
  projects.forEach(project => {
    const projectItem = document.createElement('button');
    projectItem.className = 'project-item';
    projectItem.type = 'button';
    projectItem.dataset.projectId = project._id;
    const isActiveProject = currentProjectId === project._id;
    const isOpeningProject = openingProjectId === project._id;

    if (currentProjectId === project._id) {
      projectItem.classList.add('active');
    }
    if (isOpeningProject) {
      projectItem.classList.add('is-loading');
      projectItem.disabled = true;
    }

    const updatedAt = project.updatedAt ? new Date(project.updatedAt).toLocaleString() : 'Unknown';
    const fileCount = Array.isArray(project.documents) ? project.documents.length : project.documentCount;
    const fileCountLabel = Number.isFinite(fileCount) ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : 'Project';

    projectItem.setAttribute('aria-pressed', isActiveProject ? 'true' : 'false');
    projectItem.innerHTML = `
      <span class="project-item-main">
        <span class="project-name">${escapeHtml(project.name)}</span>
        <span class="project-meta">
          <span>${fileCountLabel}</span>
          <span>Updated ${escapeHtml(updatedAt)}</span>
        </span>
      </span>
      <span class="project-open-label">${isOpeningProject ? 'Opening...' : isActiveProject ? 'Open' : 'Open'}</span>
    `;
    
    projectItem.addEventListener('click', () => {
      loadProject(project._id);
    });
    
    projectsList.appendChild(projectItem);
  });
}

async function loadProject(projectId, preferredDocumentId = null) {
  if (openingProjectId === projectId) {
    return;
  }

  openingProjectId = projectId;
  displayProjects(projectsCache);
  updateWorkspaceHeader();

  try {
    const response = await fetch(`/api/projects/${projectId}`, {
      credentials: 'include'
    });
    
    if (response.ok) {
      currentProject = await response.json();
      currentProjectId = projectId;
      
      displayProjectDocuments(currentProject);
      
      const preferredDocument = preferredDocumentId
        ? currentProject.documents?.find(d => d._id === preferredDocumentId)
        : null;
      const mainDocument = preferredDocument || currentProject.documents?.find(d => d.name.endsWith('.tex')) || currentProject.documents?.[0];
      
      if (mainDocument) {
        await loadDocument(mainDocument._id);
      } else {
        await createDefaultDocument(projectId);
      }

      loadProjects();
    } else {
      console.error('Error loading project');
      showNotification('Failed to load project', 'error');
    }
  } catch (error) {
    console.error('Error loading project:', error);
    showNotification('Failed to load project', 'error');
  } finally {
    openingProjectId = null;
    updateWorkspaceHeader();
    displayProjects(projectsCache);
  }
}

function displayProjectDocuments(project) {
  let documentsList = document.getElementById('documents-list');
  
  if (!documentsList) {
    documentsList = document.createElement('div');
    documentsList.id = 'documents-list';
    documentsList.className = 'documents-list';
    
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      const projectsHeader = document.querySelector('.projects-header');
      if (projectsHeader) {
        projectsHeader.insertAdjacentElement('afterend', documentsList);
      }
    }
  }
  
  documentsList.hidden = false;
  documentsList.style.display = '';
  documentsList.innerHTML = '';
  
  const header = document.createElement('div');
  header.className = 'documents-header';
  header.innerHTML = `
    <h3>Files</h3>
    <span>${escapeHtml(project.name)}</span>
  `;
  documentsList.appendChild(header);

  if (!project.documents || project.documents.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state empty-state-panel';
    emptyState.innerHTML = `
      <strong>No files</strong>
      <span>Add a .tex file to start editing.</span>
    `;
    documentsList.appendChild(emptyState);
  }
  
  (project.documents || []).forEach(doc => {
    const docItem = document.createElement('button');
    docItem.className = 'document-item';
    docItem.type = 'button';
    docItem.dataset.documentId = doc._id;
    if (currentDocumentId === doc._id) {
      docItem.classList.add('active');
    }
    
    const icon = doc.name.endsWith('.tex') ? 'TEX' :
                 doc.name.endsWith('.bib') ? 'BIB' :
                 doc.name.endsWith('.cls') ? 'CLS' : 'FILE';
    
    docItem.innerHTML = `
      <span class="doc-icon">${icon}</span>
      <span class="doc-name">${escapeHtml(doc.name)}</span>
    `;
    
    docItem.addEventListener('click', () => {
      loadDocument(doc._id);
    });
    
    documentsList.appendChild(docItem);
  });
  
  const addDocBtn = document.createElement('button');
  addDocBtn.className = 'btn btn-sm add-document-btn';
  addDocBtn.type = 'button';
  addDocBtn.textContent = 'Add File';
  addDocBtn.addEventListener('click', () => {
    showNewDocumentModal(project._id);
  });
  documentsList.appendChild(addDocBtn);
  updateWorkspaceHeader();
}

async function createDefaultDocument(projectId) {
  try {
    const response = await fetch('/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        name: 'main.tex',
        content: LATEX_TEMPLATES[currentProject?.template] || DEFAULT_LATEX_TEMPLATE,
        projectId
      })
    });
    
    if (response.ok) {
      const doc = await response.json();
      const documents = currentProject?.documents || [];
      currentProject = {
        ...(currentProject || { _id: projectId, name: 'Project' }),
        documents: [...documents, doc]
      };
      currentProjectId = projectId;
      await loadDocument(doc._id);
      displayProjectDocuments(currentProject);
      loadProjects();
    }
  } catch (error) {
    console.error('Error creating default document:', error);
  }
}

function teardownEditor() {
  if (aiChatSidebar) {
    aiChatSidebar.editor = null;
  }

  if (editor) {
    editor.destroy();
    editor = null;
  }
}

async function loadLatexEditorClass() {
  if (!LatexEditorClass) {
    const module = await import('./editor/LatexEditor');
    LatexEditorClass = module.default;
  }

  return LatexEditorClass;
}

async function ensurePdfPreview() {
  if (pdfPreview) {
    return pdfPreview;
  }

  const pdfContainer = document.getElementById('pdf-preview');
  if (!pdfContainer) {
    return null;
  }

  if (!PdfPreviewClass) {
    const module = await import('./pdf/PdfPreview');
    PdfPreviewClass = module.default;
  }

  pdfPreview = new PdfPreviewClass(pdfContainer, {
    getEditor: () => editor,
    getCurrentDocumentId: () => currentDocumentId,
    onNotify: showNotification,
    onCompile: compileDocument
  });

  return pdfPreview;
}

async function loadDocument(documentId) {
  try {
    teardownEditor();
    
    currentDocumentId = documentId;
    updateWorkspaceHeader();
    
    const editorContainer = document.getElementById('latex-editor');
    if (editorContainer) {
      editorContainer.innerHTML = '';
    }
    
    const LatexEditor = await loadLatexEditorClass();
    editor = new LatexEditor(editorContainer, documentId, {
      lineNumbers: true,
      autoCloseBrackets: true,
      trackChanges: true
    });

    await editor.ready;

    if (aiChatSidebar && editor.view) {
      aiChatSidebar.editor = editor.view;
      aiChatSidebar.documentContent = editor.getContent();
    }
    
    if (socket) {
      socket.emit('join-document', documentId);
    }

    await ensurePdfPreview();
    await loadLatestCompilation(documentId);
    
    displayProjectDocuments(currentProject);
    updateWorkspaceHeader();
    
  } catch (error) {
    console.error('Error loading document:', error);
    showNotification('Failed to load document', 'error');
  }
}

async function loadLatestCompilation(documentId) {
  try {
    const response = await fetch(`/api/compile/status/${documentId}/latest`, {
      credentials: 'include'
    });
    
    if (response.ok) {
      const job = await response.json();
      if (job.status === 'completed' && pdfPreview) {
        pdfPreview.loadPdf(`/api/documents/${documentId}/pdf`);
      } else if (job.status === 'failed' && pdfPreview) {
        const detail = job.logTail || job.stderr || job.stdout || '';
        pdfPreview.showError(
          'Compilation failed: ' + (job.error || 'Unknown error') + (detail ? `\n\n${detail}` : '')
        );
      }
    }
  } catch (error) {
    console.log('No previous compilation found');
  }
}

async function compileDocument(documentId) {
  try {
    await ensurePdfPreview();

    if (pdfPreview) {
      pdfPreview.showLoading();
    }
    
    const response = await fetch(`/api/compile/${documentId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        compiler: 'pdflatex'
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      
      if (pdfPreview) {
        await pdfPreview.loadPdfFromCompilation(result.jobId);
      }
      
      showNotification('Compilation started', 'success');
    } else {
      const error = await response.json();
      showNotification(error.error || 'Compilation failed', 'error');
      if (pdfPreview) {
        pdfPreview.hideLoading();
      }
    }
  } catch (error) {
    console.error('Error compiling document:', error);
    showNotification('Failed to compile document', 'error');
    if (pdfPreview) {
      pdfPreview.hideLoading();
    }
  }
}

function navigateTo(target) {
  const loginModal = document.getElementById('login-modal');
  
  if (target === 'login') {
    if (loginModal) {
      loginModal.style.display = 'flex';
    }
  } else {
    if (loginModal) {
      loginModal.style.display = 'none';
    }
  }
  
  if (target === 'settings' || target === 'ai-keys') {
    showSettings();
  } else if (target === 'templates') {
    showTemplatesPlaceholder();
  } else if (target === 'projects') {
    const editorContainer = document.getElementById('latex-editor');
    const projectsList = document.getElementById('projects-list');
    
    if (editorContainer) {
      editorContainer.style.display = '';
      if (!currentDocumentId && !editor) {
        editorContainer.innerHTML = '<div class="editor-placeholder"><p>Select a project to start editing</p></div>';
      } else if (currentDocumentId && !editor) {
        loadDocument(currentDocumentId);
      }
    }
    if (projectsList) {
      projectsList.style.display = '';
    }
    const docsList = document.getElementById('documents-list');
    if (docsList) {
      docsList.hidden = !currentProject;
      docsList.style.display = currentProject ? '' : 'none';
    }
    updateWorkspaceHeader();
  }
  
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('data-target') === target) {
      link.classList.add('active');
    }
  });
}

function showSettings() {
  const editorContainer = document.getElementById('latex-editor');
  const projectsList = document.getElementById('projects-list');
  const docsList = document.getElementById('documents-list');

  teardownEditor();
  
  if (projectsList) projectsList.style.display = 'none';
  if (docsList) {
    docsList.hidden = true;
    docsList.style.display = 'none';
  }
  
  if (editorContainer) {
    editorContainer.innerHTML = '<div id="settings-panel" class="settings-panel"></div>';
    
    const settingsPanel = document.getElementById('settings-panel');
    
    if (window.AI_ENABLED) {
      import('./settings/ApiKeysSettings.js').then(module => {
        new module.ApiKeysSettings(settingsPanel);
      }).catch(err => {
        console.error('Failed to load API keys settings:', err);
        settingsPanel.innerHTML = '<p>Error loading settings</p>';
      });
    } else {
      settingsPanel.innerHTML = '<p>AI features are disabled</p>';
    }
  }
}

function showTemplatesPlaceholder() {
  const editorContainer = document.getElementById('latex-editor');
  const projectsList = document.getElementById('projects-list');
  const docsList = document.getElementById('documents-list');

  teardownEditor();
  
  if (projectsList) projectsList.style.display = 'none';
  if (docsList) {
    docsList.hidden = true;
    docsList.style.display = 'none';
  }
  
  if (editorContainer) {
    editorContainer.innerHTML = `
      <div class="settings-panel templates-panel">
        <h2>Templates</h2>
        <p>Choose a template when creating a new project. A browsable template gallery is still on the roadmap.</p>
      </div>
    `;
  }
}

function setupModals() {
  const closeModalButtons = document.querySelectorAll('.modal-close');
  closeModalButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-overlay');
      if (modal) {
        modal.style.display = 'none';
      }
    });
  });
  
  const cancelProjectBtn = document.getElementById('cancel-project');
  if (cancelProjectBtn) {
    cancelProjectBtn.addEventListener('click', () => {
      const modal = document.getElementById('new-project-modal');
      if (modal) {
        modal.style.display = 'none';
      }
    });
  }
  
  const createProjectBtn = document.getElementById('create-project');
  if (createProjectBtn) {
    createProjectBtn.addEventListener('click', createProject);
  }

  const cancelDocumentBtn = document.getElementById('cancel-document');
  if (cancelDocumentBtn) {
    cancelDocumentBtn.addEventListener('click', () => {
      const modal = document.getElementById('new-document-modal');
      if (modal) {
        modal.style.display = 'none';
      }
    });
  }

  const createDocumentBtn = document.getElementById('create-document');
  if (createDocumentBtn) {
    createDocumentBtn.addEventListener('click', () => {
      const docNameInput = document.getElementById('document-name');
      const docName = docNameInput ? docNameInput.value.trim() : '';
      if (!pendingDocumentProjectId) {
        showNotification('Open a project before adding files', 'error');
        return;
      }
      if (!docName) {
        showNotification('File name is required', 'error');
        return;
      }
      createDocument(pendingDocumentProjectId, docName);
    });
  }
}

function showNewProjectModal() {
  const modal = document.getElementById('new-project-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('project-name').value = '';
    document.getElementById('project-description').value = '';
    document.getElementById('project-template').value = 'article';
  }
}

function showNewDocumentModal(projectId) {
  pendingDocumentProjectId = projectId;
  const modal = document.getElementById('new-document-modal');
  const docNameInput = document.getElementById('document-name');

  if (modal && docNameInput) {
    docNameInput.value = '';
    modal.style.display = 'flex';
    docNameInput.focus();
  } else {
    const docName = window.prompt('Enter document name (e.g., chapter1.tex):');
    if (docName) {
      createDocument(projectId, docName);
    }
  }
}

async function createProject() {
  const name = document.getElementById('project-name').value.trim();
  const description = document.getElementById('project-description').value.trim();
  const template = document.getElementById('project-template').value;
  
  if (!name) {
    showNotification('Project name is required', 'error');
    return;
  }
  
  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ name, description, template })
    });
    
    if (response.ok) {
      const project = await response.json();
      
      const modal = document.getElementById('new-project-modal');
      if (modal) {
        modal.style.display = 'none';
      }
      
      loadProjects();
      loadProject(project._id);
      
      showNotification('Project created successfully', 'success');
    } else {
      const error = await response.json();
      showNotification(error.error || 'Failed to create project', 'error');
    }
  } catch (error) {
    console.error('Error creating project:', error);
    showNotification('Failed to create project', 'error');
  }
}

async function createDocument(projectId, name) {
  if (!name.endsWith('.tex') && !name.endsWith('.bib') && !name.endsWith('.cls')) {
    name += '.tex';
  }
  
  try {
    const response = await fetch('/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        name,
        content: name.endsWith('.tex') ? DEFAULT_LATEX_TEMPLATE : '',
        projectId
      })
    });
    
    if (response.ok) {
      const doc = await response.json();
      const modal = document.getElementById('new-document-modal');
      if (modal) {
        modal.style.display = 'none';
      }
      pendingDocumentProjectId = null;

      const projectWasOpen = currentProject && currentProject._id === projectId;
      if (projectWasOpen) {
        const currentDocuments = currentProject.documents || [];
        currentProject = {
          ...currentProject,
          documents: currentDocuments.some(existingDoc => existingDoc._id === doc._id)
            ? currentDocuments
            : [...currentDocuments, doc]
        };
      }

      await loadProject(projectId, doc._id);
      showNotification('Document created', 'success');
    } else {
      const error = await response.json();
      showNotification(error.error || 'Failed to create document', 'error');
    }
  } catch (error) {
    console.error('Error creating document:', error);
    showNotification('Failed to create document', 'error');
  }
}

function showNotification(message, type = 'info') {
  dispatchToastNotification(window, {
    message,
    type,
    fallback: (fallbackMessage, fallbackType) => {
      let notification = document.querySelector('.notification');

      if (!notification) {
        notification = document.createElement('div');
        notification.className = 'notification';
        document.body.appendChild(notification);
      }

      notification.textContent = fallbackMessage;
      notification.className = `notification notification-${fallbackType}`;
      notification.style.display = 'block';

      setTimeout(() => {
        notification.style.display = 'none';
      }, 3000);
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.NayaOverleaf = {
  loadProject,
  loadDocument,
  compileDocument,
  createProject,
  showNotification
};
