const { Button, getButtonClassName, normalizeButtonVariant } = require('../../../../src/client/react/primitives/Button');

describe('Button primitive helpers', () => {
  test('normalizes unknown variant to primary', () => {
    expect(normalizeButtonVariant('unknown')).toBe('primary');
  });

  test('builds class list for danger variant and loading state', () => {
    expect(getButtonClassName({ variant: 'danger', loading: true, disabled: false })).toBe(
      'ui-button ui-button--danger ui-button--loading ui-button--disabled'
    );
  });
});

describe('Button primitive', () => {
  test('applies disabled semantics when loading', () => {
    const element = Button({
      variant: 'secondary',
      loading: true,
      disabled: false,
      children: 'Save changes'
    });

    expect(element.type).toBe('button');
    expect(element.props.disabled).toBe(true);
    expect(element.props['aria-busy']).toBe('true');
    expect(element.props.className).toContain('ui-button--secondary');
    expect(element.props.children).toEqual([
      expect.objectContaining({
        props: expect.objectContaining({ className: 'ui-button__spinner', 'aria-hidden': 'true' })
      }),
      expect.objectContaining({
        props: expect.objectContaining({ className: 'ui-button__label', children: 'Save changes' })
      })
    ]);
  });
});
