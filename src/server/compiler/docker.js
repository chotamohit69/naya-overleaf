/**
 * Docker Integration for LaTeX Compilation
 * Handles communication with the Docker container for LaTeX compilation
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

// Promisify exec
const execPromise = util.promisify(exec);

// Configuration
const DOCKER_IMAGE = process.env.DOCKER_IMAGE || 'naya-overleaf-texlive';
const COMPILATION_DIR = process.env.COMPILATION_DIR || path.join(__dirname, '../../../compilation');

/**
 * Run a LaTeX compilation job in a Docker container
 * @param {string} jobId - The unique job ID
 * @param {string} mainFile - The main LaTeX file to compile
 * @param {string} compiler - The LaTeX compiler to use (pdflatex, xelatex, lualatex, latexmk)
 * @returns {Promise<Object>} - The compilation result
 */
async function runCompilation(jobId, mainFile, compiler = 'pdflatex') {
  try {
    // Ensure the job directory exists
    const jobDir = path.join(COMPILATION_DIR, jobId);
    if (!fs.existsSync(jobDir)) {
      throw new Error(`Job directory does not exist: ${jobDir}`);
    }
    
    // Validate compiler
    const validCompilers = ['pdflatex', 'xelatex', 'lualatex', 'latexmk'];
    if (!validCompilers.includes(compiler)) {
      throw new Error(`Invalid compiler: ${compiler}. Must be one of: ${validCompilers.join(', ')}`);
    }
    
    // Validate main file
    if (!mainFile.endsWith('.tex')) {
      mainFile = `${mainFile}.tex`;
    }
    
    const mainFilePath = path.join(jobDir, mainFile);
    if (!fs.existsSync(mainFilePath)) {
      throw new Error(`Main file does not exist: ${mainFilePath}`);
    }
    
    // Run Docker container
    const dockerCmd = `docker run --rm \
      --security-opt=no-new-privileges \
      --cap-drop=ALL \
      --network=none \
      -v "${jobDir}:/var/texlive/compilation/${jobId}" \
      ${DOCKER_IMAGE} \
      /usr/local/bin/compile.sh "${jobId}" "${mainFile}" "${compiler}"`;
    
    console.log(`Running Docker command: ${dockerCmd}`);
    
    const { stdout, stderr } = await execPromise(dockerCmd);
    
    // Check if PDF was generated
    const pdfFile = mainFile.replace(/\.tex$/, '.pdf');
    const pdfPath = path.join(jobDir, pdfFile);
    
    if (fs.existsSync(pdfPath)) {
      return {
        success: true,
        pdfPath,
        stdout,
        stderr
      };
    } else {
      // Compilation failed
      return {
        success: false,
        error: 'PDF file was not generated',
        stdout,
        stderr
      };
    }
  } catch (err) {
    console.error('Docker compilation error:', err);
    return {
      success: false,
      error: err.message,
      stderr: err.stderr || ''
    };
  }
}

/**
 * Prepare the compilation environment
 * @param {string} jobId - The unique job ID
 * @param {Array<Object>} documents - The documents to compile
 * @returns {Promise<boolean>} - Whether the environment was successfully prepared
 */
async function prepareCompilationEnvironment(jobId, documents) {
  try {
    // Create job directory
    const jobDir = path.join(COMPILATION_DIR, jobId);
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }
    
    // Write documents to job directory
    for (const doc of documents) {
      const docPath = path.join(jobDir, doc.name);
      fs.writeFileSync(docPath, doc.content);
    }
    
    return true;
  } catch (err) {
    console.error('Failed to prepare compilation environment:', err);
    return false;
  }
}

/**
 * Clean up the compilation environment
 * @param {string} jobId - The unique job ID
 * @param {boolean} keepPdf - Whether to keep the PDF file
 * @returns {Promise<boolean>} - Whether the cleanup was successful
 */
async function cleanupCompilationEnvironment(jobId, keepPdf = true) {
  try {
    const jobDir = path.join(COMPILATION_DIR, jobId);
    
    if (!fs.existsSync(jobDir)) {
      return true; // Nothing to clean up
    }
    
    // If we need to keep the PDF, move it to a safe location first
    let pdfPath = null;
    if (keepPdf) {
      const files = fs.readdirSync(jobDir);
      const pdfFile = files.find(file => file.endsWith('.pdf'));
      
      if (pdfFile) {
        const originalPdfPath = path.join(jobDir, pdfFile);
        pdfPath = path.join(COMPILATION_DIR, `${jobId}.pdf`);
        fs.copyFileSync(originalPdfPath, pdfPath);
      }
    }
    
    // Remove the job directory
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