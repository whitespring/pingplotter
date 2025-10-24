@echo off
REM PingPlotter Docker Build and Push Script for Windows
REM This script builds the Docker image and pushes it to Docker Hub

setlocal enabledelayedexpansion

REM Configuration
set IMAGE_NAME=netsaver/pingplotter
set VERSION=%1
if "%VERSION%"=="" set VERSION=latest

echo ================================================
echo   PingPlotter Docker Build ^& Push
echo ================================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker first.
    exit /b 1
)

REM Navigate to project root (parent of docker directory)
cd /d "%~dp0..\.."
set PROJECT_ROOT=%CD%

echo [INFO] Project root: %PROJECT_ROOT%
echo.

REM Check if logged into Docker Hub
echo [INFO] Checking Docker Hub authentication...
docker info 2>&1 | findstr /C:"Username" >nul
if errorlevel 1 (
    echo [WARNING] Not logged into Docker Hub. Please run: docker login
    echo.
    pause
)

REM Check if buildx is available
docker buildx version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker buildx is not available. Please update Docker.
    exit /b 1
)

REM Create and use buildx builder if needed
echo [INFO] Setting up buildx builder...
docker buildx create --name pingplotter-builder --use 2>nul
if errorlevel 1 (
    docker buildx use pingplotter-builder
)

REM Build the image for multiple platforms
echo [INFO] Building Docker image for multiple architectures...
echo [INFO]    Platforms: linux/amd64, linux/arm64
echo [INFO]    Image: %IMAGE_NAME%:%VERSION%
echo.

docker buildx build ^
    --platform linux/amd64,linux/arm64 ^
    -t %IMAGE_NAME%:%VERSION% ^
    -t %IMAGE_NAME%:latest ^
    -f docker/Dockerfile ^
    --push ^
    .

if errorlevel 1 (
    echo.
    echo [ERROR] Build/Push failed!
    exit /b 1
)

echo.
echo ================================================
echo   Successfully pushed to Docker Hub!
echo ================================================
echo.
echo Image: %IMAGE_NAME%:%VERSION%
echo Image: %IMAGE_NAME%:latest
echo.
echo To use in Dockge:
echo   image: %IMAGE_NAME%:latest
echo.

endlocal
