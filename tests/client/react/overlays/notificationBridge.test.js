const {
  dispatchToastNotification,
  normalizeToastType
} = require('../../../../src/client/react/overlays/notificationBridge');

describe('notification bridge', () => {
  test('normalizes unknown type to info', () => {
    expect(normalizeToastType('danger')).toBe('info');
  });

  test('dispatches through toast bridge when available', () => {
    const notify = jest.fn();
    const windowRef = {
      NayaToast: {
        notify
      }
    };

    const usedBridge = dispatchToastNotification(windowRef, {
      message: 'Saved',
      type: 'success'
    });

    expect(usedBridge).toBe(true);
    expect(notify).toHaveBeenCalledWith('Saved', 'success');
  });

  test('falls back when toast bridge unavailable', () => {
    const fallback = jest.fn();

    const usedBridge = dispatchToastNotification(undefined, {
      message: 'Fallback',
      type: 'unknown',
      fallback
    });

    expect(usedBridge).toBe(false);
    expect(fallback).toHaveBeenCalledWith('Fallback', 'info');
  });
});
