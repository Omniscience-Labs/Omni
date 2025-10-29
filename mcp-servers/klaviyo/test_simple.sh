#!/bin/bash
# Simple shell script to test Klaviyo MCP server

echo "🧪 Testing Klaviyo MCP Server"
echo "========================================"
echo

# Test 1: Health Check
echo "1️⃣  Testing Health Endpoint..."
HEALTH=$(curl -s http://localhost:3010/health)
if [ $? -eq 0 ]; then
    echo "✅ Health check passed: $HEALTH"
else
    echo "❌ Health check failed - is the server running?"
    echo "   Start it: cd mcp-servers/klaviyo && npm run start:http"
    exit 1
fi
echo

# Test 2: Tool Discovery
echo "2️⃣  Testing Tool Discovery..."
DISCOVERY=$(curl -s -X POST http://localhost:3010/message \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')

if [ $? -eq 0 ]; then
    TOOL_COUNT=$(echo $DISCOVERY | grep -o '"name"' | wc -l)
    echo "✅ Discovered tools: $TOOL_COUNT"
    echo
    echo "📋 Sample tools:"
    echo "$DISCOVERY" | python3 -m json.tool | grep '"name"' | head -5
else
    echo "❌ Discovery failed"
    exit 1
fi
echo

echo "========================================"
echo "✅ All tests passed!"
echo
echo "🚀 Next: Register with Omni backend"
echo "   python scripts/register_klaviyo_mcp.py"

