/**
 * In-process compilation queue for the hosted preview.
 *
 * Render does not expose a Docker socket, so the preview cannot run the
 * production worker. Jobs are processed in the app process with the local
 * compiler backend instead of RabbitMQ.
 */

const { ObjectId } = require('mongodb');
const docker = require('./docker');

function getJobObjectId(jobId) {
  return jobId instanceof ObjectId ? jobId : new ObjectId(jobId);
}

async function updateJob(db, jobId, update) {
  await db.collection('compilation_jobs').updateOne(
    { _id: getJobObjectId(jobId) },
    { $set: { ...update, updatedAt: new Date() } }
  );
}

async function processJob(db, job) {
  // Preview jobs run one at a time to keep memory bounded on small instances.

  const startedAt = Date.now();
  const mainFile = job.mainFile || 'main.tex';

  await updateJob(db, job.jobId, { status: 'processing' });

  try {
    const prepared = await docker.prepareCompilationEnvironment(job.jobId, job.documents);
    if (!prepared) {
      throw new Error('Failed to prepare the compilation environment');
    }

    const result = await docker.runCompilation(job.jobId, mainFile, job.compiler);
    if (!result.success) {
      const compilationError = new Error(result.error || 'Compilation failed');
      compilationError.compilation = result;
      throw compilationError;
    }

    const pdfFileName = mainFile.replace(/\.tex$/i, '.pdf');
    await docker.cleanupCompilationEnvironment(job.jobId, true, pdfFileName);

    await updateJob(db, job.jobId, {
      status: 'completed',
      pdfPath: `${job.jobId}.pdf`,
      durationMs: Date.now() - startedAt,
      error: null
    });

    console.log(`Preview compilation ${job.jobId} completed`);
  } catch (error) {
    const compilation = error.compilation || {};

    await docker.cleanupCompilationEnvironment(job.jobId, false);
    await updateJob(db, job.jobId, {
      status: 'failed',
      error: error.message,
      stdout: compilation.stdout || '',
      stderr: compilation.stderr || '',
      logTail: compilation.logTail || '',
      exitCode: compilation.exitCode,
      durationMs: Date.now() - startedAt
    });

    console.error(`Preview compilation ${job.jobId} failed: ${error.message}`);
  }
}

let queueTail = Promise.resolve();

function enqueueCompilation(db, job) {
  queueTail = queueTail
    .then(() => processJob(db, job))
    .catch((error) => {
      console.error('Preview compilation worker crashed:', error);
    });

  return true;
}

module.exports = {
  enqueueCompilation,
  processJob
};
