/**
 * Docker Integration for LaTeX Compilation
 *
 * The worker does not bind-mount host paths. It creates a throwaway container,
 * copies the job files into a world-writable work directory inside that
 * container, runs the compiler, copies the artifacts back, and removes the
 * container. This works with only the Docker socket and avoids host/container
 * path translation problems.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');
const { validateDocumentName, resolveInsideDirectory } = require('../utils/documentNames');

const execFilePromise = util.promisify(execFile);

const DOCKER_IMAGE = process.env.DOCKER_IMAGE || 'naya-overleaf-texlive';
const COMPILATION_DIR = process.env.COMPILATION_DIR || path.join(__dirname, '../../../compilation');
const COMPILATION_TIMEOUT_MS = Number.parseInt(process.env.COMPILATION_TIMEOUT_MS || '120000', 10);
const DOCKER_COMMAND_TIMEOUT_MS = Number.parseInt(process.env.DOCKER_COMMAND_TIMEOUT_MS || '30000', 10);
const MAX_STORED_LOG_BYTES = 200 * 1024;
const MAX_LOG_TAIL_LINES = 100;
const PREVIEW_MODE = process.env.PREVIEW_MODE === 'true';

function runDocker(args, options = {}) {
  return execFilePromise('docker', args, {
    timeout: options.timeout || DOCKER_COMMAND_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024
  }).then(
    ({ stdout = '', stderr = '' }) => ({ ok: true, code: 0, stdout, stderr }),
    (error) => ({
      ok: false,
      code: typeof error.code === 'number' ? error.code : 1,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      error
    })
  );
}

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return '';
  }
}

function truncateText(value, maxBytes) {
  if (typeof value !== 'string') {
    return '';
  }

  if (Buffer.byteLength(value, 'utf8') <= maxBytes) {
    return value;
  }

  return value.slice(-maxBytes);
}

function extractLogTail(log) {
  if (!log) {
    return '';
  }

  return log
    .split(/\r?\n/)
    .slice(-MAX_LOG_TAIL_LINES)
    .join('\n')
    .trim();
}

function extractFirstError(log) {
  if (!log) {
    return '';
  }

  const lines = log.split(/\r?\n/);
  const errorLine = lines.find((line) => /^!/.test(line))
    || lines.find((line) => /^.*:\d+:/.test(line))
    || lines.find((line) => /error/i.test(line));

  return errorLine ? errorLine.trim() : '';
}

function getSafeContainerName(jobId) {
  const normalized = String(jobId).replace(/[^A-Za-z0-9_.-]/g, '-');
  return `naya-compile-${normalized}`.slice(0, 120);
}

async function readCompilationArtifacts(jobDir, mainFile) {
  const baseName = mainFile.replace(/\.tex$/i, '');
  const log = truncateText(readTextIfExists(path.join(jobDir, `${baseName}.log`)), MAX_STORED_LOG_BYTES);
  const stdout = truncateText(readTextIfExists(path.join(jobDir, `${baseName}.stdout`)), MAX_STORED_LOG_BYTES);
  const stderr = truncateText(readTextIfExists(path.join(jobDir, `${baseName}.stderr`)), MAX_STORED_LOG_BYTES);

  return {
    log,
    logTail: extractLogTail(log || stderr || stdout),
    stdout,
    stderr
  };
}

/**
 * Run the compiler directly in the job directory.
 *
 * This is used by the hosted preview, where the process runs inside a
 * container and cannot access a Docker socket. The production worker keeps
 * using the isolated Docker path.
 */
