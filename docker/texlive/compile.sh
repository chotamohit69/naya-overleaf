#!/bin/bash
# LaTeX Compilation Script for Naya Overleaf

# Input parameters
JOB_ID=$1
MAIN_FILE=$2
COMPILER=${3:-pdflatex}
WORK_DIR=${4:-/var/texlive/compilation/$JOB_ID}

if [ -z "$JOB_ID" ] || [ -z "$MAIN_FILE" ]; then
  echo "Usage: compile.sh <jobId> <mainFile> [compiler] [workDir]" >&2
  exit 2
fi

if ! mkdir -p "$WORK_DIR"; then
  echo "Unable to create work directory: $WORK_DIR" >&2
  exit 2
fi

cd "$WORK_DIR" || {
  echo "Unable to enter work directory: $WORK_DIR" >&2
  exit 2
}

echo "Starting compilation job $JOB_ID for $MAIN_FILE using $COMPILER"
echo "Job started at $(date)"

STDOUT_FILE="${MAIN_FILE%.*}.stdout"
STDERR_FILE="${MAIN_FILE%.*}.stderr"
: > "$STDOUT_FILE"
: > "$STDERR_FILE"

cleanup() {
  echo "Cleaning up auxiliary files"
  find . -type f \
    -not -name "*.pdf" \
    -not -name "*.log" \
    -not -name "*.stdout" \
    -not -name "*.stderr" \
    -delete
}

run_compiler() {
  case "$COMPILER" in
    "pdflatex")
      pdflatex -interaction=nonstopmode -file-line-error "$MAIN_FILE" >> "$STDOUT_FILE" 2>> "$STDERR_FILE"
      ;;
    "xelatex")
      xelatex -interaction=nonstopmode -file-line-error "$MAIN_FILE" >> "$STDOUT_FILE" 2>> "$STDERR_FILE"
      ;;
    "lualatex")
      lualatex -interaction=nonstopmode -file-line-error "$MAIN_FILE" >> "$STDOUT_FILE" 2>> "$STDERR_FILE"
      ;;
    "latexmk")
      latexmk -pdf -interaction=nonstopmode -file-line-error "$MAIN_FILE" >> "$STDOUT_FILE" 2>> "$STDERR_FILE"
      ;;
    *)
      echo "Unknown compiler: $COMPILER" >&2
      echo "Unknown compiler: $COMPILER" >> "$STDERR_FILE"
      return 2
      ;;
  esac
}

# A first run resolves most errors; a second run resolves references. Do not
# abort after the first non-zero exit because LaTeX often reports recoverable
# errors and still produces a usable PDF.
run_compiler
FIRST_STATUS=$?

if [ "$COMPILER" != "latexmk" ]; then
  run_compiler
  SECOND_STATUS=$?
else
  SECOND_STATUS=0
fi

PDF_FILE="${MAIN_FILE%.*}.pdf"

if [ -f "$PDF_FILE" ]; then
  echo "PDF generated successfully"
  cleanup
  exit 0
fi

echo "Compilation failed: $PDF_FILE was not generated" >&2
echo "First pass exit code: $FIRST_STATUS; second pass exit code: $SECOND_STATUS" >&2
exit 1
