#!/bin/bash
# Live trace watcher for jiratown debugging

echo "=== Jiratown Trace Watcher ==="
echo "Monitoring: /tmp/jiratown-trace.log"
echo "Press Ctrl+C to stop"
echo ""

# Clear old trace
echo "[$(date -Iseconds)] Trace watcher started" > /tmp/jiratown-trace.log

# Watch with tail -f (follow mode)
tail -f /tmp/jiratown-trace.log 2>/dev/null || {
    echo "Trace file doesn't exist yet. Waiting for jiratown to create it..."
    while [ ! -f /tmp/jiratown-trace.log ]; do
        sleep 0.5
    done
    echo "Trace file found! Starting live view..."
    echo ""
    tail -f /tmp/jiratown-trace.log
}
