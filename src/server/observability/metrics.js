const metricsState = {
  liveness: {
    status: 'live'
  },
  readiness: {
    ready: true,
    degraded: false,
    reasons: [],
    featureImpacts: []
  },
  api: {
    requestsTotal: 0,
    errors5xxTotal: 0,
    latencyMs: {
      count: 0,
      total: 0
    }
  },
  websocket: {
    connected: 0,
    disconnectedTotal: 0,
    errorsTotal: 0
  },
  queue: {
    depth: 0
  },
  compilation: {
    total: 0,
    failed: 0,
    durationMs: {
      count: 0,
      total: 0
    }
  },
  dependencies: {
    mongoFailures: 0,
    redisFailures: 0,
    rabbitmqFailures: 0
  }
};

function getMetricsSnapshot() {
  return JSON.parse(JSON.stringify(metricsState));
}

function setReadinessMetrics(readiness) {
  metricsState.readiness = {
    ready: !!readiness?.ready,
    degraded: !!readiness?.degraded,
    reasons: Array.isArray(readiness?.reasons) ? [...readiness.reasons] : [],
    featureImpacts: Array.isArray(readiness?.featureImpacts) ? [...readiness.featureImpacts] : []
  };
}

function recordApiResult({ statusCode, durationMs }) {
  metricsState.api.requestsTotal += 1;

  if (typeof statusCode === 'number' && statusCode >= 500) {
    metricsState.api.errors5xxTotal += 1;
  }

  if (typeof durationMs === 'number' && durationMs >= 0) {
    metricsState.api.latencyMs.count += 1;
    metricsState.api.latencyMs.total += durationMs;
  }
}

module.exports = {
  getMetricsSnapshot,
  setReadinessMetrics,
  recordApiResult
};
