#!/bin/bash
# LaTeX Compilation Script for Naya Overleaf

# Set error handling
set -e

# Input parameters
JOB_ID=$1
MAIN_FILE=$2
COMPILER=${3:-pdflatex}

# Working directory
WORK_DIR="/var/texlive/compilation/$JOB_ID"

# Create working directory
mkdir -p "$WORK_DIR"
cd "$WORK_DIR"

echo "Starting compilation job $JOB_ID for $MAIN_FILE using $COMPILER"

# Function to clean up temporary files
cleanup() {
  echo "Cleaning up temporary files"
  find . -type f -not -name "*.pdf" -not -name "*.log" -not -name "*.stdout" -not -name "*.stderr" -delete
}

# Compile the document
compile() {
  echo "Compiling with $COMPILER"
  
  # Create stdout and stderr files
  STDOUT_FILE="${MAIN_FILE%.*}.stdout"
  STDERR_FILE="${MAIN_FILE%.*}.stderr"
  
  # Run the appropriate compiler
  case "$COMPILER" in
    "pdflatex")
      pdflatex -interaction=nonstopmode -file-line-error "$MAIN_FILE" > "$STDOUT_FILE" 2> "$STDERR_FILE"
      # Run twice for references
      pdflatex -interaction=nonstopmode -file-line-error "$MAIN_FILE" >> "$STDOUT_FILE" 2>> "$STDERR_FILE"
      ;;
    "xelatex")
      xelatex -interaction=nonstopmode -file-line-error "$MAIN_FILE" > "$STDOUT_FILE" 2> "$STDERR_FILE"
      # Run twice for references
      xelatex -interaction=nonstopmode -file-line-error "$MAIN_FILE" >> "$STDOUT_FILE" 2>> "$STDERR_FILE"
      ;;
    "lualatex")
      lualatex -interaction=nonstopmode -file-line-error "$MAIN_FILE" > "$STDOUT_FILE" 2> "$STDERR_FILE"
      # Run twice for references
      lualatex -interaction=nonstopmode -file-line-error "$MAIN_FILE" >> "$STDOUT_FILE" 2>> "$STDERR_FILE"
      ;;
    "latexmk")
      latexmk -pdf -interaction=nonstopmode -file-line-error "$MAIN_FILE" > "$STDOUT_FILE" 2> "$STDERR_FILE"
      ;;
    *)
      echo "Unknown compiler: $COMPILER" > "$STDERR_FILE"
      exit 1
      ;;
  esac
  
  # Check if compilation was successful
  if [ ! -f "${MAIN_FILE%.*}.pdf" ]; then
    echo "Compilation failed. See log for details."
    return 1
  fi
  
  echo "Compilation completed successfully"
  return 0
}

# Main execution
echo "Job started at $(date)"

# Attempt compilation
if compile; then
  # Success
  echo "PDF generated successfully"
  cleanup
  exit 0
else
  # Failure
  echo "Compilation failed"
  exit 1
fi