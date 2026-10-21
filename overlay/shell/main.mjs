import { app, BrowserWindow, session, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.resolve(here, "..");

function isOfficialPage(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    return (
      url.hostname === "openfront.io" || url.hostname.endsWith(".openfront.io")
    );
  } catch {
    return false;
  }
}

function harden(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isOfficialPage(url)) return { action: "allow" };
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame || isOfficialPage(url)) return;
    event.preventDefault();
  });
  contents.on("will-redirect", (event, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame || isOfficialPage(url)) return;
    event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  contents.on("did-finish-load", () => {
    void injectIfMissing(contents);
  });
}

async function injectIfMissing(contents) {
  const present = await contents.executeJavaScript(
    "Boolean(document.getElementById('ofjo-overlay'))",
  );
  if (present) return;
  const css = fs.readFileSync(
    path.join(extensionDir, "src", "content.css"),
    "utf8",
  );
  const code = fs.readFileSync(
    path.join(extensionDir, "dist", "inject.js"),
    "utf8",
  );
  await contents.insertCSS(css);
  await contents.executeJavaScript(code);
}

app.whenReady().then(async () => {
  await session.defaultSession.loadExtension(extensionDir);

  session.defaultSession.setPermissionRequestHandler(
    (_contents, permission, callback, details) => {
      const allowed =
        (permission === "clipboard-sanitized-write" ||
          permission === "notifications") &&
        isOfficialPage(details.requestingUrl);
      callback(allowed);
    },
  );

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(here, "preload.mjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });

  harden(window.webContents);
  await window.loadURL("https://openfront.io/");
});

app.on("window-all-closed", () => {
  app.quit();
});
