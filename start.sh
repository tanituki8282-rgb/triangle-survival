#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Triangle Survival - local server at http://localhost:8080/"
echo "Stop with Ctrl+C"
(sleep 1; command -v open >/dev/null && open "http://localhost:8080/" || command -v xdg-open >/dev/null && xdg-open "http://localhost:8080/" || true) &
python3 -m http.server 8080
