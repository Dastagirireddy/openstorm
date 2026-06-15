#!/bin/bash
set -e

# Get version from argument or prompt
if [ -n "$1" ]; then
  VERSION="$1"
else
  read -p "Enter version (major.minor.patch): " VERSION
fi

# Validate semver
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be in format major.minor.patch (e.g., 1.2.3)"
  exit 1
fi

echo "Releasing version $VERSION..."

# Update versions using perl (more reliable than sed on macOS/Linux)
perl -i -pe "s/^version = \".*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
perl -i -pe "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
perl -i -pe "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" src-tauri/tauri.conf.json

# Verify the versions were updated correctly
echo "Verifying versions..."
grep "^version = " src-tauri/Cargo.toml
grep '"version":' package.json
grep '"version":' src-tauri/tauri.conf.json

# Commit and tag
git add src-tauri/Cargo.toml package.json src-tauri/tauri.conf.json
git commit -m "release: v$VERSION"
git tag "v$VERSION"
git push origin main --tags

echo "Released v$VERSION successfully!"
