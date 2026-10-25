const {
  Toast,
  TOAST_VARIANTS,
  createToast,
  normalizeToastVariant,
  toastReducer,
  toastActionTypes
} = require('../../../../src/client/react/overlays/ToastProvider');

describe('Toast helpers', () => {
  test('keeps toast variants typed and stable', () => {
    expect(TOAST_VARIANTS).toEqual(['success', 'info', 'warning', 'error']);
    expect(normalizeToastVariant('danger')).toBe('info');
  });

  test('creates toasts with sane defaults', () => {
    const toast = createToast({ message: 'Saved', variant: 'success' });

    expect(toast.message).toBe('Saved');
    expect(toast.variant).toBe('success');
    expect(toast.duration).toBe(3000);
    expect(typeof toast.id).toBe('string');
  });
});

describe('toastReducer', () => {
  test('adds and removes toasts immutably', () => {
    const first = createToast({ id: '1', message: 'Saved', variant: 'success' });

    const added = toastReducer([], {
      type: toastActionTypes.ADD_TOAST,
      payload: first
    });

    expect(added).toEqual([first]);

    const removed = toastReducer(added, {
      type: toastActionTypes.REMOVE_TOAST,
      payload: { id: '1' }
    });

    expect(removed).toEqual([]);
    expect(added).toEqual([first]);
  });
});

describe('Toast primitive', () => {
  test('renders status semantics for assistive tech', () => {
    const element = Toast({ toast: createToast({ message: 'Upload failed', variant: 'error' }) });

    expect(element.props.role).toBe('status');
    expect(element.props.className).toContain('ui-toast--error');
    expect(element.props.children).toBe('Upload failed');
  });
});
