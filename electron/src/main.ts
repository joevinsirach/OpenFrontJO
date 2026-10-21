import { app, BrowserWindow, session, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { startStaticServer } from "./static-server";

const DEV_ORIGIN = "http://localhost:9000";

let mainWindow: BrowserWindow | null = null;
let appOrigin = DEV_ORIGIN;
let closeStaticServer: (() => Promise<void>) | null = null;

function isDevMode(): boolean {
  return !app.isPackaged && process.argv.includes("--dev");
}

function staticDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "static");
  }
  return path.resolve(__dirname, "../../static");
}

function isAllowedNavigation(target: string): boolean {
  try {
    return new URL(target).origin === appOrigin;
  } catch {
    return false;
  }
}

function safeOpenExternal(target: string): void {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
  if (
    parsed.protocol === "http:" &&
    parsed.hostname !== "127.0.0.1" &&
    parsed.hostname !== "localhost"
  ) {
    return;
  }
  void shell.openExternal(target);
}

function installSessionGuards(): void {
  const allowed = new Set([
    "clipboard-read",
    "clipboard-sanitized-write",
    "notifications",
  ]);

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      let origin = "";
      try {
        origin = new URL(webContents.getURL()).origin;
      } catch {
        callback(false);
        return;
      }
      callback(origin === appOrigin && allowed.has(permission));
    },
  );

  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) => {
      return requestingOrigin === appOrigin && allowed.has(permission);
    },
  );

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event, url) => {
      if (!isAllowedNavigation(url)) event.preventDefault();
    });
    contents.on("will-redirect", (event, url) => {
      if (!isAllowedNavigation(url)) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      safeOpenExternal(url);
      return { action: "deny" };
    });
    contents.on("will-attach-webview", (event) => {
      event.preventDefault();
    });
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function showMessage(win: BrowserWindow, title: string, body: string): void {
  const html = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<body style="font-family:sans-serif;background:#111;color:#eee;padding:24px">
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body>`;
  void win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
}

async function createWindow(): Promise<void> {
  const dev = isDevMode();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: "OpenFrontJO",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });
  mainWindow = win;
  win.once("ready-to-show", () => win.show());

  win.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, _url, isMainFrame) => {
      if (!isMainFrame || !dev) return;
      showMessage(
        win,
        "Client indisponible",
        `Lance npm run dev:prod dans le fork, puis relance cette fenêtre. ${errorDescription} (${errorCode})`,
      );
    },
  );

  if (dev) {
    appOrigin = DEV_ORIGIN;
    await win.loadURL(DEV_ORIGIN);
    return;
  }

  const dir = staticDir();
  if (!fs.existsSync(path.join(dir, "index.html"))) {
    showMessage(
      win,
      "Build manquant",
      "Depuis la racine du fork : cross-env API_DOMAIN=api.openfront.io npm run build-prod, puis relance le wrapper.",
    );
    return;
  }

  const started = await startStaticServer(dir);
  closeStaticServer = started.close;
  appOrigin = `http://127.0.0.1:${started.port}`;
  await win.loadURL(`${appOrigin}/`);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow === null) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app
    .whenReady()
    .then(() => {
      installSessionGuards();
      return createWindow();
    })
    .catch((err: unknown) => {
      console.error(err);
      app.quit();
    });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("before-quit", () => {
    void closeStaticServer?.();
  });
}
