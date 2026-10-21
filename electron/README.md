# OpenFrontJO desktop wrapper

Electron shell around the OpenFrontJO client. It loads the fork. It does not run the simulation, send game intents, or impersonate the official Steam client.

The preload exposes `window.openfrontJo.version` only. It does **not** set `window.openfrontDesktop`. That global belongs to the Steam shell and changes update and payment behaviour.

## Version check

The page is always bootstrapped with `gitCommit: "DEV"`. Official public games reject that commit (`version_mismatch` in the game worker). This wrapper does not substitute `"desktop"` or the server's commit.

What still works:

- The official API (`https://api.openfront.io`) for the public game list, when the client was started with `API_DOMAIN=api.openfront.io`.
- Local and single-player games, where the dev server also uses `GIT_COMMIT=DEV`.

AGPL-3.0 applies to the modified client. This package is for local use. Do not ship a binary that presents itself as the Steam build. Do not touch a Steam install.

## Dev

Terminal 1, repo root:

```bash
npm run dev:prod
```

That serves the client at `http://localhost:9000` and points API calls at `api.openfront.io`.

Terminal 2:

```bash
cd electron
npm install
npm run dev
```

The window only navigates within `http://localhost:9000`. Other `http(s)` links open in the system browser. `file:`, `javascript:`, and new Electron windows are refused.

`contextIsolation`, `sandbox`, and `webSecurity` are on. `nodeIntegration` is off.

## Prod

From the repo root, bake the official API host into the bundle, then package:

```bash
cross-env API_DOMAIN=api.openfront.io npm run build-prod
cd electron
npm install
npm run dist
```

`npm run build-prod` writes an EJS `static/index.html`, not a finished page. The wrapper serves `static/` on `http://127.0.0.1` and fills the same locals as dev: `gitCommit` `"DEV"`, `jwtAudience` `"localhost"`, `gameEnv` `"dev"`, empty CDN base. Assets stay on that loopback origin.

Without `API_DOMAIN` at build time, a localhost audience falls back to `http://localhost:8787`.

Unpackaged prod (after the fork build):

```bash
cd electron
npm start
```

The portable Windows binary is `electron/release/OpenFrontJO 0.1.0.exe`. Packaging needs `static/` to exist (`extraResources`).

If `electron-builder` fails with `EPERM` while renaming `release/win-unpacked.tmp`, delete `electron/release` and run the build again with the output outside the repo:

```bash
npx electron-builder --win portable --config.directories.output=C:/Users/joevi/AppData/Local/Temp/ofjo-pack
```

The production response sets a Content-Security-Policy. `script-src` includes `'unsafe-inline'` because `index.html` bootstraps from inline scripts. `'unsafe-eval'` is not allowed.

## Layout

`electron/` is its own npm package. It is not an npm workspace and it does not import `packages/engine`, `packages/shared`, or `src/server`. electron-vite is not used: the renderer is the existing fork, loaded by URL, not a second Vite app.
