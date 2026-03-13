@echo off
REM Script to start the LaTeX compilation worker on Windows

REM Set environment variables if needed
set COMPILATION_DIR=.\compilation
set DOCKER_IMAGE=naya-overleaf-texlive

REM Start the worker
echo Starting LaTeX compilation worker...
node "%~dp0\start-worker.js"

REM Check if the worker started successfully
if %ERRORLEVEL% NEQ 0 (
  echo Failed to start worker. Please check the error messages above.
  exit /b 1
)