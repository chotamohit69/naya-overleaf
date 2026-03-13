import { StreamLanguage, HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const latexParser = {
  startState: () => ({ inMath: false, envStack: [] }),

  token(stream, state) {
    if (stream.eatSpace()) return null;

    if (stream.match('\\\\')) {
      return 'escape';
    }

    if (stream.match('\\[') || stream.match('\\(')) {
      state.inMath = true;
      return 'keyword';
    }

    if (stream.match('\\]') || stream.match('\\)')) {
      state.inMath = false;
      return 'keyword';
    }

    if (stream.match('$$')) {
      state.inMath = !state.inMath;
      return 'keyword';
    }

    if (stream.match('$')) {
      state.inMath = !state.inMath;
      return 'keyword';
    }

    if (state.inMath) {
      if (stream.match(/\\[a-zA-Z]+/)) return 'atom';
      if (stream.match(/[a-zA-Z]+/)) return 'variable';
      if (stream.match(/[0-9]+/)) return 'number';
      if (stream.match(/[+\-*\/=<>^_]/)) return 'operator';
      stream.next();
      return null;
    }

    if (stream.match(/\\begin\{([^}]+)\}/)) {
      const match = /\\begin\{([^}]+)\}/.exec(stream.current());
      if (match?.[1]) {
        state.envStack.push(match[1]);
      }
      return 'keyword';
    }

    if (stream.match(/\\end\{([^}]+)\}/)) {
      state.envStack.pop();
      return 'keyword';
    }

    if (stream.match(/\\[a-zA-Z@]+/)) {
      const cmd = stream.current();
      const structureCommands = ['\\documentclass', '\\usepackage', '\\title', '\\author', '\\date', '\\maketitle', '\\tableofcontents', '\\section', '\\subsection', '\\subsubsection', '\\chapter', '\\part', '\\paragraph', '\\subparagraph', '\\newpage', '\\clearpage', '\\linebreak', '\\pagebreak'];
      const fontCommands = ['\\textbf', '\\textit', '\\texttt', '\\textsc', '\\textsf', '\\textrm', '\\emph', '\\underline', '\\uppercase', '\\lowercase'];
      const refCommands = ['\\label', '\\ref', '\\eqref', '\\cite', '\\bibliography', '\\bibliographystyle', '\\footnote', '\\url', '\\href', '\\input', '\\include'];

      if (structureCommands.includes(cmd)) return 'heading';
      if (fontCommands.includes(cmd)) return 'emphasis';
      if (refCommands.includes(cmd)) return 'link';
      return 'keyword';
    }

    if (stream.match(/\\[^a-zA-Z]/)) return 'escape';
    if (stream.match(/%[^\n]*/)) return 'comment';
    if (stream.match(/\{[^}]*\}/)) return 'bracket';
    if (stream.match(/\[[^\]]*\]/)) return 'bracket';

    stream.next();
    return null;
  }
};

const latexLanguage = StreamLanguage.define(latexParser);

export const latexHighlighting = HighlightStyle.define([
  { tag: t.comment, color: '#6a737d', fontStyle: 'italic' },
  { tag: t.keyword, color: '#005cc5' },
  { tag: t.heading, color: '#6f42c1', fontWeight: 'bold' },
  { tag: t.emphasis, color: '#d73a49' },
  { tag: t.link, color: '#032f62', textDecoration: 'underline' },
  { tag: t.atom, color: '#005cc5' },
  { tag: t.number, color: '#e36209' },
  { tag: t.variableName, color: '#24292e' },
  { tag: t.operator, color: '#d73a49' },
  { tag: t.escape, color: '#22863a' },
  { tag: t.bracket, color: '#24292e' }
]);

export function latex() {
  return latexLanguage;
}

export default latexLanguage;
