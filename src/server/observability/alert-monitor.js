const { evaluateAlerts } = require('./alerts');
const { getMetricsSnapshot } = require('./metrics');
const { logWarn } = require('./logger');

const DEFAULT_INTERVAL_MS = 30000;
const MAX_WINDOWS = 240;

let monitoringInterval = null;
let previousSnapshot = null;
let activeAlerts = [];
let windows = createEmptyWindows();

function createEmptyWindows() {
  return {
    readinessWindows: [],
    apiWindows: [],
    queueWindows: [],
    compileWindows: []
  };
}

function pushWindow(target, value) {
  target.push(value);
  if (target.length > MAX_WINDOWS) {
    target.shift();
  }
}

function sampleMetrics(intervalMs = DEFAULT_INTERVAL_MS) {
  const snapshot = getMetricsSnapshot();

  if (!previousSnapshot) {
    previousSnapshot = snapshot;
    return activeAlerts;
  }

  const durationMinutes = intervalMs / 60000;
  const durationSeconds = intervalMs / 1000;
  const requestsDelta = Math.max(0, snapshot.api.requestsTotal - previousSnapshot.api.requestsTotal);
  const errors5xxDelta = Math.max(0, snapshot.api.errors5xxTotal - previousSnapshot.api.errors5xxTotal);
  const compilesDelta = Math.max(0, snapshot.compilation.total - previousSnapshot.compilation.total);
  const failedCompilesDelta = Math.max(0, snapshot.compilation.failed - previousSnapshot.compilation.failed);

  pushWindow(windows.readinessWindows, {
    ready: snapshot.readiness.ready,
    durationSeconds
  });
  pushWindow(windows.apiWindows, {
    durationMinutes,
    requests: requestsDelta,
    errors5xx: errors5xxDelta
  });
  pushWindow(windows.queueWindows, {
    durationMinutes,
    backlog: snapshot.queue.depth
  });
  pushWindow(windows.compileWindows, {
    durationMinutes,
    totalCompiles: compilesDelta,
    failedCompiles: failedCompilesDelta
  });

  previousSnapshot = snapshot;

  const nextAlerts = evaluateAlerts(windows);
  const nextCodes = new Set(nextAlerts.map((alert) => alert.code));
  const previousCodes = new Set(activeAlerts.map((alert) => alert.code));

  nextAlerts.forEach((alert) => {
    if (!previousCodes.has(alert.code)) {
      logWarn(`Alert activated: ${alert.code}`, {
        component: 'alert-monitor',
        correlationId: 'monitor',
        errorClass: 'ALERT_ACTIVE'
      });
    }
  });

  activeAlerts.forEach((alert) => {
    if (!nextCodes.has(alert.code)) {
      logWarn(`Alert cleared: ${alert.code}`, {
        component: 'alert-monitor',
        correlationId: 'monitor',
        errorClass: 'ALERT_CLEARED'
      });
    }
  });

  const now = new Date().toISOString();
  activeAlerts = nextAlerts.map((alert) => {
    const existing = activeAlerts.find((item) => item.code === alert.code);
    return {
      ...alert,
      since: existing?.since || now
    };
  });

  return activeAlerts;
}

function startAlertMonitoring(options = {}) {
  stopAlertMonitoring();

  const intervalMs = Number.isFinite(options.intervalMs) && options.intervalMs > 0
    ? options.intervalMs
    : DEFAULT_INTERVAL_MS;

  previousSnapshot = null;
  windows = createEmptyWindows();
  activeAlerts = [];
  sampleMetrics(intervalMs);

  monitoringInterval = setInterval(() => {
    sampleMetrics(intervalMs);
  }, intervalMs);

  if (typeof monitoringInterval.unref === 'function') {
    monitoringInterval.unref();
  }

  return monitoringInterval;
}

function stopAlertMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
}

function getActiveAlerts() {
  return activeAlerts.map((alert) => ({ ...alert }));
}

function resetAlertMonitorForTest() {
  stopAlertMonitoring();
  previousSnapshot = null;
  windows = createEmptyWindows();
  activeAlerts = [];
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  getActiveAlerts,
  resetAlertMonitorForTest,
  sampleMetrics,
  startAlertMonitoring,
  stopAlertMonitoring
};
