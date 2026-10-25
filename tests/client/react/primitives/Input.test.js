const { Input, buildInputDescriptionIds, createInputIds } = require('../../../../src/client/react/primitives/Input');

describe('Input primitive helpers', () => {
  test('creates deterministic ids from explicit id', () => {
    expect(createInputIds('project-name')).toEqual({
      inputId: 'project-name',
      helperId: 'project-name-helper',
      errorId: 'project-name-error'
    });
  });

  test('includes helper and error ids when present', () => {
    expect(buildInputDescriptionIds({ helperText: 'hint', errorMessage: 'bad', helperId: 'h', errorId: 'e' })).toBe('h e');
  });
});

describe('Input primitive', () => {
  test('renders label, helper text, and non-color error indicator', () => {
    const element = Input({
      id: 'email',
      name: 'email',
      label: 'Email',
      helperText: 'Use your work email',
      errorMessage: 'Email is required',
      value: '',
      onChange: () => {}
    });

    expect(element.type).toBe('div');
    expect(element.props.className).toContain('ui-input-field--error');

    const [, inputElement, helperElement, errorElement] = element.props.children;

    expect(inputElement.type).toBe('input');
    expect(inputElement.props['aria-invalid']).toBe('true');
    expect(inputElement.props['aria-describedby']).toBe('email-helper email-error');

    expect(helperElement.props.id).toBe('email-helper');
    expect(errorElement.props.id).toBe('email-error');
    expect(errorElement.props.children).toContain('Error:');
  });
});
