#!/usr/bin/env bash
# build.sh — builds the front end and syncs output to root for GitHub Pages.
# Run this after any change to web/src/, web/*/index.html, or brand-charts.js.
# Then commit and push.

set -e
cd "$(dirname "$0")"

echo "→ Building..."
cd web
VITE_BASE=/FindMySize/ npm run build
cd ..

echo "→ Syncing built output to root..."
python3 - << 'PYEOF'
import os, shutil

dist = 'web/dist'
root = '.'

# Directories to sync from dist to root (built output)
dirs = ['assets', 'auth', 'dashboard', 'size']

# Root-level built files to sync (NOT index.html — that is the scanner,
# which comes from web/dist/size/index.html, handled below)
built_root_files = [
    'apple-touch-icon.png', 'chat-config.js', 'chat.js',
    'embed-flag.js', 'favicon-32.png', 'favicon.ico',
    'favicon.svg', 'reveal.js', 'theme-init.js',
]

for f in built_root_files:
    src = os.path.join(dist, f)
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(root, f))

for d in dirs:
    src = os.path.join(dist, d)
    dst = os.path.join(root, d)
    if not os.path.isdir(src):
        continue
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)

# Scanner page: web/dist/size/index.html → root index.html AND size/index.html
scanner = os.path.join(dist, 'size', 'index.html')
if os.path.exists(scanner):
    shutil.copy2(scanner, 'index.html')
    shutil.copy2(scanner, os.path.join('size', 'index.html'))
    print('  scanner → index.html + size/index.html')

print('  sync complete')
PYEOF

echo "→ Done. Review changes with: git status"
echo "   Then: git add -A && git commit -m '...' && git push"
