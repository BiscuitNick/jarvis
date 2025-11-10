#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Pushing all Jarvis services to ECR...${NC}"

# AWS account and region
AWS_ACCOUNT_ID="971422717446"
AWS_REGION="us-east-1"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# Services to push
SERVICES=("ingress-service" "asr-gateway" "llm-router" "rag-service" "tts-service")

# Login to ECR
echo -e "${YELLOW}Logging in to ECR...${NC}"
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

# Push each service
for SERVICE in "${SERVICES[@]}"; do
  echo -e "\n${GREEN}Pushing ${SERVICE}...${NC}"

  # Push both latest and git hash tags
  docker push "${ECR_REGISTRY}/jarvis/${SERVICE}:latest"
  docker push "${ECR_REGISTRY}/jarvis/${SERVICE}:$(git rev-parse --short HEAD 2>/dev/null || echo 'dev')"

  echo -e "${GREEN}✓ Pushed ${SERVICE}${NC}"
done

echo -e "\n${GREEN}All services pushed successfully!${NC}"
echo -e "\n${BLUE}Image URIs:${NC}"
for SERVICE in "${SERVICES[@]}"; do
  echo "  ${ECR_REGISTRY}/jarvis/${SERVICE}:latest"
done
