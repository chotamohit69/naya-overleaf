/**
 * Metrics baseline and alert threshold tests
 */

describe('observability metrics + alerts', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('exposes baseline metrics snapshot', () => {
    const { getMetricsSnapshot } = require('../../../src/server/observability/metrics');

    const snapshot = getMetricsSnapshot();

    expect(snapshot).toEqual(expect.objectContaining({
      liveness: expect.any(Object),
      readiness: expect.any(Object),
      api: expect.any(Object),
      websocket: expect.any(Object),
      queue: expect.any(Object),
      compilation: expect.any(Object),
      dependencies: expect.any(Object)
    }));
  });

  it('triggers readiness alert on 3 consecutive failed 30s probe windows', () => {
    const { evaluateAlerts } = require('../../../src/server/observability/alerts');

    const alerts = evaluateAlerts({
      readinessWindows: [
        { ready: false, durationSeconds: 30 },
        { ready: false, durationSeconds: 30 },
        { ready: false, durationSeconds: 30 }
      ]
    });

    expect(alerts).toContainEqual(expect.objectContaining({
      code: 'ALERT_READINESS_CONSECUTIVE_FAILURES'
    }));
  });

  it('triggers api 5xx alert when 5xx rate exceeds 5% for 10 minutes', () => {
    const { evaluateAlerts } = require('../../../src/server/observability/alerts');

    const alerts = evaluateAlerts({
      apiWindows: Array.from({ length: 10 }, () => ({
        durationMinutes: 1,
        requests: 100,
        errors5xx: 6
      }))
    });

    expect(alerts).toContainEqual(expect.objectContaining({
      code: 'ALERT_API_5XX_RATE_SPIKE'
    }));
  });

  it('triggers queue backlog alert when backlog exceeds 200 jobs for 10 minutes', () => {
    const { evaluateAlerts } = require('../../../src/server/observability/alerts');

    const alerts = evaluateAlerts({
      queueWindows: Array.from({ length: 10 }, () => ({
        durationMinutes: 1,
        backlog: 250
      }))
    });

    expect(alerts).toContainEqual(expect.objectContaining({
      code: 'ALERT_QUEUE_BACKLOG_BREACH'
    }));
  });

  it('triggers compile failure-rate alert when failure rate exceeds 10% over 15 minutes', () => {
    const { evaluateAlerts } = require('../../../src/server/observability/alerts');

    const alerts = evaluateAlerts({
      compileWindows: Array.from({ length: 15 }, () => ({
        durationMinutes: 1,
        totalCompiles: 100,
        failedCompiles: 12
      }))
    });

    expect(alerts).toContainEqual(expect.objectContaining({
      code: 'ALERT_COMPILE_FAILURE_RATE_SPIKE'
    }));
  });
});
