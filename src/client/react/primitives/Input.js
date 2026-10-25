const React = require('react');

function createInputIds(inputId) {
  if (!inputId || typeof inputId !== 'string') {
    return {
      inputId: undefined,
      helperId: undefined,
      errorId: undefined
    };
  }

  return {
    inputId,
    helperId: `${inputId}-helper`,
    errorId: `${inputId}-error`
  };
}

function buildInputDescriptionIds({ helperText, errorMessage, helperId, errorId }) {
  const describedByIds = [];

  if (helperText && helperId) {
    describedByIds.push(helperId);
  }

  if (errorMessage && errorId) {
    describedByIds.push(errorId);
  }

  return describedByIds.join(' ');
}

function Input({
  id,
  name,
  label,
  helperText,
  errorMessage,
  type = 'text',
  className = '',
  ...inputProps
}) {
  const ids = createInputIds(id);
  const hasError = Boolean(errorMessage);
  const describedBy = buildInputDescriptionIds({
    helperText,
    errorMessage,
    helperId: ids.helperId,
    errorId: ids.errorId
  });

  return React.createElement(
    'div',
    {
      className: `ui-input-field${hasError ? ' ui-input-field--error' : ''}`
    },
    label
      ? React.createElement(
          'label',
          {
            className: 'ui-input-field__label',
            htmlFor: ids.inputId
          },
          label
        )
      : null,
    React.createElement('input', {
      ...inputProps,
      id: ids.inputId,
      name,
      type,
      className: `ui-input ${className}`.trim(),
      'aria-invalid': hasError ? 'true' : undefined,
      'aria-describedby': describedBy || undefined
    }),
    helperText
      ? React.createElement(
          'div',
          {
            id: ids.helperId,
            className: 'ui-input-field__helper'
          },
          helperText
        )
      : null,
    hasError
      ? React.createElement(
          'div',
          {
            id: ids.errorId,
            className: 'ui-input-field__error',
            role: 'alert'
          },
          `Error: ${errorMessage}`
        )
      : null
  );
}

module.exports = {
  Input,
  buildInputDescriptionIds,
  createInputIds
};
