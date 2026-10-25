const path = require('path');
const {
  validateDocumentName,
  resolveInsideDirectory
} = require('../../../src/server/utils/documentNames');

describe('document name utilities', () => {
  it('accepts simple supported document names', () => {
    expect(validateDocumentName('main.tex')).toEqual({
      valid: true,
      name: 'main.tex'
    });
  });

  it('rejects names with path traversal', () => {
    expect(validateDocumentName('../main.tex')).toEqual(
      expect.objectContaining({ valid: false })
    );
    expect(validateDocumentName('..main.tex')).toEqual(
      expect.objectContaining({ valid: false })
    );
  });

  it('rejects unsupported extensions', () => {
    expect(validateDocumentName('script.js')).toEqual(
      expect.objectContaining({ valid: false })
    );
  });

  it('prevents resolved paths from escaping the base directory', () => {
    const base = path.resolve('compilation');
    expect(() => resolveInsideDirectory(base, '../escape.pdf')).toThrow(/escapes/i);
  });
});
