#!/bin/bash

# PingPlotter Docker Build and Push Script
# This script builds the Docker image and pushes it to Docker Hub

set -e

# Configuration
IMAGE_NAME="netsaver/pingplotter"
VERSION=${1:-latest}

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  PingPlotter Docker Build & Push              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Navigate to project root (parent of docker directory)
cd "$(dirname "$0")/../.."
PROJECT_ROOT=$(pwd)

echo -e "${BLUE}📂 Project root: ${PROJECT_ROOT}${NC}"
echo ""

# Check if logged into Docker Hub
echo -e "${BLUE}🔐 Checking Docker Hub authentication...${NC}"
if ! docker info 2>&1 | grep -q "Username"; then
    echo -e "${RED}⚠️  Not logged into Docker Hub. Please run: docker login${NC}"
    echo ""
    read -p "Press Enter to continue after logging in, or Ctrl+C to cancel..."
fi

# Check if buildx is available
if ! docker buildx version > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker buildx is not available. Please update Docker.${NC}"
    exit 1
fi

# Create and use buildx builder if needed
echo -e "${BLUE}🔧 Setting up buildx builder...${NC}"
docker buildx create --name pingplotter-builder --use 2>/dev/null || docker buildx use pingplotter-builder

# Build the image for multiple platforms
echo -e "${BLUE}🔨 Building Docker image for multiple architectures...${NC}"
echo -e "${BLUE}   Platforms: linux/amd64, linux/arm64${NC}"
echo -e "${BLUE}   Image: ${IMAGE_NAME}:${VERSION}${NC}"
echo ""

docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t ${IMAGE_NAME}:${VERSION} \
    -t ${IMAGE_NAME}:latest \
    -f docker/Dockerfile \
    --push \
    .

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  ✓ Successfully pushed to Docker Hub!         ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${GREEN}Image: ${IMAGE_NAME}:${VERSION}${NC}"
    echo -e "${GREEN}Image: ${IMAGE_NAME}:latest${NC}"
    echo ""
    echo -e "${BLUE}To use in Dockge:${NC}"
    echo -e "  image: ${IMAGE_NAME}:latest"
    echo ""
else
    echo -e "${RED}❌ Push failed!${NC}"
    exit 1
fi
