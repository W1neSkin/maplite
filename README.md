# Cartographic Workspace

A shared map for the browser and Android. One project holds the layers, the live positions, and the control points.

What is included:

- `@cartography/geo-core` converts coordinates between WGS 84 and the registered 6° Gauss–Krüger zones of SK-42, SK-95, and GSK-2011. It solves a 2D similarity from control points and measures geodesic length and area.
- `@cartography/project-schema` holds the project records, the sync operations, and the device state model.
- `@cartography/server` stores the project in SQLite and syncs edits by operation id, so a retry does not apply twice.
- `@cartography/client` draws the project on an OpenLayers map. Connecting asks for a server address and a token.
- The Android app joins a project by scanning a QR code, shares its position, and can record a track with the screen off.
- `cloudflare/` runs that same server on Cloudflare Workers, with the database in a Durable Object. The public hostname is configured at deploy time and is not stored in this repository.
- `@cartography/extension-example` adds a JSON importer and a marker through the public extension registry.

See [docs/limitations.md](docs/limitations.md) for what this build does not do.

## Run the demo

Node.js 22 or newer is required.

```bash
corepack pnpm install
corepack pnpm dev
```

Open http://127.0.0.1:3848 . The server listens on port 3847. The first local run writes `apps/server/data/dev-credentials.json`. That file is not created when `NODE_ENV=production`.

Copy `.env.example` to `.env` at the repository root when you need to change a setting.

## Checks

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
```
