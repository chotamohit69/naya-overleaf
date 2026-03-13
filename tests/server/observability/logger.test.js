/**
 * Tests for structured logger schema
 */

describe('observability logger', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('logger emits required structured fields', () => {
    const { logInfo } = require('../../../src/server/observability/logger');

    const event = logInfo('message', {
      component: 'api',
      correlationId: 'cid-123',
      errorClass: 'NONE'
    });

    expect(event).toEqual(expect.objectContaining({
      timestamp: expect.any(String),
      level: 'info',
      service: expect.any(String),
      component: 'api',
      correlationId: 'cid-123',
      message: 'message',
      errorClass: 'NONE'
    }));
  });

  it('logger defaults correlation and errorClass when omitted', () => {
    const { logError } = require('../../../src/server/observability/logger');

    const event = logError('boom', {
      component: 'worker'
    });

    expect(event.level).toBe('error');
    expect(event.component).toBe('worker');
    expect(event.message).toBe('boom');
    expect(event.errorClass).toBe('UNKNOWN_ERROR');
    expect(event.correlationId).toBe('unknown');
  });
});
