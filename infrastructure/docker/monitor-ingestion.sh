#!/bin/bash

# Monitor RAG service ingestion progress

echo "=== RAG Service Ingestion Monitor ==="
echo ""

# Function to get stats
get_stats() {
    curl -s http://localhost:3002/stats | jq -r '
        "Documents: \(.ingestion.totalDocuments)",
        "Chunks: \(.ingestion.totalChunks)",
        "Refreshing: \(.refresh.isRefreshing)",
        "Last Refresh: \(.refresh.lastRefresh // "Never")"
    '
}

# Function to watch logs
watch_logs() {
    docker logs jarvis-rag-service --follow 2>&1 | grep --line-buffered -E "Complete:|Processed|Fetched|Failed"
}

if [ "$1" == "watch" ]; then
    echo "Watching logs for completion messages..."
    echo "(Look for '[KnowledgeRefresh] Complete:' to know when a cycle finishes)"
    echo ""
    watch_logs
else
    echo "Current Stats:"
    echo ""
    get_stats
    echo ""
    echo "Usage:"
    echo "  ./monitor-ingestion.sh         - Show current stats"
    echo "  ./monitor-ingestion.sh watch   - Watch logs in real-time"
    echo ""
    echo "Refresh Status:"
    curl -s http://localhost:3002/refresh/status | jq -r '
        "Refresh Running: \(.status.isRunning)",
        "Currently Refreshing: \(.status.isRefreshing)",
        "Refresh Interval: \(.status.intervalMinutes) minutes",
        "Completed Refreshes: \(.recentHistory | length)"
    '
fi
