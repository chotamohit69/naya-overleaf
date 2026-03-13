/**
 * Reliability tests for compilation controller
 */

describe('Compilation Controller reliability', () => {
  let compileDocument;
  let mockReq;
  let mockRes;
  let mockDb;

  beforeEach(() => {
    jest.resetModules();

    const mockQueueChannel = null;

    jest.doMock('amqplib', () => ({
      connect: jest.fn(async () => ({
        createChannel: jest.fn(async () => mockQueueChannel)
      }))
    }));

    jest.doMock('redis', () => ({
      createClient: jest.fn(() => ({
        on: jest.fn(),
        connect: jest.fn().mockRejectedValue(new Error('redis unavailable')),
        isReady: false,
        get: jest.fn()
      }))
    }));

    mockDb = {
      collection: jest.fn((name) => {
        if (name === 'documents') {
          return {
            findOne: jest.fn().mockResolvedValue({
              _id: 'doc1',
              name: 'main.tex',
              projectId: '507f1f77bcf86cd799439012',
              content: 'hello'
            }),
            find: jest.fn(() => ({
              toArray: jest.fn().mockResolvedValue([
                {
                  _id: { toString: () => 'doc1' },
                  name: 'main.tex',
                  content: 'hello'
                }
              ])
            }))
          };
        }

        if (name === 'projects') {
          return {
            findOne: jest.fn().mockResolvedValue({
              _id: 'proj1',
              userId: 'user1',
              collaborators: []
            })
          };
        }

        if (name === 'sharedb_documents') {
          return {
            find: jest.fn(() => ({
              toArray: jest.fn().mockResolvedValue([])
            }))
          };
        }

        if (name === 'compilation_jobs') {
          return {
            insertOne: jest.fn().mockResolvedValue({ insertedId: 'job1' })
          };
        }

        return {};
      })
    };

    jest.doMock('../../../src/server/db/connection', () => ({
      db: mockDb
    }));

    ({ compileDocument } = require('../../../src/server/api/controllers/compilation'));

    mockReq = {
      kauth: {
        grant: {
          access_token: {
            content: { sub: 'user1' }
          }
        }
      },
      params: { documentId: '507f1f77bcf86cd799439011' },
      body: { compiler: 'pdflatex' }
    };

    mockRes = {
      status: jest.fn(() => mockRes),
      json: jest.fn()
    };
  });

  it('returns 503 when rabbitmq channel is unavailable and does not return queued', async () => {
    await compileDocument(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringMatching(/queue/i)
      })
    );
  });
});
