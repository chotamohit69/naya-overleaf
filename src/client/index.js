/**
 * Client Entry Point for Naya Overleaf
 */

import './styles/main.css';
import LatexEditor from './editor/LatexEditor';
import PdfPreview from './pdf/PdfPreview';

window.AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
window.AI_ENABLED = process.env.AI_ENABLED !== 'false';

let editor = null;
let pdfPreview = null;
let aiChatSidebar = null;
let currentDocumentId = null;
let currentProjectId = null;
let currentProject = null;
let socket = null;

const DEFAULT_LATEX_TEMPLATE = `\\documentclass[12pt]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{geometry}
\\geometry{margin=1in}

\\title{Untitled Document}
\\author{Your Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}

Start writing your document here.

\\end{document}
`;

document.addEventListener('DOMContentLoaded', () => {
  setupUI();
  checkAuth();
  setupModals();
  connectSocket();
});

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
  
  if (window.AI_ENABLED) {
    initAiComponents();
  }
}

function initAiComponents() {
  import('./editor/AiChatSidebar.js').then(module => {
    const AiChatSidebarClass = module.default || module.AiChatSidebar || window.AiChatSidebar;
    aiChatSidebar = new AiChatSidebarClass({
      editor: null,
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
  
  socket.on('compilation-complete', (data) => {
    if (data.documentId === currentDocumentId && pdfPreview) {
      pdfPreview.loadPdfFromCompilation(data.jobId);
    }
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
  
  projectsList.innerHTML = '';
  
  if (projects.length === 0) {
    projectsList.innerHTML = '<div class="empty-state">No projects yet. Create a new project to get started.</div>';
    return;
  }
  
  projects.forEach(project => {
    const projectItem = document.createElement('div');
    projectItem.className = 'project-item';
    if (currentProjectId === project._id) {
      projectItem.classList.add('active');
    }
    projectItem.innerHTML = `
      <div class="project-name">${escapeHtml(project.name)}</div>
      <div class="project-updated">Updated: ${new Date(project.updatedAt).toLocaleString()}</div>
    `;
    
    projectItem.addEventListener('click', () => {
      loadProject(project._id);
    });
    
    projectsList.appendChild(projectItem);
  });
}

async function loadProject(projectId) {
  try {
    const response = await fetch(`/api/projects/${projectId}`, {
      credentials: 'include'
    });
    
    if (response.ok) {
      currentProject = await response.json();
      currentProjectId = projectId;
      
      displayProjectDocuments(currentProject);
      
      const mainDocument = currentProject.documents?.find(d => d.name.endsWith('.tex')) || currentProject.documents?.[0];
      
      if (mainDocument) {
        loadDocument(mainDocument._id);
      } else {
        await createDefaultDocument(projectId);
      }
      
      displayProjects(await (await fetch('/api/projects', { credentials: 'include' })).json());
    } else {
      console.error('Error loading project');
      showNotification('Failed to load project', 'error');
    }
  } catch (error) {
    console.error('Error loading project:', error);
    showNotification('Failed to load project', 'error');
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
  
  documentsList.innerHTML = '';
  
  if (!project.documents || project.documents.length === 0) {
    documentsList.innerHTML = '<div class="empty-state">No documents</div>';
    return;
  }
  
  const header = document.createElement('div');
  header.className = 'documents-header';
  header.innerHTML = '<h3>Documents</h3>';
  documentsList.appendChild(header);
  
  project.documents.forEach(doc => {
    const docItem = document.createElement('div');
    docItem.className = 'document-item';
    if (currentDocumentId === doc._id) {
      docItem.classList.add('active');
    }
    
    const icon = doc.name.endsWith('.tex') ? '📄' : 
                 doc.name.endsWith('.bib') ? '📚' : 
                 doc.name.endsWith('.cls') ? '⚙️' : '📁';
    
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
  addDocBtn.textContent = '+ Add File';
  addDocBtn.addEventListener('click', () => {
    showNewDocumentModal(project._id);
  });
  documentsList.appendChild(addDocBtn);
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
        content: DEFAULT_LATEX_TEMPLATE,
        projectId
      })
    });
    
    if (response.ok) {
      const doc = await response.json();
      loadDocument(doc._id);
    }
  } catch (error) {
    console.error('Error creating default document:', error);
  }
}

async function loadDocument(documentId) {
  try {
    if (editor) {
      editor.destroy();
      editor = null;
    }
    
    currentDocumentId = documentId;
    
    const editorContainer = document.getElementById('latex-editor');
    if (editorContainer) {
      editorContainer.innerHTML = '';
    }
    
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
    
    const pdfContainer = document.getElementById('pdf-preview');
    if (pdfContainer && !pdfPreview) {
      pdfPreview = new PdfPreview(pdfContainer, {
        getEditor: () => editor,
        getCurrentDocumentId: () => currentDocumentId,
        onNotify: showNotification,
        onCompile: compileDocument
      });
    }
    
    await loadLatestCompilation(documentId);
    
    displayProjectDocuments(currentProject);
    
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
      }
    }
  } catch (error) {
    console.log('No previous compilation found');
  }
}

async function compileDocument(documentId) {
  try {
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
  } else if (target === 'projects') {
    const editorContainer = document.getElementById('latex-editor');
    const projectsList = document.getElementById('projects-list');
    
    if (editorContainer) {
      editorContainer.style.display = '';
      editorContainer.innerHTML = '<div class="editor-placeholder"><p>Select a project to start editing</p></div>';
    }
    if (projectsList) {
      projectsList.style.display = '';
    }
    const docsList = document.getElementById('documents-list');
    if (docsList) {
      docsList.style.display = '';
    }
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
  
  if (projectsList) projectsList.style.display = 'none';
  if (docsList) docsList.style.display = 'none';
  
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
}

function showNewProjectModal() {
  const modal = document.getElementById('new-project-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.getElementById('project-name').value = '';
    document.getElementById('project-description').value = '';
    document.getElementById('project-template').value = '';
  }
}

function showNewDocumentModal(projectId) {
  const docName = prompt('Enter document name (e.g., chapter1.tex):');
  if (docName) {
    createDocument(projectId, docName);
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
      body: JSON.stringify({ name, description })
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
      loadProject(projectId);
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
  let notification = document.querySelector('.notification');
  
  if (!notification) {
    notification = document.createElement('div');
    notification.className = 'notification';
    document.body.appendChild(notification);
  }
  
  notification.textContent = message;
  notification.className = `notification notification-${type}`;
  notification.style.display = 'block';
  
  setTimeout(() => {
    notification.style.display = 'none';
  }, 3000);
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
