#!/usr/bin/env bash
set -euo pipefail
VERSION="5.17.14"
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
(cd "$tmp" && npm pack "swagger-ui-dist@${VERSION}" --silent && tar -xzf swagger-ui-dist-*.tgz)
cp "$tmp/package/swagger-ui-bundle.js" web/static/vendor/swagger-ui-bundle.js
cp "$tmp/package/swagger-ui.css"       web/static/vendor/swagger-ui.css
cp "$tmp/package/LICENSE"              web/static/vendor/LICENSE-swagger-ui.txt
echo "Swagger UI ${VERSION} installed. Restart the server and open /docs."
