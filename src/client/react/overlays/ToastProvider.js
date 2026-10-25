const React = require('react');

const TOAST_VARIANTS = Object.freeze(['success', 'info', 'warning', 'error']);

const toastActionTypes = Object.freeze({
  ADD_TOAST: 'ADD_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST'
});

function normalizeToastVariant(variant) {
  return TOAST_VARIANTS.includes(variant) ? variant : 'info';
}

function createToast({ id, message, variant = 'info', duration = 3000 }) {
  return {
    id: id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message,
    variant: normalizeToastVariant(variant),
    duration
  };
}

function toastReducer(state, action) {
  if (!action || !action.type) {
    return state;
  }

  if (action.type === toastActionTypes.ADD_TOAST) {
    return [...state, action.payload];
  }

  if (action.type === toastActionTypes.REMOVE_TOAST) {
    return state.filter((toast) => toast.id !== action.payload.id);
  }

  return state;
}

const ToastContext = React.createContext({
  showToast: () => {},
  removeToast: () => {}
});

function Toast({ toast }) {
  return React.createElement(
    'div',
    {
      role: 'status',
      className: `ui-toast ui-toast--${toast.variant}`,
      'data-toast-id': toast.id
    },
    toast.message
  );
}

function ToastProvider({ children, windowRef }) {
  const [toasts, dispatch] = React.useReducer(toastReducer, []);

  const removeToast = React.useCallback((id) => {
    dispatch({
      type: toastActionTypes.REMOVE_TOAST,
      payload: { id }
    });
  }, []);

  const showToast = React.useCallback(
    ({ message, variant, duration }) => {
      const toast = createToast({ message, variant, duration });

      dispatch({
        type: toastActionTypes.ADD_TOAST,
        payload: toast
      });

      const timeoutDuration = Number.isFinite(toast.duration) ? toast.duration : 3000;
      setTimeout(() => {
        removeToast(toast.id);
      }, timeoutDuration);

      return toast.id;
    },
    [removeToast]
  );

  React.useEffect(() => {
    const resolvedWindow = typeof windowRef !== 'undefined'
      ? windowRef
      : typeof window !== 'undefined'
        ? window
        : undefined;

    if (!resolvedWindow) {
      return undefined;
    }

    const bridge = {
      notify: (message, variant = 'info') => showToast({ message, variant })
    };

    resolvedWindow.NayaToast = bridge;

    return () => {
      if (resolvedWindow.NayaToast === bridge) {
        delete resolvedWindow.NayaToast;
      }
    };
  }, [showToast, windowRef]);

  const contextValue = React.useMemo(
    () => ({
      showToast,
      removeToast
    }),
    [removeToast, showToast]
  );

  return React.createElement(
    ToastContext.Provider,
    {
      value: contextValue
    },
    children,
    React.createElement(
      'div',
      {
        className: 'ui-toast-region',
        'aria-live': 'polite',
        'aria-atomic': 'false'
      },
      toasts.map((toast) => React.createElement(Toast, { key: toast.id, toast }))
    )
  );
}

function useToast() {
  return React.useContext(ToastContext);
}

module.exports = {
  TOAST_VARIANTS,
  Toast,
  ToastProvider,
  createToast,
  normalizeToastVariant,
  toastActionTypes,
  toastReducer,
  useToast
};
