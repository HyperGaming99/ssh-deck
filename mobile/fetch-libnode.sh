#!/bin/sh
# Lädt die vorgebauten Node.js-Bibliotheken für Android (nodejs-mobile v18.20.4) nach android/app/libnode.
set -e
cd "$(dirname "$0")/../android/app"
V=v18.20.4
rm -rf libnode && mkdir libnode
curl -fL -o libnode/node.zip "https://github.com/nodejs-mobile/nodejs-mobile/releases/download/$V/nodejs-mobile-$V-android.zip"
(cd libnode && unzip -q node.zip && rm node.zip && rm -rf bin/armeabi-v7a) # 32-Bit-ARM wird nicht gebaut
echo "libnode bereit: $(ls libnode/bin | tr '\n' ' ')"