async function runLocalCompilation(jobDir, mainFile, compiler) {
  const baseName = mainFile.replace(/\.tex$/i, '');
  const stdoutPath = path.join(jobDir, `${baseName}.stdout`);
  const stderrPath = path.join(jobDir, `${baseName}.stderr`);
  fs.writeFileSync(stdoutPath, '');
  fs.writeFileSync(stderrPath, '');

  const args = compiler === 'latexmk'
    ? ['-pdf', '-interaction=nonstopmode', '-file-line-error', mainFile]
    : ['-interaction=nonstopmode', '-file-line-error', mainFile];

  const execute = async () => {
    try {
      const result = await execFilePromise(compiler, args, {
        cwd: jobDir,
        timeout: COMPILATION_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024
      });
      fs.appendFileSync(stdoutPath, result.stdout || '');
      fs.appendFileSync(stderrPath, result.stderr || '');
      return 0;
    } catch (error) {
      fs.appendFileSync(stdoutPath, error.stdout || '');
      fs.appendFileSync(stderrPath, error.stderr || '');
      return typeof error.code === 'number' ? error.code : 1;
    }
  };

  const firstStatus = await execute();
  const secondStatus = compiler === 'latexmk' ? 0 : await execute();
  const artifacts = await readCompilationArtifacts(jobDir, mainFile);
  const pdfPath = resolveInsideDirectory(jobDir, `${baseName}.pdf`);

  if (fs.existsSync(pdfPath)) {
    return {
      success: true,
      pdfPath,
      ...artifacts
    };
  }

  return {
    success: false,
    error: extractFirstError(artifacts.log)
      || artifacts.stderr.trim()
      || 'PDF file was not generated',
    exitCode: firstStatus || secondStatus,
    ...artifacts
  };
}

/**
 * Run a LaTeX compilation job in a Docker container.
 * @param {string} jobId
 * @param {string} mainFile
 * @param {string} compiler
 * @returns {Promise<Object>}
 */
async function runCompilation(jobId, mainFile, compiler = 'pdflatex') {
  const containerName = getSafeContainerName(jobId);
  let containerCreated = false;

  try {
    const jobDir = resolveInsideDirectory(COMPILATION_DIR, jobId);
    if (!fs.existsSync(jobDir)) {
      throw new Error(`Job directory does not exist: ${jobDir}`);
    }

    const validCompilers = ['pdflatex', 'xelatex', 'lualatex', 'latexmk'];
    if (!validCompilers.includes(compiler)) {
      throw new Error(`Invalid compiler: ${compiler}. Must be one of: ${validCompilers.join(', ')}`);
    }

    if (!mainFile.endsWith('.tex')) {
      mainFile = `${mainFile}.tex`;
    }

    const mainFileValidation = validateDocumentName(mainFile);
    if (!mainFileValidation.valid || !mainFileValidation.name.endsWith('.tex')) {
      throw new Error(mainFileValidation.error || 'Main file must be a .tex document');
    }
    mainFile = mainFileValidation.name;

    const mainFilePath = resolveInsideDirectory(jobDir, mainFile);
    if (!fs.existsSync(mainFilePath)) {
      throw new Error(`Main file does not exist: ${mainFilePath}`);
    }

    if (PREVIEW_MODE) {
      return await runLocalCompilation(jobDir, mainFile, compiler);
    }

    // A stale container with the same name would make `docker create` fail.
    await runDocker(['rm', '-f', containerName]);

    const createResult = await runDocker([
      'create',
      '--name',
      containerName,
      '--network=none',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      DOCKER_IMAGE,
      '/usr/local/bin/compile.sh',
      String(jobId),
      mainFile,
      compiler,
      '/work'
    ]);

    if (!createResult.ok) {
      return {
        success: false,
        error: createResult.stderr.trim() || 'Failed to create compilation container',
        stdout: createResult.stdout,
        stderr: createResult.stderr
      };
    }

    containerCreated = true;

    // Copy the prepared job directory into the container's writable work dir.
    const copyInResult = await runDocker(['cp', `${jobDir}${path.sep}.`, `${containerName}:/work`]);
    if (!copyInResult.ok) {
      return {
        success: false,
        error: copyInResult.stderr.trim() || 'Failed to copy documents into compilation container',
        stdout: copyInResult.stdout,
        stderr: copyInResult.stderr
      };
    }

    const startResult = await runDocker(['start', '-a', containerName], {
      timeout: COMPILATION_TIMEOUT_MS
    });

    // Always copy artifacts back, even when the compiler exits non-zero. The
    // log and PDF are the useful part of a failed compilation.
    await runDocker(['cp', `${containerName}:/work/.`, jobDir]);

    const artifacts = await readCompilationArtifacts(jobDir, mainFile);
    const pdfFile = mainFile.replace(/\.tex$/i, '.pdf');
    const pdfPath = resolveInsideDirectory(jobDir, pdfFile);

    if (fs.existsSync(pdfPath)) {
      return {
        success: true,
        pdfPath,
        stdout: startResult.stdout,
        stderr: startResult.stderr,
        ...artifacts
      };
    }

    const errorMessage = extractFirstError(artifacts.log)
      || startResult.stderr.trim()
      || 'PDF file was not generated';

    return {
      success: false,
      error: errorMessage,
      stdout: startResult.stdout,
      stderr: startResult.stderr,
      exitCode: startResult.code,
      ...artifacts
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      log: '',
      logTail: '',
      exitCode: typeof err.code === 'number' ? err.code : undefined
    };
  } finally {
    if (containerCreated) {
      await runDocker(['rm', '-f', containerName]);
    }
  }
}

