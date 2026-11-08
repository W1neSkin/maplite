# Cartographic Workspace

A shared map for a browser and an Android phone. Several people work in one project: layers, points, lines, polygons, control points, and live positions stay together and sync through one server.

The phone app is named **MapLite**.

## What you can do

- Draw and edit points, lines, and polygons. A line or polygon is built in the order of the point list, and rebuilding it replaces the previous shape.
- Import a Shapefile (`.zip`), GeoJSON, GPX, or KML. Export a layer as a Shapefile zip, GPX, or KML.
- Measure geodesic length and area. A self-intersecting polygon is reported instead of given a misleading area.
- Show coordinates in WGS 84 or in a registered 6° Gauss–Krüger zone of SK-42, SK-95, or GSK-2011. A local drawing can also be seated with a 2D similarity from control points.
- Mark the current position. The point stores the time and whether the reported accuracy was within 100 m. The ring on the map is that reported accuracy, drawn on the ellipsoid. It is not a guaranteed error.
- Share a phone's live position. The mark fades after 30 seconds and drops after 2 minutes. The phone's own GPS dot is not drawn a second time.
- Record a track on the phone, including while the screen is off, and save it as a line layer.
- Send a frozen copy of a layer to selected phones. Sending it again replaces that copy.
- Start or stop live sharing and track recording from the computer. The phone must allow remote control. A command stays pending until the phone confirms it. If the app was force-stopped, nothing runs until someone opens it.
- Keep edits that were made without a network. The phone stores them in SQLite. The browser stores them locally and sends them later with the same operation id.
- Save the tiles of the current map view, or load a `z/x/y.png` zip, so that view can be opened offline. The store stops at 4000 tiles.

The basemap is a picture under the data. Measurements do not use it as a control.

## Access

There are no user accounts. A project is opened with a token sent in the `Authorization` header, never in the URL.

On a production server the administrator creates a project with `ADMIN_TOKEN`, then opens it and shows an enrollment QR from **Settings → Add device**. The phone opens the camera on launch, reads that QR, joins, and remembers the project. The code works once and expires after 10 minutes.

A local demo is different. The first development run writes `data/dev-credentials.json`, and **Use the local demo** reads it. That route answers only from localhost and is off when `NODE_ENV=production`.

## Repository

| Path | Role |
| --- | --- |
| `packages/geo-core` | Coordinate operations, control-point similarity, geodesic measure |
| `packages/project-schema` | Record types and the sync operation shape |
| `packages/extension-api` | Public extension surface |
| `extensions/example` | Example importer and marker, using only public exports |
| `apps/server` | Hono API and SQLite database |
| `apps/client` | Vite, React, and OpenLayers map |
| `apps/mobile` | Capacitor shell and the Android location service |
| `cloudflare/` | The same server on Cloudflare Workers, database in one Durable Object |
| `docs/limitations.md` | What this build does not do |

Edits sync by operation id. Sending the same id again does not apply the change twice. Live positions are not rows in that journal. A recorded track is separate from live sharing.

## Run the demo

Node.js 22 or newer is required.

```bash
corepack pnpm install
corepack pnpm dev
```

Open http://127.0.0.1:3848 . The API listens on port 3847.

Copy `.env.example` to `.env` in the repository root when a setting has to change. Leave `ADMIN_TOKEN` empty for local development. The generated development token is written to `data/dev-credentials.json` and is not created in production.

Useful settings:

| Variable | Purpose |
| --- | --- |
| `PORT` | API port. A panel may set `SERVER_PORT` instead. |
| `DATABASE_PATH` | SQLite file. Default `./data/cartography.sqlite`. |
| `PUBLIC_BASE_URL` | Address placed in a phone QR code. |
| `ADMIN_TOKEN` | Required in production, at least 43 characters. |
| `SEED_DEMO` | Create the demo project on startup. Turn this off in production. |
| `ALLOW_DEV_CREDENTIALS_FILE` | Write the local development token file. Forced off in production. |
| `CORS_ORIGINS` | Browser and phone origins allowed to call the API. |

## Android

The debug app id is `app.cartography.workspace`. Build the web app, copy it into the Android project, then assemble:

```bash
corepack pnpm --filter @cartography/client build
corepack pnpm --filter @cartography/mobile exec cap copy android
```

From `apps/mobile/android`, with the Android SDK and a JDK installed:

```bash
gradlew assembleDebug
```

Install `app/build/outputs/apk/debug/app-debug.apk`. The phone enrolls from the QR. It does not need a typed server address.

iOS project files can be prepared with `corepack pnpm ios:prepare`. A signed build and background location on a physical iPhone are not part of this repository's checks.

## Cloudflare

`cloudflare/` runs the API and the map page on Workers. The database is the SQLite storage of one Durable Object, so live updates stay in the same instance as the data.

The public hostname and `ADMIN_TOKEN` are deployment settings. They are not committed. Set `PUBLIC_BASE_URL` to the HTTPS address browsers open, or phone QR codes will point at the wrong place.

```bash
corepack pnpm --filter @cartography/client build
npx wrangler secret put ADMIN_TOKEN --config cloudflare/wrangler.toml
npx wrangler secret put PUBLIC_BASE_URL --config cloudflare/wrangler.toml
npx wrangler deploy --config cloudflare/wrangler.toml
```

A fresh deployment has an empty database. Create the project again and enroll phones with a new QR.

## Checks

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
```

`corepack pnpm test:e2e` runs the Playwright browser tests. `corepack pnpm licenses` checks dependency licenses.

## Limits

Access is a project token, not an account. Whoever holds an editor token can change the whole project. The phone database is not encrypted. Remote commands have no push notification. The reported GPS accuracy is not a guaranteed error.

The full list is in [docs/limitations.md](docs/limitations.md).
