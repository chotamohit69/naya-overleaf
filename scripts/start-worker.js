/**
 * Script to start the LaTeX compilation worker
 */

// Set environment variables before loading the worker, which reads them at
// module initialization time.
process.env.COMPILATION_DIR = process.env.COMPILATION_DIR || './compilation';
process.env.DOCKER_IMAGE = process.env.DOCKER_IMAGE || 'naya-overleaf-texlive';

const { startWorker } = require('../src/server/compiler/worker');

// Start the worker
console.log('Starting LaTeX compilation worker...');
startWorker().catch(err => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});