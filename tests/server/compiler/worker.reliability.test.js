/**
 * Reliability tests for compilation worker retries and terminal state behavior
 */

describe('Compilation Worker reliability', () => {
  let startWorker;

  let consumeHandler;
  let ackMock;
  let nackMock;
  let updateOneMock;

  beforeEach(() => {
    jest.resetModules();

    ackMock = jest.fn();
    nackMock = jest.fn();

    const channelMock = {
      assertQueue: jest.fn().mockResolvedValue(undefined),
      prefetch: jest.fn(),
      consume: jest.fn((queue, handler) => {
        consumeHandler = handler;
      }),
      ack: ackMock,
      nack: nackMock,
      close: jest.fn().mockResolvedValue(undefined)
    };

    jest.doMock('amqplib', () => ({
      connect: jest.fn().mockResolvedValue({
        createChannel: jest.fn().mockResolvedValue(channelMock),
        close: jest.fn().mockResolvedValue(undefined)
      })
    }));

    jest.doMock('redis', () => ({
      createClient: jest.fn(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        set: jest.fn().mockResolvedValue(undefined),
        quit: jest.fn().mockResolvedValue(undefined)
      }))
    }));

    updateOneMock = jest.fn().mockResolvedValue({ modifiedCount: 1 });

    jest.doMock('mongodb', () => ({
      MongoClient: jest.fn(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        db: jest.fn(() => ({
          collection: jest.fn((name) => {
            if (name === 'compilation_jobs') {
              return {
                updateOne: updateOneMock
              };
            }
            return {
              find: jest.fn(() => ({
                toArray: jest.fn().mockResolvedValue([])
              }))
            };
          })
        }))
      })),
      ObjectId: jest.fn((id) => id)
    }));

    jest.doMock('../../../src/server/compiler/docker', () => ({
      prepareCompilationEnvironment: jest.fn().mockResolvedValue(true),
      runCompilation: jest.fn().mockResolvedValue({ success: false, error: 'forced processing failure' }),
      cleanupCompilationEnvironment: jest.fn().mockResolvedValue(undefined)
    }));

    ({ startWorker } = require('../../../src/server/compiler/worker'));
  });

  it('marks job failed after max retry attempts and does not requeue infinitely', async () => {
    const messageBody = {
      jobId: 'job-1',
      projectId: 'project-1',
      mainFile: 'main.tex',
      retryCount: 2
    };

    const msg = {
      content: Buffer.from(JSON.stringify(messageBody)),
      properties: {}
    };

    await startWorker();
    await consumeHandler(msg);

    expect(updateOneMock).toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.anything() }),
      {
        $set: expect.objectContaining({
          status: 'failed',
          error: expect.stringMatching(/forced processing failure/i),
          retryCount: 3
        })
      }
    );
    expect(nackMock).toHaveBeenCalledWith(msg, false, false);
  });
});
