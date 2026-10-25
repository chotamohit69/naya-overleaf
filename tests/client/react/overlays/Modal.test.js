const {
  Modal,
  getFocusableElements,
  trapFocusByDirection,
  handleModalKeyDown
} = require('../../../../src/client/react/overlays/Modal');

describe('Modal helper behavior', () => {
  test('returns only focusable elements', () => {
    const focusable = { disabled: false, tabIndex: 0 };
    const disabled = { disabled: true, tabIndex: 0 };
    const noTab = { disabled: false, tabIndex: -1 };

    const container = {
      querySelectorAll: jest.fn(() => [focusable, disabled, noTab])
    };

    expect(getFocusableElements(container)).toEqual([focusable]);
  });

  test('cycles focus to first element when tabbing from last', () => {
    const first = { focus: jest.fn() };
    const last = { focus: jest.fn() };

    const event = {
      preventDefault: jest.fn()
    };

    trapFocusByDirection({
      container: { querySelectorAll: () => [first, last] },
      currentElement: last,
      direction: 'forward',
      event
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(first.focus).toHaveBeenCalledTimes(1);
  });

  test('calls onClose on escape key', () => {
    const onClose = jest.fn();
    const event = {
      key: 'Escape',
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };

    handleModalKeyDown({ event, onClose, container: null });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe('Modal primitive', () => {
  test('returns null when closed', () => {
    expect(Modal({ isOpen: false, title: 'Ignored' })).toBeNull();
  });

  test('renders dialog semantics when open', () => {
    const element = Modal({
      isOpen: true,
      title: 'Create project',
      description: 'Name and template',
      children: 'body',
      onClose: () => {}
    });

    expect(element.props.className).toBe('ui-modal__overlay');

    const dialog = element.props.children;
    expect(dialog.props.role).toBe('dialog');
    expect(dialog.props['aria-modal']).toBe('true');
    expect(dialog.props['aria-label']).toBe('Create project');
  });
});
