#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Building all Jarvis services...${NC}"

# AWS account and region
AWS_ACCOUNT_ID="971422717446"
AWS_REGION="us-east-1"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Services to build
SERVICES=("ingress-service" "asr-gateway" "llm-router" "rag-service" "tts-service")

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICES_DIR="$(dirname "$SCRIPT_DIR")"

# Build each service
for SERVICE in "${SERVICES[@]}"; do
  echo -e "\n${GREEN}Building ${SERVICE}...${NC}"

  cd "${SERVICES_DIR}/${SERVICE}"

  # Build Docker image
  docker build -t "jarvis/${SERVICE}:latest" .

  # Tag for ECR
  docker tag "jarvis/${SERVICE}:latest" "${ECR_REGISTRY}/jarvis/${SERVICE}:latest"
  docker tag "jarvis/${SERVICE}:latest" "${ECR_REGISTRY}/jarvis/${SERVICE}:$(git rev-parse --short HEAD 2>/dev/null || echo 'dev')"

  echo -e "${GREEN}✓ Built ${SERVICE}${NC}"
done

echo -e "\n${GREEN}All services built successfully!${NC}"
echo -e "\n${BLUE}To push images to ECR, run:${NC}"
echo -e "  ./scripts/push-all.sh"
