const SERVICE_NAME = process.env.SERVICE_NAME || 'naya-overleaf-server';

function normalizeString(value, fallback) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function createLogEvent(level, message, context = {}) {
  const event = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    component: normalizeString(context.component, 'server'),
    correlationId: normalizeString(context.correlationId, 'unknown'),
    message: normalizeString(message, ''),
    errorClass: normalizeString(context.errorClass, 'UNKNOWN_ERROR')
  };

  console.log(JSON.stringify(event));
  return event;
}

function logInfo(message, context = {}) {
  return createLogEvent('info', message, {
    ...context,
    errorClass: context.errorClass || 'NONE'
  });
}

function logWarn(message, context = {}) {
  return createLogEvent('warn', message, context);
}

function logError(message, context = {}) {
  return createLogEvent('error', message, context);
}

module.exports = {
  createLogEvent,
  logInfo,
  logWarn,
  logError
};
