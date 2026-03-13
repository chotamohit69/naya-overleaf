#!/bin/bash
# Script to start the LaTeX compilation worker on Unix-based systems

# Set environment variables if needed
export COMPILATION_DIR="./compilation"
export DOCKER_IMAGE="naya-overleaf-texlive"

# Start the worker
echo "Starting LaTeX compilation worker..."
node "$(dirname "$0")/start-worker.js"

# Check if the worker started successfully
if [ $? -ne 0 ]; then
  echo "Failed to start worker. Please check the error messages above."
  exit 1
fi