/**
 * Prepare the compilation environment.
 * @param {string} jobId
 * @param {Array<Object>} documents
 * @returns {Promise<boolean>}
 */
async function prepareCompilationEnvironment(jobId, documents) {
  try {
    const jobDir = resolveInsideDirectory(COMPILATION_DIR, jobId);

    // Clear any files left by a previous attempt before writing this one.
    fs.rmSync(jobDir, { recursive: true, force: true });
    fs.mkdirSync(jobDir, { recursive: true });

    for (const doc of documents) {
      const documentNameValidation = validateDocumentName(doc.name);
      if (!documentNameValidation.valid) {
        throw new Error(documentNameValidation.error);
      }
      const docPath = resolveInsideDirectory(jobDir, documentNameValidation.name);
      fs.writeFileSync(docPath, doc.content);
    }

    return true;
  } catch (err) {
    console.error('Failed to prepare compilation environment:', err);
    return false;
  }
}

/**
 * Clean up the compilation environment.
 * @param {string} jobId
 * @param {boolean} keepPdf
 * @param {string|null} pdfFileName
 * @returns {Promise<boolean>}
 */
async function cleanupCompilationEnvironment(jobId, keepPdf = true, pdfFileName = null) {
  try {
    const jobDir = resolveInsideDirectory(COMPILATION_DIR, jobId);

    if (!fs.existsSync(jobDir)) {
      return true;
    }

    let pdfPath = null;
    if (keepPdf) {
      let pdfFile = pdfFileName;

      if (pdfFile) {
        if (
          typeof pdfFile !== 'string'
          || path.basename(pdfFile) !== pdfFile
          || pdfFile.includes('..')
          || !/^[A-Za-z0-9._ -]+\.pdf$/i.test(pdfFile)
        ) {
          throw new Error('Invalid PDF file name');
        }
      } else {
        const files = fs.readdirSync(jobDir);
        pdfFile = files.find((file) => file.endsWith('.pdf'));
      }

      if (pdfFile) {
        const originalPdfPath = resolveInsideDirectory(jobDir, pdfFile);
        if (fs.existsSync(originalPdfPath)) {
          pdfPath = resolveInsideDirectory(COMPILATION_DIR, `${jobId}.pdf`);
          fs.copyFileSync(originalPdfPath, pdfPath);
        }
      }
    }

    fs.rmSync(jobDir, { recursive: true, force: true });

    return true;
  } catch (err) {
    console.error('Failed to clean up compilation environment:', err);
    return false;
  }
}

module.exports = {
  runCompilation,
  prepareCompilationEnvironment,
  cleanupCompilationEnvironment
};
