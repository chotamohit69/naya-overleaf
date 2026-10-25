/**
 * Documents Controller for Naya Overleaf
 */

const { ObjectId } = require('mongodb');
const client = require('../../db/connection');
const ShareDB = require('sharedb');
const shareConn = require('../../realtime/sharedb-connection');
const fs = require('fs');
const path = require('path');
const { validateDocumentName, resolveInsideDirectory } = require('../../utils/documentNames');
const { getUserIdFromRequest } = require('../../realtime/auth');

const COMPILATION_DIR = process.env.COMPILATION_DIR || path.join(__dirname, '../../../../compilation');

// Get a single document by ID
const getDocument = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const documentId = req.params.id;
    const db = client.db;

    if (!ObjectId.isValid(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const document = await db.collection('documents').findOne({
      _id: new ObjectId(documentId),
      deleted: { $ne: true }
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check if user has access to the project this document belongs to
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(document.projectId),
      $or: [
        { userId },
        { collaborators: userId }
      ],
      deleted: { $ne: true }
    });
    
    if (!project) {
      return res.status(403).json({ error: 'Access denied to this document' });
    }
    
    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
};

// Create a new document in a project
const createDocument = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const { name, content, projectId } = req.body;
    const db = client.db;
    
    if (!name || !projectId) {
      return res.status(400).json({ error: 'Document name and project ID are required' });
    }

    if (!ObjectId.isValid(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    if (content !== undefined && typeof content !== 'string') {
      return res.status(400).json({ error: 'Document content must be a string' });
    }

    const documentNameValidation = validateDocumentName(name);
    if (!documentNameValidation.valid) {
      return res.status(400).json({ error: documentNameValidation.error });
    }
    
    // Check if user has access to the project
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId),
      $or: [
        { userId },
        { collaborators: userId }
      ],
      deleted: { $ne: true }
    });
    
    if (!project) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }
    
    const newDocument = {
      name: documentNameValidation.name,
      content: content || '',
      projectId,
      createdAt: new Date(),
      updatedAt: new Date(),
      deleted: false
    };
    
    const result = await db.collection('documents').insertOne(newDocument);
    
    // Create ShareDB document for real-time collaboration
    await shareConn.initializeShareDB();
    const shareDoc = shareConn.get('documents', result.insertedId.toString());
    shareDoc.create({ content: content || '' }, (err) => {
      if (err) console.error('Error creating ShareDB document:', err);
    });
    
    res.status(201).json({ 
      _id: result.insertedId,
      ...newDocument
    });
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
};

