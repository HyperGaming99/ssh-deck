#!/bin/sh
# Lädt die vorgebauten Node.js-Bibliotheken für Android nach android/app/libnode.
# Quelle: Fork HyperGaming99/nodejs-mobile, Release v18.20.4-16kb (Branch release18-20-4+16kb-fix von nodejs-mobile, per GitHub Actions gebaut,
# arm64-v8a und x86_64, auf 16-KB-Seiten ausgerichtet – das verlangt Google Play). Die offiziellen v18.20.4-Bibliotheken sind nur 4-KB-ausgerichtet.
set -e
cd "$(dirname "$0")/../android/app"
rm -rf libnode && mkdir libnode
curl -fL -o libnode/node.zip "https://github.com/HyperGaming99/nodejs-mobile/releases/download/v18.20.4-16kb/nodejs-mobile-v18.20.4-16kb-android.zip"
(cd libnode && unzip -q node.zip && rm node.zip)
echo "libnode bereit: $(ls libnode/bin | tr '\n' ' ')"
