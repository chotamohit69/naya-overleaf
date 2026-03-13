/**
 * PDF Preview Component using PDF.js
 */

import * as pdfjsLib from 'pdfjs-dist';
import { PDFViewer } from 'pdfjs-dist/web/pdf_viewer';

// Set the worker source path
pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.bundle.js';

class PdfPreview {
  constructor(container, options = {}) {
    this.container = container;
    this.options = Object.assign({
      scale: 1.0,
      pageGap: 10,
      autoResize: true,
      getEditor: () => null,
      getCurrentDocumentId: () => null,
      onNotify: null,
      onCompile: null
    }, options);
    
    this.pdfDoc = null;
    this.pdfViewer = null;
    this.currentPage = 1;
    this.totalPages = 0;
    this.isLoading = false;
    this.lastJobId = null;
    this.boundResizeHandler = this.handleResize.bind(this);
    
    this.init();
  }
  
  init() {
    // Create viewer container
    this.viewerContainer = document.createElement('div');
    this.viewerContainer.className = 'pdf-viewer-container';
    this.container.appendChild(this.viewerContainer);
    
    // Create loading indicator
    this.loadingIndicator = document.createElement('div');
    this.loadingIndicator.className = 'pdf-loading-indicator';
    this.loadingIndicator.textContent = 'Compiling LaTeX...';
    this.container.appendChild(this.loadingIndicator);
    
    // Create toolbar
    this.createToolbar();
    
    // Create error display
    this.errorDisplay = document.createElement('div');
    this.errorDisplay.className = 'pdf-error-display';
    this.errorDisplay.style.display = 'none';
    this.container.appendChild(this.errorDisplay);
    
    // Initialize PDF viewer
    this.initPdfViewer();
    
    // Add event listeners
    if (this.options.autoResize) {
      window.addEventListener('resize', this.boundResizeHandler);
    }
  }
  
  createToolbar() {
    // Create toolbar container
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'pdf-toolbar';
    this.container.appendChild(this.toolbar);
    
    // Create page navigation
    const prevButton = document.createElement('button');
    prevButton.className = 'pdf-prev-button';
    prevButton.innerHTML = '&larr;';
    prevButton.title = 'Previous Page';
    prevButton.addEventListener('click', () => this.prevPage());
    this.toolbar.appendChild(prevButton);
    
    // Page indicator
    this.pageIndicator = document.createElement('span');
    this.pageIndicator.className = 'pdf-page-indicator';
    this.pageIndicator.textContent = 'Page 0 of 0';
    this.toolbar.appendChild(this.pageIndicator);
    
    // Next page button
    const nextButton = document.createElement('button');
    nextButton.className = 'pdf-next-button';
    nextButton.innerHTML = '&rarr;';
    nextButton.title = 'Next Page';
    nextButton.addEventListener('click', () => this.nextPage());
    this.toolbar.appendChild(nextButton);
    
    // Zoom controls
    const zoomOutButton = document.createElement('button');
    zoomOutButton.className = 'pdf-zoom-out-button';
    zoomOutButton.innerHTML = '&#8722;';
    zoomOutButton.title = 'Zoom Out';
    zoomOutButton.addEventListener('click', () => this.zoomOut());
    this.toolbar.appendChild(zoomOutButton);
    
    // Zoom indicator
    this.zoomIndicator = document.createElement('span');
    this.zoomIndicator.className = 'pdf-zoom-indicator';
    this.zoomIndicator.textContent = '100%';
    this.toolbar.appendChild(this.zoomIndicator);
    
    // Zoom in button
    const zoomInButton = document.createElement('button');
    zoomInButton.className = 'pdf-zoom-in-button';
    zoomInButton.innerHTML = '&#43;';
    zoomInButton.title = 'Zoom In';
    zoomInButton.addEventListener('click', () => this.zoomIn());
    this.toolbar.appendChild(zoomInButton);
    
    // Download button
    const downloadButton = document.createElement('button');
    downloadButton.className = 'pdf-download-button';
    downloadButton.innerHTML = '&#8595;';
    downloadButton.title = 'Download PDF';
    downloadButton.addEventListener('click', () => this.downloadPdf());
    this.toolbar.appendChild(downloadButton);
  }
  
  initPdfViewer() {
    // Create PDF viewer options
    const viewerOptions = {
      container: this.viewerContainer,
      scale: this.options.scale
    };
    
    // Create PDF viewer
    this.pdfViewer = new PDFViewer(viewerOptions);
  }
  
