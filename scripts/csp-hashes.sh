#!/usr/bin/env bash
set -euo pipefail
#
# Scans built HTML for inline <script> blocks (no src attribute),
# computes their SHA-256 hashes, and patches the CSP header in _headers.
#

DIR="${1:?Usage: csp-hashes.sh <dist-dir>}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for CSP hash generation" >&2
  exit 1
fi

HASHES=$(python3 -c "
import re, hashlib, base64, glob, os, sys

dist = sys.argv[1]
seen = set()
for f in sorted(glob.glob(os.path.join(dist, '**', '*.html'), recursive=True)):
    with open(f) as fh:
        content = fh.read()
    for m in re.finditer(r'<script([^>]*)>(.*?)</script>', content, re.DOTALL):
        attrs, body = m.group(1), m.group(2)
        if 'src=' in attrs or not body.strip():
            continue
        h = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
        seen.add(\"'sha256-\" + h + \"'\")
print(' '.join(sorted(seen)))
" "$DIR")

if [[ -z "$HASHES" ]]; then
  echo "No inline scripts found — skipping CSP hash injection." >&2
  exit 0
fi

HEADERS_FILE="$DIR/_headers"
if [[ ! -f "$HEADERS_FILE" ]]; then
  echo "Missing $HEADERS_FILE" >&2
  exit 1
fi

# Replace the placeholder (or existing hashes) between 'self' and https://giscus.app in script-src
# Pattern: script-src 'self' <...hashes...> https://giscus.app
python3 -c "
import re, sys

headers_path = sys.argv[1]
hashes = sys.argv[2]

with open(headers_path) as f:
    content = f.read()

# Match: script-src 'self' <anything> https://giscus.app
content = re.sub(
    r\"(script-src 'self') [^;]*(https://giscus\.app)\",
    r'\1 ' + hashes + r' \2',
    content
)

with open(headers_path, 'w') as f:
    f.write(content)
" "$HEADERS_FILE" "$HASHES"

echo "CSP hashes updated: $HASHES"
