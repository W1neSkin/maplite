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
- Pending phone edits are kept in the WebView store, not in a native SQLite file. They survive a force-stop. A browser edit is not queued.
- Live sharing on Android keeps running with the screen off through a foreground notification. It stops after force-stop. A recorded track is started on the phone itself and saved as a line layer. iOS background sharing is not built. Remote start and stop are not built.
- The ring around the location dot is the accuracy the device reported. It is drawn on the ellipsoid, then projected with the map. It is not a guaranteed error.
- Building a line or polygon again from the same points replaces that shape. It does not add a second copy.
- The public OpenStreetMap tile servers are used by the browser demo. The caching tile proxy is not built yet. Offline pictures are a zip of z/x/y.png plus tiles the map has already shown, capped at 4000.
- Request bodies are checked in code. A JSON Schema validator is not wired through every route yet.
- The Docker process runs as root so the data volume is writable.
- `better-sqlite3` is loaded from the prebuild shipped in the package. Its install script is not run, because compiling it needs a C++ toolchain that the current node-gyp can see.
