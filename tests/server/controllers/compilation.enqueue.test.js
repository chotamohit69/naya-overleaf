/**
 * Compilation enqueue failure behavior.
 */

describe('Compilation Controller enqueue failure', () => {
  let compileDocument;
  let connectRabbitMQ;
  let mockRes;
  let insertOneMock;
  let updateOneMock;

  beforeEach(() => {
    jest.resetModules();

    insertOneMock = jest.fn().mockResolvedValue({ insertedId: 'job1' });
    updateOneMock = jest.fn().mockResolvedValue({ matchedCount: 1 });

    const channelMock = {
      assertQueue: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      sendToQueue: jest.fn(() => {
        throw new Error('channel is closed');
      }),
      checkQueue: jest.fn().mockResolvedValue({ messageCount: 0 })
    };

    jest.doMock('amqplib', () => ({
      connect: jest.fn().mockResolvedValue({
        createChannel: jest.fn().mockResolvedValue(channelMock),
        on: jest.fn()
      })
    }));

    jest.doMock('redis', () => ({
      createClient: jest.fn(() => ({
        on: jest.fn(),
        connect: jest.fn().mockRejectedValue(new Error('redis unavailable')),
        isReady: false,
        get: jest.fn()
      }))
    }));

    const documentsCollection = {
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

    const mockDb = {
      collection: jest.fn((name) => {
        if (name === 'documents') {
          return documentsCollection;
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
            insertOne: insertOneMock,
            updateOne: updateOneMock
          };
        }

        return {};
      })
    };

    jest.doMock('../../../src/server/db/connection', () => ({
      db: mockDb
    }));

    ({ compileDocument, connectRabbitMQ } = require('../../../src/server/api/controllers/compilation'));

    mockRes = {
      status: jest.fn(() => mockRes),
      json: jest.fn()
    };
  });

  it('returns 503 and records a failed job when sendToQueue throws', async () => {
    await connectRabbitMQ();

    const mockReq = {
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

    await compileDocument(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringMatching(/queue/i)
      })
    );
    expect(insertOneMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'queued',
        documentId: '507f1f77bcf86cd799439011'
      })
    );
    expect(updateOneMock).toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.anything() }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'failed'
        })
      })
    );
  });
});
