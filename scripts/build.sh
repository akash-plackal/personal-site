#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/dist}"
MINIFIER_BIN="${HTML_MINIFIER_BIN:-html-minifier-next}"
MINIFIER_PKG="${HTML_MINIFIER_PKG:-html-minifier-next}"
MINIFIER_MODE="${HTML_MINIFIER_MODE:-max}"

if [[ "$OUT_DIR" != /* ]]; then
  OUT_DIR="$ROOT_DIR/$OUT_DIR"
fi

if ! command -v "$MINIFIER_BIN" >/dev/null 2>&1; then
  if [[ "${CF_PAGES:-0}" == "1" ]] && command -v npm >/dev/null 2>&1; then
    echo "Missing $MINIFIER_BIN. Installing globally for Cloudflare build..."
    npm i -g "$MINIFIER_PKG"
  else
    echo "Missing global dependency: $MINIFIER_BIN" >&2
    echo "Install it globally: npm i -g $MINIFIER_PKG" >&2
    exit 1
  fi
fi

if ! command -v "$MINIFIER_BIN" >/dev/null 2>&1; then
  echo "Failed to resolve minifier binary after install: $MINIFIER_BIN" >&2
  exit 1
fi

echo "Building site into: $OUT_DIR"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cp "$ROOT_DIR/_headers" "$OUT_DIR/_headers"
cp -R "$ROOT_DIR/assets" "$OUT_DIR/assets"

HTML_FILES=("$ROOT_DIR/index.html")
while IFS= read -r -d '' file; do
  HTML_FILES+=("$file")
done < <(find "$ROOT_DIR/about" "$ROOT_DIR/articles" -type f -name "*.html" -print0)

for src in "${HTML_FILES[@]}"; do
  rel="${src#$ROOT_DIR/}"
  dest="$OUT_DIR/$rel"
  mkdir -p "$(dirname "$dest")"

  MINIFIER_FLAGS=(
    --collapse-whitespace
    --remove-comments
    --remove-redundant-attributes
    --remove-script-type-attributes
    --remove-style-link-type-attributes
    --use-short-doctype
    --minify-css true
    --minify-js true
  )

  if [[ "$MINIFIER_MODE" == "safe" ]]; then
    MINIFIER_FLAGS+=(--conservative-collapse)
  else
    MINIFIER_FLAGS+=(
      --collapse-boolean-attributes
      --remove-empty-attributes
      --remove-attribute-quotes
      --remove-optional-tags
      --collapse-inline-tag-whitespace
    )
  fi

  "$MINIFIER_BIN" \
    "${MINIFIER_FLAGS[@]}" \
    "$src" \
    -o "$dest"
done

echo "Build completed."
