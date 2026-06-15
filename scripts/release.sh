#!/bin/bash
set -e

# Single source of truth: src-tauri/tauri.conf.json
CONF="src-tauri/tauri.conf.json"
CARGO="src-tauri/Cargo.toml"
PKG="package.json"

# Get version from argument or prompt
if [ -n "$1" ]; then
  VERSION="$1"
else
  # Read current version from tauri.conf.json as default
  CURRENT=$(grep -o '"version": "[^"]*"' "$CONF" | cut -d'"' -f4)
  read -p "Enter version (current: $CURRENT): " VERSION
  VERSION=${VERSION:-$CURRENT}
fi

# Validate semver
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be in format major.minor.patch (e.g., 1.2.3)"
  exit 1
fi

echo "Releasing version $VERSION..."

# Update all three files from single source
perl -i -pe "s/^version = \".*\"/version = \"$VERSION\"/" "$CARGO"
perl -i -pe "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$PKG"
perl -i -pe "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" "$CONF"

# Verify all versions match
echo ""
echo "Verifying versions:"
CARGO_VER=$(grep '^version = ' "$CARGO" | head -1 | sed 's/version = "\(.*\)"/\1/')
PKG_VER=$(grep '"version":' "$PKG" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')
CONF_VER=$(grep '"version":' "$CONF" | head -1 | sed 's/.*"version": "\(.*\)".*/\1/')

echo "  Cargo.toml:    $CARGO_VER"
echo "  package.json:  $PKG_VER"
echo "  tauri.conf:    $CONF_VER"

if [ "$CARGO_VER" != "$VERSION" ] || [ "$PKG_VER" != "$VERSION" ] || [ "$CONF_VER" != "$VERSION" ]; then
  echo ""
  echo "Error: Version mismatch! Expected $VERSION"
  exit 1
fi

echo ""
echo "All versions match: $VERSION"

# Commit and tag
git add "$CARGO" "$PKG" "$CONF"
git commit -m "release: v$VERSION"
git tag "v$VERSION"
git push origin main --tags

echo ""
echo "Released v$VERSION successfully!"
