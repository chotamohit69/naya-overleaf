const {
  getButtonClassName,
  normalizeButtonVariant
} = require('../../../../src/client/react/primitives/Button');

describe('Button primitive helpers', () => {
  test('normalizes unknown variant to primary', () => {
    expect(normalizeButtonVariant('unknown')).toBe('primary');
  });

  test('builds class list for danger variant and loading state', () => {
    expect(getButtonClassName({ variant: 'danger', loading: true, disabled: false })).toBe(
      'ui-button ui-button--danger ui-button--loading ui-button--disabled'
    );
  });

  test('adds disabled class when disabled without loading', () => {
    expect(getButtonClassName({ variant: 'secondary', loading: false, disabled: true })).toBe(
      'ui-button ui-button--secondary ui-button--disabled'
    );
  });
});
