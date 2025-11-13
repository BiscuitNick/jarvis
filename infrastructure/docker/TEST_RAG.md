# Testing the RAG Service

## Quick Status Check

```bash
# Check if service is running
docker ps | grep rag-service

# Check service health
curl http://localhost:3002/healthz | jq .

# Check ingestion statistics
curl http://localhost:3002/stats | jq .
```

## Available Endpoints

### 1. Root Info
```bash
curl http://localhost:3002/ | jq .
```

### 2. Search for Documents (Vector Search)
```bash
curl -X POST http://localhost:3002/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "how to use streaming",
    "limit": 5,
    "similarityThreshold": 0.7,
    "includeCitations": true
  }' | jq .
```

### 3. Hybrid Search (Vector + Keyword)
```bash
curl -X POST http://localhost:3002/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{
    "query": "OpenAI API authentication",
    "limit": 5
  }' | jq .
```

### 4. Retrieve with Citations (Main RAG endpoint)
```bash
curl -X POST http://localhost:3002/retrieve \
  -H "Content-Type: application/json" \
  -d '{
    "query": "how to handle errors in API calls",
    "response": "You should use try-catch blocks",
    "limit": 5,
    "includeGrounding": true
  }' | jq .
```

### 5. Manual GitHub Ingestion
```bash
curl -X POST http://localhost:3002/ingest/github \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "openai",
    "repo": "openai-python",
    "branch": "main",
    "paths": ["README.md", "docs/"]
  }' | jq .
```

### 6. Trigger Knowledge Refresh
```bash
curl -X POST http://localhost:3002/refresh | jq .
```

### 7. Check Refresh Status
```bash
curl http://localhost:3002/refresh/status | jq .
```

### 8. Validate Grounding
```bash
curl -X POST http://localhost:3002/validate \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is streaming?",
    "response": "Streaming allows you to receive data incrementally",
    "limit": 5
  }' | jq .
```

## Monitor Service Logs

```bash
# Follow logs in real-time
docker logs jarvis-rag-service --follow

# View last 50 lines
docker logs jarvis-rag-service --tail 50

# Check for errors
docker logs jarvis-rag-service 2>&1 | grep -i error
```

## Test Sequence (Wait for Service to be Healthy)

```bash
# 1. Wait for service to be healthy
until [ "$(docker inspect -f '{{.State.Health.Status}}' jarvis-rag-service 2>/dev/null)" == "healthy" ]; do
  echo "Waiting for service to be healthy..."
  sleep 2
done

# 2. Check stats
echo "=== Service Statistics ==="
curl -s http://localhost:3002/stats | jq .

# 3. Test simple search
echo -e "\n=== Testing Search ==="
curl -s -X POST http://localhost:3002/search \
  -H "Content-Type: application/json" \
  -d '{"query":"API","limit":3}' | jq '.results[] | {text: .text[:100], similarity: .similarity}'

# 4. Check refresh status
echo -e "\n=== Refresh Status ==="
curl -s http://localhost:3002/refresh/status | jq .
```

## Troubleshooting

### Service won't start
```bash
# Check logs for startup errors
docker logs jarvis-rag-service 2>&1 | tail -100

# Restart service
docker restart jarvis-rag-service
```

### No search results
```bash
# Check if documents are ingested
curl -s http://localhost:3002/stats | jq '.ingestion'

# Manually trigger ingestion
curl -X POST http://localhost:3002/ingest/github \
  -H "Content-Type: application/json" \
  -d '{"owner":"anthropics","repo":"anthropic-sdk-python","branch":"main"}'
```

### GitHub API errors (500)
- This is a temporary GitHub issue
- Service will retry automatically every 3 minutes
- Wait for GitHub's API to recover

## Expected Output

**Healthy Service:**
```json
{
  "search": {
    "totalEmbeddings": 44,
    "avgChunksPerDocument": 11,
    "embeddingDimension": 1536
  },
  "ingestion": {
    "totalDocuments": 4,
    "totalChunks": 44,
    "sourceTypes": {
      "github": 2
    }
  },
  "refresh": {
    "isRunning": true,
    "lastRefresh": "2025-01-12T...",
    "intervalMinutes": 3
  }
}
```

**Search Result:**
```json
{
  "query": "streaming",
  "results": [
    {
      "text": "...relevant text chunk...",
      "similarity": 0.85,
      "documentId": "...",
      "sourceUrl": "https://github.com/..."
    }
  ],
  "citations": [...]
}
```
