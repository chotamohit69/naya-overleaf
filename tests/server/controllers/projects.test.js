/**
 * Tests for Projects Controller
 */

const { ObjectId } = require('mongodb');

const mockDb = {
  collection: jest.fn(() => ({
    find: jest.fn(() => ({
      sort: jest.fn(() => ({
        toArray: jest.fn().mockResolvedValue([
          { _id: 'proj1', name: 'Test Project', userId: 'user1' }
        ])
      }))
    })),
    findOne: jest.fn().mockResolvedValue({ 
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      name: 'Test Project',
      userId: 'user1',
      collaborators: []
    }),
    insertOne: jest.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 })
  }))
};

jest.mock('../../../src/server/db/connection', () => ({
  db: mockDb
}));

describe('Projects Controller', () => {
  let projectsController;
  let mockReq;
  let mockRes;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    projectsController = require('../../../src/server/api/controllers/projects');
    
    mockReq = {
      kauth: {
        grant: {
          access_token: {
            content: {
              sub: 'user1',
              name: 'Test User',
              email: 'test@example.com'
            }
          }
        }
      },
      params: {},
      body: {}
    };
    
    mockRes = {
      json: jest.fn(),
      status: jest.fn(() => mockRes)
    };
  });
  
  describe('getAllProjects', () => {
    it('should return all projects for the user', async () => {
      await projectsController.getAllProjects(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalled();
    });
  });
  
  describe('createProject', () => {
    it('should create a new project', async () => {
      mockReq.body = { name: 'New Project', description: 'Test description' };
      
      await projectsController.createProject(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();
    });
    
    it('should return error if name is missing', async () => {
      mockReq.body = { description: 'Test description' };
      
      await projectsController.createProject(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
