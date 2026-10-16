#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
corepack pnpm --filter @cartography/client build
cd apps/mobile
if [ ! -d android ]; then
  corepack pnpm exec cap add android
fi
corepack pnpm exec cap sync android
cd android
if [ -n "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ] && [ ! -f local.properties ]; then
  sdk="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
  printf 'sdk.dir=%s\n' "$sdk" > local.properties
fi
chmod +x ./gradlew
./gradlew assembleDebug --no-daemon
echo "APK: apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk"
