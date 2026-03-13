@echo off
REM Script to build the Docker image for LaTeX compilation on Windows

REM Navigate to the Docker directory
cd "%~dp0\..\docker\texlive"

REM Build the Docker image
echo Building Naya Overleaf TeX Live Docker image...
docker build -t naya-overleaf-texlive .

REM Check if the build was successful
if %ERRORLEVEL% EQU 0 (
  echo Docker image built successfully!
  echo You can now run the LaTeX compilation worker.
) else (
  echo Failed to build Docker image. Please check the error messages above.
  exit /b 1
)