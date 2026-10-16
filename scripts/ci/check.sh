#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm licenses
