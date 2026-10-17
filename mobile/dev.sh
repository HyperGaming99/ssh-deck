#!/bin/sh
# Baut die Android-Debug-App, installiert sie auf dem per USB verbundenen Gerät und zeigt das Log von Node/WebView.
set -e
cd "$(dirname "$0")/.."
export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64} ANDROID_HOME=${ANDROID_HOME:-$HOME/Android/Sdk}
ADB=$ANDROID_HOME/platform-tools/adb
node mobile/build-web.js >/dev/null
node mobile/pack-node.js >/dev/null
npx cap sync android >/dev/null
(cd android && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew -q assembleDebug)
$ADB install -r android/app/build/outputs/apk/debug/app-debug.apk
$ADB logcat -c
$ADB shell am start -n io.github.hypergaming99.sshdeck/.MainActivity >/dev/null
sleep "${1:-8}"
$ADB logcat -d -v threadtime | grep -E "nodejs|NODEJS|SSHDeck|chromium.*(CONSOLE|Uncaught)|Capacitor/Console|FATAL|AndroidRuntime|Fatal signal" | cut -c1-300 | tail -40
