#!/bin/bash
set -e

# Build a single service
# Usage: ./build-service.sh <service-name>

if [ -z "$1" ]; then
  echo "Usage: ./build-service.sh <service-name>"
  echo "Available services: ingress-service, asr-gateway, llm-router, rag-service, tts-service"
  exit 1
fi

SERVICE=$1
AWS_ACCOUNT_ID="971422717446"
AWS_REGION="us-east-1"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICES_DIR="$(dirname "$SCRIPT_DIR")"

if [ ! -d "${SERVICES_DIR}/${SERVICE}" ]; then
  echo "Error: Service ${SERVICE} not found"
  exit 1
fi

cd "${SERVICES_DIR}/${SERVICE}"

echo "Building ${SERVICE}..."
docker build -t "jarvis/${SERVICE}:latest" .

# Tag for ECR
docker tag "jarvis/${SERVICE}:latest" "${ECR_REGISTRY}/jarvis/${SERVICE}:latest"
docker tag "jarvis/${SERVICE}:latest" "${ECR_REGISTRY}/jarvis/${SERVICE}:$(git rev-parse --short HEAD 2>/dev/null || echo 'dev')"

echo "✓ Built ${SERVICE}"
echo ""
echo "To push to ECR:"
echo "  aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}"
echo "  docker push ${ECR_REGISTRY}/jarvis/${SERVICE}:latest"
