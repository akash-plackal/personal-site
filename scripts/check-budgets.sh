#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_DIR="${1:-$ROOT_DIR/dist}"

MAX_HTML_GZ=14336
MAX_CRITICAL_CSS_GZ=5120
MAX_JS_GZ=10240

if [[ ! -d "$SITE_DIR" ]]; then
  echo "Site directory not found: $SITE_DIR" >&2
  exit 1
fi

to_bytes() {
  awk '{print $1}'
}

extract_inline() {
  local tag="$1"
  local file="$2"
  perl -0777 -ne "while (/<${tag}\\b[^>]*>(.*?)<\\/${tag}>/gis) { print \$1, \"\\n\"; }" "$file"
}

status=0
printf "%-55s %10s %10s %10s\n" "File" "HTML(gz)" "CSS(gz)" "JS(gz)"
printf "%-55s %10s %10s %10s\n" "----" "--------" "-------" "------"

while IFS= read -r -d '' file; do
  rel="${file#$SITE_DIR/}"

  html_gz="$(gzip -c "$file" | wc -c | to_bytes)"

  if grep -qi "<style" "$file"; then
    css_gz="$(extract_inline style "$file" | gzip -c | wc -c | to_bytes)"
  else
    css_gz=0
  fi

  if grep -qi "<script" "$file"; then
    js_gz="$(extract_inline script "$file" | gzip -c | wc -c | to_bytes)"
  else
    js_gz=0
  fi

  printf "%-55s %10s %10s %10s\n" "$rel" "$html_gz" "$css_gz" "$js_gz"

  if (( html_gz > MAX_HTML_GZ )); then
    echo "FAIL: $rel HTML exceeds 14KB gz (${html_gz}B)." >&2
    status=1
  fi
  if (( css_gz > MAX_CRITICAL_CSS_GZ )); then
    echo "FAIL: $rel inline CSS exceeds 5KB gz (${css_gz}B)." >&2
    status=1
  fi
  if (( js_gz > MAX_JS_GZ )); then
    echo "FAIL: $rel inline JS exceeds 10KB gz (${js_gz}B)." >&2
    status=1
  fi
done < <(find "$SITE_DIR" -type f -name "*.html" -print0 | sort -z)

if (( status != 0 )); then
  exit 1
fi

echo "All budget checks passed."
