/**
 * Tests for Compilation Controller fingerprinting
 */

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(),
    isReady: false,
    get: jest.fn(),
    set: jest.fn()
  }))
}));

jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn().mockResolvedValue(),
      sendToQueue: jest.fn()
    })
  })
}));

jest.mock('../../../src/server/db/connection', () => ({
  db: {
    collection: jest.fn()
  }
}));

describe('Compilation Controller', () => {
  let buildCompilationFingerprint;

  beforeEach(() => {
    jest.resetModules();
    ({ buildCompilationFingerprint } = require('../../../src/server/api/controllers/compilation'));
  });

  it('should generate same fingerprint regardless of document order', () => {
    const docsA = [
      { name: 'main.tex', content: '\\documentclass{article}\n\\begin{document}A\\end{document}' },
      { name: 'refs.bib', content: '@book{a, title={A}}' }
    ];

    const docsB = [
      { name: 'refs.bib', content: '@book{a, title={A}}' },
      { name: 'main.tex', content: '\\documentclass{article}\n\\begin{document}A\\end{document}' }
    ];

    const fpA = buildCompilationFingerprint(docsA, 'pdflatex');
    const fpB = buildCompilationFingerprint(docsB, 'pdflatex');

    expect(fpA).toEqual(fpB);
  });

  it('should generate different fingerprint when content changes', () => {
    const docsBase = [
      { name: 'main.tex', content: '\\begin{document}A\\end{document}' }
    ];

    const docsChanged = [
      { name: 'main.tex', content: '\\begin{document}B\\end{document}' }
    ];

    const fpBase = buildCompilationFingerprint(docsBase, 'pdflatex');
    const fpChanged = buildCompilationFingerprint(docsChanged, 'pdflatex');

    expect(fpBase).not.toEqual(fpChanged);
  });

  it('should generate different fingerprint when compiler changes', () => {
    const docs = [
      { name: 'main.tex', content: '\\begin{document}Hello\\end{document}' }
    ];

    const pdfLatexFp = buildCompilationFingerprint(docs, 'pdflatex');
    const xeLatexFp = buildCompilationFingerprint(docs, 'xelatex');

    expect(pdfLatexFp).not.toEqual(xeLatexFp);
  });
});
