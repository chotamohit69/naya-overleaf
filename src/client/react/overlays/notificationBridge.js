function normalizeToastType(type) {
  if (type === 'success' || type === 'info' || type === 'warning' || type === 'error') {
    return type;
  }

  return 'info';
}

function dispatchToastNotification(windowRef, { message, type = 'info', fallback }) {
  const normalizedType = normalizeToastType(type);

  if (
    windowRef &&
    windowRef.NayaToast &&
    typeof windowRef.NayaToast.notify === 'function'
  ) {
    windowRef.NayaToast.notify(message, normalizedType);
    return true;
  }

  if (typeof fallback === 'function') {
    fallback(message, normalizedType);
  }

  return false;
}

module.exports = {
  dispatchToastNotification,
  normalizeToastType
};