// Update a document
const updateDocument = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const documentId = req.params.id;
    const { name } = req.body; // Only update metadata, not content (handled by ShareDB)
    const db = client.db;

    if (!ObjectId.isValid(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const document = await db.collection('documents').findOne({
      _id: new ObjectId(documentId),
      deleted: { $ne: true }
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check if user has access to the project this document belongs to
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(document.projectId),
      $or: [
        { userId },
        { collaborators: userId }
      ],
      deleted: { $ne: true }
    });
    
    if (!project) {
      return res.status(403).json({ error: 'Access denied to this document' });
    }
    
    const updateData = {
      updatedAt: new Date()
    };
    
    if (name) {
      const documentNameValidation = validateDocumentName(name);
      if (!documentNameValidation.valid) {
        return res.status(400).json({ error: documentNameValidation.error });
      }
      updateData.name = documentNameValidation.name;
    }
    
    await db.collection('documents').updateOne(
      { _id: new ObjectId(documentId) },
      { $set: updateData }
    );
    
    res.json({ 
      _id: documentId,
      ...document,
      ...updateData
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
};

// Delete a document (soft delete)
const deleteDocument = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const documentId = req.params.id;
    const db = client.db;

    if (!ObjectId.isValid(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const document = await db.collection('documents').findOne({
      _id: new ObjectId(documentId),
      deleted: { $ne: true }
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check if user has access to the project this document belongs to
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(document.projectId),
      $or: [
        { userId },
        { collaborators: userId }
      ],
      deleted: { $ne: true }
    });
    
    if (!project) {
      return res.status(403).json({ error: 'Access denied to this document' });
    }
    
    // Soft delete the document
    await db.collection('documents').updateOne(
      { _id: new ObjectId(documentId) },
      { 
        $set: { 
          deleted: true,
          deletedAt: new Date() 
        } 
      }
    );
    
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
};

module.exports = {
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  getDocumentPdf,
  downloadPdf,
  getLatestCompilationStatus
};

async function getDocumentPdf(req, res) {
  try {
    const userId = getUserIdFromRequest(req);
    const documentId = req.params.id;
    const jobId = req.query.jobId;
    const db = client.db;

    if (!ObjectId.isValid(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    if (jobId && !ObjectId.isValid(jobId)) {
      return res.status(400).json({ error: 'Invalid compilation job ID' });
    }
    
    const document = await db.collection('documents').findOne({
      _id: new ObjectId(documentId),
      deleted: { $ne: true }
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(document.projectId),
      $or: [
        { userId },
        { collaborators: userId }
      ],
      deleted: { $ne: true }
    });
    
    if (!project) {
      return res.status(403).json({ error: 'Access denied to this document' });
    }
    
    let job;
    if (jobId) {
      job = await db.collection('compilation_jobs').findOne({
        _id: new ObjectId(jobId),
        documentId,
        projectId: document.projectId
      });
    } else {
      job = await db.collection('compilation_jobs')
        .find({ documentId, status: 'completed' })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();
      job = job[0];
    }
    
    if (!job || !job.pdfPath) {
      return res.status(404).json({ error: 'No compiled PDF found for this document' });
    }
    
    const pdfPath = resolveInsideDirectory(COMPILATION_DIR, job.pdfPath);
    
    if (!fs.existsSync(pdfPath)) {
      const altPdfPath = resolveInsideDirectory(COMPILATION_DIR, `${job._id}.pdf`);
      if (fs.existsSync(altPdfPath)) {
        return res.sendFile(altPdfPath);
      }
      return res.status(404).json({ error: 'PDF file not found' });
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${document.name.replace('.tex', '.pdf')}"`);
    res.sendFile(pdfPath);
    
  } catch (error) {
    console.error('Error serving PDF:', error);
    res.status(500).json({ error: 'Failed to serve PDF' });
  }
}

async function downloadPdf(req, res) {
  try {
    const userId = getUserIdFromRequest(req);
    const jobId = req.query.jobId;
    const documentId = req.query.documentId;
    const db = client.db;
    
    if (!jobId && !documentId) {
      return res.status(400).json({ error: 'Job ID or Document ID is required' });
    }

    if (jobId && !ObjectId.isValid(jobId)) {
      return res.status(400).json({ error: 'Invalid compilation job ID' });
    }

    if (documentId && !ObjectId.isValid(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    let job;
    if (jobId) {
      job = await db.collection('compilation_jobs').findOne({
        _id: new ObjectId(jobId)
      });
    } else {
      job = await db.collection('compilation_jobs')
        .find({ documentId, status: 'completed' })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();
      job = job[0];
    }
    
    if (!job) {
      return res.status(404).json({ error: 'Compilation job not found' });
    }

    if (documentId && job.documentId !== documentId) {
      return res.status(403).json({ error: 'Compilation job does not belong to requested document' });
    }
    
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(job.projectId),
      $or: [
        { userId },
        { collaborators: userId }
      ],
      deleted: { $ne: true }
    });
    
    if (!project) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    if (!job.pdfPath) {
      return res.status(404).json({ error: 'No PDF available for download' });
    }
    
    const pdfPath = resolveInsideDirectory(COMPILATION_DIR, job.pdfPath);
    
    if (!fs.existsSync(pdfPath)) {
      const altPdfPath = resolveInsideDirectory(COMPILATION_DIR, `${job._id}.pdf`);
      if (fs.existsSync(altPdfPath)) {
        return res.download(altPdfPath, 'document.pdf');
      }
      return res.status(404).json({ error: 'PDF file not found' });
    }
    
    const document = await db.collection('documents').findOne({
      _id: new ObjectId(job.documentId)
    });
    
    const filename = document ? document.name.replace('.tex', '.pdf') : 'document.pdf';
    
    res.download(pdfPath, filename);
    
  } catch (error) {
    console.error('Error downloading PDF:', error);
    res.status(500).json({ error: 'Failed to download PDF' });
  }
}

async function getLatestCompilationStatus(req, res) {
  try {
    const userId = getUserIdFromRequest(req);
    const documentId = req.params.documentId;
    const db = client.db;

    if (!ObjectId.isValid(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }
    
    const document = await db.collection('documents').findOne({
      _id: new ObjectId(documentId),
      deleted: { $ne: true }
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(document.projectId),
      $or: [
        { userId },
        { collaborators: userId }
      ],
      deleted: { $ne: true }
    });
    
    if (!project) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const job = await db.collection('compilation_jobs')
      .find({ documentId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    
    if (job.length === 0) {
      return res.json({ status: 'not_compiled' });
    }
    
    res.json(job[0]);
    
  } catch (error) {
    console.error('Error getting compilation status:', error);
    res.status(500).json({ error: 'Failed to get compilation status' });
  }
}
