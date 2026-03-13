function sumBy(items, field) {
  return items.reduce((sum, item) => {
    const value = Number(item?.[field]) || 0;
    return sum + value;
  }, 0);
}

function isDurationAtLeast(items, field, threshold) {
  const total = sumBy(items, field);
  return total >= threshold;
}

function evaluateAlerts(series = {}) {
  const alerts = [];

  const readinessWindows = Array.isArray(series.readinessWindows) ? series.readinessWindows : [];
  const readinessFailures = readinessWindows.filter(window => window?.ready === false);
  if (readinessFailures.length >= 3
    && isDurationAtLeast(readinessFailures, 'durationSeconds', 90)) {
    alerts.push({
      code: 'ALERT_READINESS_CONSECUTIVE_FAILURES',
      severity: 'critical'
    });
  }

  const apiWindows = Array.isArray(series.apiWindows) ? series.apiWindows : [];
  const apiDuration = sumBy(apiWindows, 'durationMinutes');
  const apiRequests = sumBy(apiWindows, 'requests');
  const api5xx = sumBy(apiWindows, 'errors5xx');
  const api5xxRate = apiRequests > 0 ? api5xx / apiRequests : 0;
  if (apiDuration >= 10 && api5xxRate > 0.05) {
    alerts.push({
      code: 'ALERT_API_5XX_RATE_SPIKE',
      severity: 'high'
    });
  }

  const queueWindows = Array.isArray(series.queueWindows) ? series.queueWindows : [];
  const queueDuration = sumBy(queueWindows, 'durationMinutes');
  const queueBacklogBreach = queueWindows.length > 0
    && queueWindows.every(window => (Number(window?.backlog) || 0) > 200);
  if (queueDuration >= 10 && queueBacklogBreach) {
    alerts.push({
      code: 'ALERT_QUEUE_BACKLOG_BREACH',
      severity: 'high'
    });
  }

  const compileWindows = Array.isArray(series.compileWindows) ? series.compileWindows : [];
  const compileDuration = sumBy(compileWindows, 'durationMinutes');
  const compileTotal = sumBy(compileWindows, 'totalCompiles');
  const compileFailed = sumBy(compileWindows, 'failedCompiles');
  const compileFailureRate = compileTotal > 0 ? compileFailed / compileTotal : 0;
  if (compileDuration >= 15 && compileFailureRate > 0.1) {
    alerts.push({
      code: 'ALERT_COMPILE_FAILURE_RATE_SPIKE',
      severity: 'high'
    });
  }

  return alerts;
}

module.exports = {
  evaluateAlerts
};
