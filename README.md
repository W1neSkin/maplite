# Cartographic Workspace

A shared map for a browser and, later, Android and iOS. Layers, live objects, coordinate systems, and control points belong to one project.

What works in this slice:

- `@cartography/geo-core` converts coordinates between WGS 84 and the registered 6° Gauss–Krüger zones of SK-42, SK-95, and GSK-2011. Datum shifts use the published EPSG operations (EPSG:5044, EPSG:5043, EPSG:9773), checked against PROJ 9.4. It also solves a 2D similarity from control points and measures geodesic length and area.
- `@cartography/project-schema` holds the project records, the sync operation shape, and the device state model.
- `@cartography/server` stores the project in SQLite, migrates a clean database, and syncs edits by operation id so a retry does not apply twice.
- `@cartography/client` draws the project on an OpenLayers map. Connecting asks for a server address and a token.
- `@cartography/extension-example` adds a JSON importer and a marker through the public extension registry.

Shapefile import, field collection, live positions, and the Android and iOS builds are not in this slice. See [docs/limitations.md](docs/limitations.md).

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
