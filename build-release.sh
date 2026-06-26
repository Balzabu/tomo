#!/usr/bin/env bash
# Build signed release artifacts on Linux / WSL.
#
#   ./build-release.sh         → APK + AAB (default)
#   ./build-release.sh apk     → APK only  (sideload / F-Droid-style)
#   ./build-release.sh aab     → AAB only  (Google Play upload)
#
# Signing uses android/keystore.properties (gitignored). If it's absent the
# release is built unsigned (e.g. for an F-Droid build that F-Droid signs).
# JAVA_HOME / ANDROID_HOME default to this machine's setup; override via env.
set -euo pipefail

cd "$(dirname "$0")"

export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export NODE_ENV="${NODE_ENV:-production}"

target="${1:-all}"
tasks=()
case "$target" in
  apk) tasks=(:app:assembleRelease) ;;
  aab) tasks=(:app:bundleRelease) ;;
  all) tasks=(:app:assembleRelease :app:bundleRelease) ;;
  *) echo "Unknown target '$target' (use: apk | aab | all)"; exit 1 ;;
esac

echo "JAVA_HOME=$JAVA_HOME"
echo "ANDROID_HOME=$ANDROID_HOME"
echo "Building: ${tasks[*]}"

# Gradle reads the RN/Expo config via Node, so JS deps must be installed first.
if [ ! -d node_modules ]; then
  echo "Installing JS dependencies (node_modules missing)…"
  npm ci
fi

if [ -f android/keystore.properties ]; then
  echo "Signing: release key (android/keystore.properties)"
else
  echo "Signing: NONE (unsigned release - F-Droid mode)"
fi

shift || true
./android/gradlew -p android "${tasks[@]}" --no-daemon "$@"

echo
[ -f android/app/build/outputs/apk/release/app-release.apk ] && \
  echo "APK: $(pwd)/android/app/build/outputs/apk/release/app-release.apk"
[ -f android/app/build/outputs/bundle/release/app-release.aab ] && \
  echo "AAB: $(pwd)/android/app/build/outputs/bundle/release/app-release.aab"
