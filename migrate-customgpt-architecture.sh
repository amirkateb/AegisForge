#!/usr/bin/env bash
set -euo pipefail

echo "AegisForge already uses the native private-GPT architecture."
echo "No source-code migration is required; deploy the current build and import docs/openapi.yaml."
npm run check
