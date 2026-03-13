/**
 * Script to build the Docker image for LaTeX compilation
 * Cross-platform compatible (Windows, macOS, Linux)
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get the Docker directory path
const dockerDir = path.join(__dirname, '../docker/texlive');

// Check if the Docker directory exists
if (!fs.existsSync(dockerDir)) {
  console.error(`Docker directory not found: ${dockerDir}`);
  process.exit(1);
}

// Build the Docker image
console.log('Building Naya Overleaf TeX Live Docker image...');

try {
  // Change to the Docker directory
  process.chdir(dockerDir);
  
  // Build the Docker image
  execSync('docker build -t naya-overleaf-texlive .', { stdio: 'inherit' });
  
  console.log('Docker image built successfully!');
  console.log('You can now run the LaTeX compilation worker.');
} catch (error) {
  console.error('Failed to build Docker image:', error.message);
  process.exit(1);
}