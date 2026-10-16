# Limitations

## Product limits

- Access is a project token, not a user account. Whoever holds an editor token can change the whole project.
- The database on a phone is not encrypted. An unlocked or rooted device can read it.
- The basemap is a picture. It is not the base for a measurement.
- A figure reported by the location service is not a guaranteed error.
- A command to a device is not complete until that device confirms it. The operating system can refuse a remote start after the app is force-closed.
- A physical iOS run is not treated as done without a Mac and a device.

## This slice

- The browser asks for a server address and a token. `Use the local demo` calls a localhost-only route that is off when `NODE_ENV=production`.
- The phone outbox is tested against a SQLite file. Android and iOS projects are not generated yet, so those CI scripts fail on purpose.
- The public OpenStreetMap tile servers are used by the browser demo. The caching tile proxy is not built yet.
- Request bodies are checked in code. A JSON Schema validator is not wired through every route yet.
- The Docker process runs as root so the data volume is writable.
- `better-sqlite3` is loaded from the prebuild shipped in the package. Its install script is not run, because compiling it needs a C++ toolchain that the current node-gyp can see.
