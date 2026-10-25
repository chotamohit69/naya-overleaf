const React = require('react');

const BUTTON_VARIANTS = Object.freeze(['primary', 'secondary', 'ghost', 'danger']);

function normalizeButtonVariant(variant) {
  return BUTTON_VARIANTS.includes(variant) ? variant : 'primary';
}

function getButtonClassName({ variant = 'primary', loading = false, disabled = false }) {
  const normalizedVariant = normalizeButtonVariant(variant);
  const isDisabled = Boolean(disabled || loading);

  const classNames = ['ui-button', `ui-button--${normalizedVariant}`];

  if (loading) {
    classNames.push('ui-button--loading');
  }

  if (isDisabled) {
    classNames.push('ui-button--disabled');
  }

  return classNames.join(' ');
}

function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...restProps
}) {
  const isDisabled = Boolean(disabled || loading);
  const composedClassName = `${getButtonClassName({ variant, loading, disabled })} ${className}`.trim();

  return React.createElement(
    'button',
    {
      type,
      className: composedClassName,
      disabled: isDisabled,
      'aria-busy': loading ? 'true' : undefined,
      ...restProps
    },
    loading
      ? [
          React.createElement('span', { key: 'spinner', className: 'ui-button__spinner', 'aria-hidden': 'true' }),
          React.createElement('span', { key: 'label', className: 'ui-button__label' }, children)
        ]
      : children
  );
}

module.exports = {
  Button,
  BUTTON_VARIANTS,
  getButtonClassName,
  normalizeButtonVariant
};
