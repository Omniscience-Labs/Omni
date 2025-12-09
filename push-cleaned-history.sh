#!/bin/bash
# Script to push cleaned Git history after removing large blobs
# Run this when your network connection is stable

set -e

echo "=== Pushing cleaned Git history ==="
echo "Repository has been cleaned - all blobs >5MB removed from history"
echo ""

# Reset git config to defaults
git config --unset http.postBuffer 2>/dev/null || true
git config --unset http.version 2>/dev/null || true

# Force push all branches
echo "Force pushing all branches..."
git push origin --force --all

# Force push all tags
echo "Force pushing all tags..."
git push origin --force --tags 2>/dev/null || echo "No tags to push"

echo ""
echo "✅ Successfully pushed cleaned history!"
