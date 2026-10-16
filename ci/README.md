# CI entry points

`scripts/ci/check.sh` is the check that every provider should run: typecheck, lint, unit tests, and the license scan.

`scripts/ci/android.sh` and `scripts/ci/ios.sh` are the native builds. They are not green until the Capacitor projects exist and, for iOS, a macOS runner with Xcode is available. A provider file should only call these scripts.
