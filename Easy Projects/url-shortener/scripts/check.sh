#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -z "$(gofmt -l .)" || { echo "gofmt needed on:"; gofmt -l .; exit 1; }
go vet ./...
node scripts/check-frontend.mjs
go test ./... -count=1
go build -trimpath -o bin/url-shortener ./cmd/server
echo "All checks passed."
