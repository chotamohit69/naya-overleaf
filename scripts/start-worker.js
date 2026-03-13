/**
 * Script to start the LaTeX compilation worker
 */

const { startWorker } = require('../src/server/compiler/worker');

// Set environment variables if needed
process.env.COMPILATION_DIR = process.env.COMPILATION_DIR || './compilation';
process.env.DOCKER_IMAGE = process.env.DOCKER_IMAGE || 'naya-overleaf-texlive';

// Start the worker
console.log('Starting LaTeX compilation worker...');
startWorker().catch(err => {
  console.error('Failed to start worker:', err);
  process.exit(1);
});