  async loadPdf(url) {
    try {
      this.showLoading();
      
      // Load the PDF document
      const loadingTask = pdfjsLib.getDocument(url);
      this.pdfDoc = await loadingTask.promise;
      
      // Set the document in the viewer
      this.pdfViewer.setDocument(this.pdfDoc);
      
      // Update total pages
      this.totalPages = this.pdfDoc.numPages;
      
      // Go to first page
      this.currentPage = 1;
      this.pdfViewer.currentPageNumber = this.currentPage;
      
      // Update UI
      this.updatePageIndicator();
      this.hideLoading();
      this.hideError();
      
      return true;
    } catch (error) {
      console.error('Error loading PDF:', error);
      this.showError('Failed to load PDF: ' + error.message);
      this.hideLoading();
      return false;
    }
  }
  
  async loadPdfFromCompilation(jobId) {
    try {
      this.lastJobId = jobId;
      this.showLoading();
      
      // Poll for compilation status
      let status = 'queued';
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes (5s * 60)
      
      while (status !== 'completed' && status !== 'failed' && attempts < maxAttempts) {
        // Get compilation status
        const response = await fetch(`/api/compile/status/${jobId}`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch compilation status');
        }
        
        const job = await response.json();
        status = job.status;
        
        if (status === 'completed') {
          // Load the PDF
          const pdfUrl = `/api/documents/${job.documentId}/pdf?jobId=${jobId}`;
          return await this.loadPdf(pdfUrl);
        } else if (status === 'failed') {
          this.showError('Compilation failed: ' + (job.error || 'Unknown error'));
          this.hideLoading();
          return false;
        } else {
          // Wait before polling again
          await new Promise(resolve => setTimeout(resolve, 5000));
          attempts++;
        }
      }
      
      if (attempts >= maxAttempts) {
        this.showError('Compilation timed out. Please try again later.');
        this.hideLoading();
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error loading PDF from compilation:', error);
      this.showError('Failed to load PDF: ' + error.message);
      this.hideLoading();
      return false;
    }
  }

  nextPage() {
    if (!this.pdfDoc || this.currentPage >= this.totalPages) return;
    
    this.currentPage++;
    this.pdfViewer.currentPageNumber = this.currentPage;
    this.updatePageIndicator();
  }
  
  prevPage() {
    if (!this.pdfDoc || this.currentPage <= 1) return;
    
    this.currentPage--;
    this.pdfViewer.currentPageNumber = this.currentPage;
    this.updatePageIndicator();
  }
  
  zoomIn() {
    if (!this.pdfViewer) return;
    
    const newScale = this.pdfViewer.currentScale * 1.2;
    this.pdfViewer.currentScale = newScale;
    this.updateZoomIndicator();
  }
  
  zoomOut() {
    if (!this.pdfViewer) return;
    
    const newScale = this.pdfViewer.currentScale / 1.2;
    this.pdfViewer.currentScale = newScale;
    this.updateZoomIndicator();
  }
  
  updatePageIndicator() {
    if (this.pageIndicator) {
      this.pageIndicator.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
    }
  }
  
  updateZoomIndicator() {
    if (this.zoomIndicator && this.pdfViewer) {
      const zoomPercent = Math.round(this.pdfViewer.currentScale * 100);
      this.zoomIndicator.textContent = `${zoomPercent}%`;
    }
  }
  
  showLoading() {
    this.isLoading = true;
    this.loadingIndicator.style.display = 'flex';
  }
  
  hideLoading() {
    this.isLoading = false;
    this.loadingIndicator.style.display = 'none';
  }
  
  showError(message) {
    this.errorDisplay.innerHTML = message;
    this.errorDisplay.style.display = 'block';
    
    const existingBtn = this.errorDisplay.querySelector('.fix-with-ai-btn');
    if (existingBtn) existingBtn.remove();
    
    if (this.lastJobId && window.AI_SERVICE_URL) {
      const fixBtn = document.createElement('button');
      fixBtn.className = 'fix-with-ai-btn';
      fixBtn.innerHTML = '🤖 Fix with AI';
      fixBtn.addEventListener('click', () => {
        this.triggerAiFix();
      });
      this.errorDisplay.appendChild(document.createElement('br'));
      this.errorDisplay.appendChild(fixBtn);
    }
  }
  
  async triggerAiFix() {
    const errorMsg = this.errorDisplay.textContent;
    const editor = this.options.getEditor?.();
    if (!this.lastJobId || !editor) return;

    
    const fixBtn = this.errorDisplay.querySelector('.fix-with-ai-btn');
    if (fixBtn) {
      fixBtn.disabled = true;
      fixBtn.textContent = 'Thinking...';
    }
    
    try {
      const userId = window.currentUserId || 'dev-user-123';
      const aiServiceUrl = window.AI_SERVICE_URL || 'http://localhost:8000';
      
      const documentContent = editor.getContent();
      const lines = documentContent.split('\n');
      const errorLineMatch = errorMsg.match(/line (\d+)/i);
      const errorLine = errorLineMatch ? parseInt(errorLineMatch[1]) : null;
      
      const response = await fetch(`${aiServiceUrl}/ai/fix-error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          error_log: errorMsg,
          document_content: documentContent,
          error_line: errorLine
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'AI fix request failed');
      }
      
      const result = await response.json();
      
      this.showAiFixPreview(result);
      
    } catch (error) {
      console.error('AI fix error:', error);
      this.showError(error.message + '\n\n' + errorMsg);
    } finally {
      if (fixBtn) {
        fixBtn.disabled = false;
        fixBtn.textContent = '🤖 Fix with AI';
      }
    }
  }
  
  showAiFixPreview(result) {
    const errorDisplay = this.errorDisplay;
    
    const preview = document.createElement('div');
    preview.className = 'ai-diff-preview';
    preview.innerHTML = `
      <strong>AI Suggestion:</strong>
      <p>${result.explanation}</p>
      <div>
        <span class="old">${result.patch?.old || ''}</span>
        <br>
        <span class="new">${result.patch?.new || ''}</span>
      </div>
    `;
    
    const actions = document.createElement('div');
    actions.className = 'ai-diff-actions';
    
    const applyBtn = document.createElement('button');
    applyBtn.className = 'btn btn-success';
    applyBtn.textContent = 'Apply Fix';
    applyBtn.addEventListener('click', () => {
      this.applyAiFix(result);
      preview.remove();
      actions.remove();
    });
    
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.addEventListener('click', () => {
      preview.remove();
      actions.remove();
    });
    
    actions.appendChild(applyBtn);
    actions.appendChild(dismissBtn);
    
    errorDisplay.appendChild(preview);
    errorDisplay.appendChild(actions);
  }
  
  applyAiFix(result) {
    const editor = this.options.getEditor?.();
    if (!editor || !result.patch) return;
    
    const patch = result.patch;
    const lines = editor.getContent().split('\n');

    
    if (patch.line >= 1 && patch.line <= lines.length) {
      const lineIndex = patch.line - 1;
      
      if (patch.old && lines[lineIndex].includes(patch.old)) {
        lines[lineIndex] = lines[lineIndex].replace(patch.old, patch.new);
      } else if (patch.old === undefined || patch.old === '') {
        if (patch.new) {
          lines[lineIndex] += patch.new;
        }
      } else {
        lines[lineIndex] = patch.new;
      }
      
      const newContent = lines.join('\n');
      editor.setContent(newContent);
      
      if (typeof this.options.onNotify === 'function') {
        this.options.onNotify('Fix applied! Recompiling...', 'success');
      } else if (window.NayaOverleaf && window.NayaOverleaf.showNotification) {
        window.NayaOverleaf.showNotification('Fix applied! Recompiling...', 'success');
      }
      
      setTimeout(() => {
        const documentId = this.options.getCurrentDocumentId?.();
        if (typeof this.options.onCompile === 'function' && documentId) {
          this.options.onCompile(documentId);
        } else if (window.NayaOverleaf && window.NayaOverleaf.compileDocument && documentId) {
          window.NayaOverleaf.compileDocument(documentId);
        }
      }, 500);

    }
  }
  
  hideError() {
    this.errorDisplay.style.display = 'none';
  }
  
  handleResize() {
    if (this.pdfViewer && this.pdfDoc) {
      // Adjust viewer size based on container
      this.pdfViewer.update();
    }
  }
  
  async downloadPdf() {
    if (!this.pdfDoc || !this.lastJobId) return;
    
    try {
      const response = await fetch(`/api/documents/download?jobId=${this.lastJobId}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      // Create a temporary link and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = 'document.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      this.showError('Failed to download PDF: ' + error.message);
    }
  }
  
  destroy() {
    // Clean up resources
    if (this.options.autoResize) {
      window.removeEventListener('resize', this.boundResizeHandler);
    }
    
    // Remove DOM elements
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    
    // Clean up PDF document
    if (this.pdfDoc) {
      this.pdfDoc.destroy();
      this.pdfDoc = null;
    }
  }
}

export default PdfPreview;