# Cartographic Workspace

A shared map for a browser and, later, Android and iOS. Layers, live objects, coordinate systems, and control points belong to one project.

This repository is the start of that project. What is already here:

- `@cartography/geo-core` converts coordinates between WGS 84 and the registered 6° Gauss–Krüger zones of SK-42, SK-95, and GSK-2011. Datum shifts use the published EPSG operations (EPSG:5044, EPSG:5043, EPSG:9773), checked against PROJ 9.4. It also solves a 2D similarity from control points and measures geodesic length and area.
- `@cartography/project-schema` holds the project records, the sync operation shape, and the device state model.

The server, the map interface, shapefile import, and the mobile shells are not in this commit yet.

## Run the tests

```bash
pnpm install
pnpm exec vitest run
```

Node.js 22 or newer is required.
