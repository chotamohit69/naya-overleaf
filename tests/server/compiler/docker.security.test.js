const fs = require('fs');
const os = require('os');
const path = require('path');

describe('Docker compiler security safeguards', () => {
  let tempDir;
  let execFileMock;
  let docker;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naya-compile-'));
    process.env.COMPILATION_DIR = tempDir;
    process.env.DOCKER_IMAGE = 'naya-overleaf-texlive';

    execFileMock = jest.fn((command, args, options, callback) => {
      callback(null, { stdout: '', stderr: '' });
    });
    jest.doMock('child_process', () => ({
      execFile: execFileMock
    }));

    docker = require('../../../src/server/compiler/docker');
  });

  afterEach(() => {
    delete process.env.COMPILATION_DIR;
    delete process.env.DOCKER_IMAGE;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const getDockerCalls = () => execFileMock.mock.calls.map(([command, args]) => ({
    command,
    args
  }));

  it('rejects document names that would escape the job directory', async () => {
    const prepared = await docker.prepareCompilationEnvironment('job-1', [
      { name: '../evil.tex', content: 'bad' }
    ]);

    expect(prepared).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'evil.tex'))).toBe(false);
  });

  it('runs the compiler in an isolated container without host bind mounts', async () => {
    const jobDir = path.join(tempDir, 'job-2');
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, 'main.tex'), '\\begin{document}x\\end{document}');
    fs.writeFileSync(path.join(jobDir, 'main.pdf'), 'pdf');

    const result = await docker.runCompilation('job-2', 'main.tex', 'pdflatex');
    const calls = getDockerCalls();

    expect(result.success).toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      'docker',
      expect.any(Array),
      expect.any(Object),
      expect.any(Function)
    );

    const createCall = calls.find(({ args }) => args[0] === 'create');
    expect(createCall).toBeDefined();
    expect(createCall.args).toEqual(expect.arrayContaining([
      '--network=none',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      'naya-overleaf-texlive',
      '/usr/local/bin/compile.sh',
      'job-2',
      'main.tex',
      'pdflatex',
      '/work'
    ]));

    const allArgs = calls.flatMap(({ args }) => args);
    expect(allArgs).not.toContain('-v');
    expect(allArgs).not.toContain(`${jobDir}:/var/texlive/compilation/job-2`);

    expect(calls.some(({ args }) => args[0] === 'cp' && args[2].endsWith(':/work'))).toBe(true);
    expect(calls.some(({ args }) => args[0] === 'start')).toBe(true);
    expect(calls.filter(({ args }) => args[0] === 'rm' && args[1] === '-f').length).toBeGreaterThanOrEqual(1);
  });

  it('archives the requested PDF instead of the first PDF in the job directory', async () => {
    const jobDir = path.join(tempDir, 'job-4');
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, 'figure.pdf'), 'wrong-pdf');
    fs.writeFileSync(path.join(jobDir, 'main.pdf'), 'correct-pdf');

    const cleaned = await docker.cleanupCompilationEnvironment('job-4', true, 'main.pdf');

    expect(cleaned).toBe(true);
    expect(fs.readFileSync(path.join(tempDir, 'job-4.pdf'), 'utf8')).toBe('correct-pdf');
    expect(fs.existsSync(jobDir)).toBe(false);
  });

  it('returns compiler output when no PDF is produced', async () => {
    const jobDir = path.join(tempDir, 'job-3');
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, 'main.tex'), '\\begin{document}x\\end{document}');
    fs.writeFileSync(
      path.join(jobDir, 'main.log'),
      '! Undefined control sequence.\nl.4 \\badcommand\n'
    );

    const result = await docker.runCompilation('job-3', 'main.tex', 'pdflatex');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Undefined control sequence/);
    expect(result.logTail).toMatch(/Undefined control sequence/);
  });
});
