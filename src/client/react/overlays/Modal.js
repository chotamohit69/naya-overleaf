const React = require('react');

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function getFocusableElements(container) {
  if (!container || typeof container.querySelectorAll !== 'function') {
    return [];
  }

  const nodes = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));

  return nodes.filter((node) => {
    if (!node || node.disabled) {
      return false;
    }

    return !(typeof node.tabIndex === 'number' && node.tabIndex < 0);
  });
}

function trapFocusByDirection({ container, currentElement, direction, event }) {
  const focusableElements = getFocusableElements(container);
  if (focusableElements.length === 0) {
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (direction === 'forward' && currentElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }

  if (direction === 'backward' && currentElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  }
}

function handleModalKeyDown({ event, onClose, container }) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();

    if (typeof onClose === 'function') {
      onClose();
    }

    return;
  }

  if (event.key === 'Tab') {
    trapFocusByDirection({
      container,
      currentElement: typeof document !== 'undefined' ? document.activeElement : null,
      direction: event.shiftKey ? 'backward' : 'forward',
      event
    });
  }
}

function Modal({ isOpen, title, description, children, onClose }) {
  if (!isOpen) {
    return null;
  }

  let dialogNode = null;

  const setDialogNode = (node) => {
    dialogNode = node;

    const focusableElements = getFocusableElements(node);
    const firstElement = focusableElements[0];

    if (firstElement && typeof firstElement.focus === 'function') {
      firstElement.focus();
    }
  };

  return React.createElement(
    'div',
    {
      className: 'ui-modal__overlay',
      onMouseDown: (event) => {
        if (event.target === event.currentTarget && typeof onClose === 'function') {
          onClose();
        }
      }
    },
    React.createElement(
      'div',
      {
        ref: setDialogNode,
        className: 'ui-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': title,
        'aria-describedby': description ? 'ui-modal-description' : undefined,
        onKeyDown: (event) => handleModalKeyDown({ event, onClose, container: dialogNode })
      },
      React.createElement(
        'div',
        {
          className: 'ui-modal__header'
        },
        React.createElement('h2', { className: 'ui-modal__title' }, title),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'ui-modal__close',
            onClick: onClose,
            'aria-label': 'Close dialog'
          },
          '×'
        )
      ),
      description
        ? React.createElement(
            'p',
            {
              id: 'ui-modal-description',
              className: 'ui-modal__description'
            },
            description
          )
        : null,
      React.createElement(
        'div',
        {
          className: 'ui-modal__content'
        },
        children
      )
    )
  );
}

module.exports = {
  FOCUSABLE_SELECTOR,
  Modal,
  getFocusableElements,
  handleModalKeyDown,
  trapFocusByDirection
};
