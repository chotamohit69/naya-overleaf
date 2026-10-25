const path = require('path');

const ALLOWED_DOCUMENT_EXTENSIONS = new Set(['.tex', '.bib', '.cls', '.sty']);
const SAFE_DOCUMENT_NAME_PATTERN = /^[A-Za-z0-9._ -]+$/;

function validateDocumentName(name) {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Document name is required' };
  }

  const trimmedName = name.trim();

  if (!trimmedName) {
    return { valid: false, error: 'Document name is required' };
  }

  if (trimmedName !== path.basename(trimmedName)) {
    return { valid: false, error: 'Document name cannot contain path separators' };
  }

  if (trimmedName === '.' || trimmedName === '..' || trimmedName.includes('..')) {
    return { valid: false, error: 'Document name cannot contain parent directory references' };
  }

  if (!SAFE_DOCUMENT_NAME_PATTERN.test(trimmedName)) {
    return { valid: false, error: 'Document name contains unsupported characters' };
  }

  const extension = path.extname(trimmedName).toLowerCase();
  if (!ALLOWED_DOCUMENT_EXTENSIONS.has(extension)) {
    return { valid: false, error: 'Document extension must be one of: .tex, .bib, .cls, .sty' };
  }

  return { valid: true, name: trimmedName };
}

function resolveInsideDirectory(baseDir, relativeName) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(resolvedBase, relativeName);

  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error('Resolved path escapes target directory');
  }

  return resolvedPath;
}

module.exports = {
  ALLOWED_DOCUMENT_EXTENSIONS,
  validateDocumentName,
  resolveInsideDirectory
};
