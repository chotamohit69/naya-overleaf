#!/bin/bash
# Script to build the Docker image for LaTeX compilation

# Navigate to the Docker directory
cd "$(dirname "$0")/../docker/texlive"

# Build the Docker image
echo "Building Naya Overleaf TeX Live Docker image..."
docker build -t naya-overleaf-texlive .

# Check if the build was successful
if [ $? -eq 0 ]; then
  echo "Docker image built successfully!"
  echo "You can now run the LaTeX compilation worker."
else
  echo "Failed to build Docker image. Please check the error messages above."
  exit 1
fi