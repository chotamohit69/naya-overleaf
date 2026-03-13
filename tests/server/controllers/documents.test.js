/**
 * Tests for Documents Controller
 */

const { ObjectId } = require('mongodb');

const mockDb = {
  collection: jest.fn(() => ({
    find: jest.fn(() => ({
      toArray: jest.fn().mockResolvedValue([])
    })),
    findOne: jest.fn().mockResolvedValue({ 
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      name: 'main.tex',
      content: '\\documentclass{article}',
      projectId: '507f1f77bcf86cd799439012'
    }),
    insertOne: jest.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 })
  }))
};

jest.mock('../../../src/server/db/connection', () => ({
  db: mockDb
}));

jest.mock('../../../src/server/realtime/sharedb-connection', () => ({
  get: jest.fn(() => ({
    create: jest.fn((data, cb) => cb(null)),
    subscribe: jest.fn((cb) => cb(null))
  }))
}));

describe('Documents Controller', () => {
  let documentsController;
  let mockReq;
  let mockRes;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    documentsController = require('../../../src/server/api/controllers/documents');
    
    mockReq = {
      kauth: {
        grant: {
          access_token: {
            content: {
              sub: 'user1'
            }
          }
        }
      },
      params: {},
      body: {},
      query: {}
    };
    
    mockRes = {
      json: jest.fn(),
      status: jest.fn(() => mockRes),
      sendFile: jest.fn(),
      download: jest.fn(),
      setHeader: jest.fn()
    };
  });
  
  describe('getDocument', () => {
    it('should return a document by ID', async () => {
      mockReq.params.id = '507f1f77bcf86cd799439011';
      
      await documentsController.getDocument(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalled();
    });
  });
  
  describe('createDocument', () => {
    it('should create a new document', async () => {
      mockReq.body = { 
        name: 'test.tex', 
        content: '\\documentclass{article}', 
        projectId: '507f1f77bcf86cd799439012' 
      };
      
      await documentsController.createDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });
    
    it('should return error if name is missing', async () => {
      mockReq.body = { projectId: '507f1f77bcf86cd799439012' };
      
      await documentsController.createDocument(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });
});
