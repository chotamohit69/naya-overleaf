/**
 * Projects Controller for Naya Overleaf
 */

const { ObjectId } = require('mongodb');
const client = require('../../db/connection');
const { getUserIdFromRequest } = require('../../realtime/auth');

// Get all projects for the current user
const getAllProjects = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const db = client.db;
    
    const projects = await db.collection('projects')
      .find({ 
        $or: [
          { userId },
          { collaborators: userId }
        ],
        deleted: { $ne: true } 
      })
      .sort({ updatedAt: -1 })
      .toArray();
    
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

// Get a single project by ID with its documents
const getProject = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const projectId = req.params.id;
    const db = client.db;

    if (!ObjectId.isValid(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId),
      $or: [
        { userId },
        { collaborators: userId }
      ],
      deleted: { $ne: true }
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    
    // Get documents associated with this project
    const documents = await db.collection('documents')
      .find({
        projectId: projectId,
        deleted: { $ne: true }
      })
      .toArray();
      
    // Return project with its documents
    res.json({
      ...project,
      documents
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
};

// Create a new project
const createProject = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const { name, description, template } = req.body;
    const db = client.db;
    const allowedTemplates = ['article', 'report', 'book', 'presentation'];
    
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    if (name.trim().length > 200) {
      return res.status(400).json({ error: 'Project name must be 200 characters or fewer' });
    }

    if (description !== undefined && typeof description !== 'string') {
      return res.status(400).json({ error: 'Project description must be a string' });
    }
    
    const selectedTemplate = template || 'article';

    if (!allowedTemplates.includes(selectedTemplate)) {
      return res.status(400).json({ error: `Template must be one of: ${allowedTemplates.join(', ')}` });
    }

    const newProject = {
      name: name.trim(),
      description: description || '',
      template: selectedTemplate,
      userId,
      collaborators: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      deleted: false
    };
    
    const result = await db.collection('projects').insertOne(newProject);
    
    res.status(201).json({ 
      _id: result.insertedId,
      ...newProject
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
};

// Update a project
const updateProject = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const projectId = req.params.id;
    const { name, description, collaborators } = req.body;
    const db = client.db;

    if (!ObjectId.isValid(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return res.status(400).json({ error: 'Project name must be a non-empty string' });
    }

    if (description !== undefined && typeof description !== 'string') {
      return res.status(400).json({ error: 'Project description must be a string' });
    }
    
    if (collaborators !== undefined) {
      if (!Array.isArray(collaborators) || collaborators.some((collaborator) => typeof collaborator !== 'string')) {
        return res.status(400).json({ error: 'Collaborators must be an array of user IDs' });
      }

      if (collaborators.length > 100) {
        return res.status(400).json({ error: 'A project cannot have more than 100 collaborators' });
      }
    }

    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId),
      userId, // Only the owner can update project details
      deleted: { $ne: true }
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    
    const updateData = {
      updatedAt: new Date()
    };
    
    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (collaborators !== undefined) {
      updateData.collaborators = [...new Set(collaborators)];
    }
    
    await db.collection('projects').updateOne(
      { _id: new ObjectId(projectId) },
      { $set: updateData }
    );
    
    res.json({ 
      _id: projectId,
      ...project,
      ...updateData
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
};

// Delete a project (soft delete)
const deleteProject = async (req, res) => {
  try {
    const userId = getUserIdFromRequest(req);
    const projectId = req.params.id;
    const db = client.db;

    if (!ObjectId.isValid(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    
    const project = await db.collection('projects').findOne({
      _id: new ObjectId(projectId),
      userId, // Only the owner can delete a project
      deleted: { $ne: true }
    });
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }
    
    // Soft delete the project
    await db.collection('projects').updateOne(
      { _id: new ObjectId(projectId) },
      { 
        $set: {
          deleted: true,
          updatedAt: new Date()
        }
      }
    );
    
    // Soft delete all documents in this project
    await db.collection('documents').updateMany(
      { projectId: projectId },
      { 
        $set: {
          deleted: true,
          updatedAt: new Date()
        }
      }
    );
    
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
};

module.exports = {
  getAllProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject
};