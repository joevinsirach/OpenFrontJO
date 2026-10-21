import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { type AssetManifest } from "./asset-url";
import { renderIndexHtml } from "./render-shell";

// The app shell has inline bootstrap scripts (index.html). They cannot be
// nonced without editing that shared template, so script-src allows
// 'unsafe-inline'. 'unsafe-eval' stays off. Game hosts come from the API
// list, so connect-src names the openfront.io fleet rather than one host.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://sdk.crazygames.com https://challenges.cloudflare.com https://www.googletagmanager.com https://static.cloudflareinsights.com https://cdn.intergient.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.openfront.io",
  "font-src 'self' data:",
  "connect-src 'self' https://api.openfront.io https://api.openfront.dev https://*.openfront.io wss://*.openfront.io ws://127.0.0.1:* ws://localhost:* https://challenges.cloudflare.com https://www.google-analytics.com https://www.googletagmanager.com",
  "worker-src 'self' blob:",
  "frame-src https://challenges.cloudflare.com https://sdk.crazygames.com",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webm": "video/webm",
};

/** Map a URL path onto a file inside `root`, or null when it escapes. */
export function resolveInside(
  root: string,
  requestPath: string,
): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(requestPath.split("?")[0] ?? "");
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;
  const relative = pathname.replace(/^\/+/, "");
  const rootResolved = path.resolve(root);
  const candidate =
    relative === ""
      ? path.join(rootResolved, "index.html")
      : path.resolve(rootResolved, relative);
  const prefix = rootResolved.endsWith(path.sep)
    ? rootResolved
    : rootResolved + path.sep;
  if (candidate !== rootResolved && !candidate.startsWith(prefix)) return null;
  return candidate;
}

function readManifest(staticDir: string): AssetManifest {
  const manifestPath = path.join(staticDir, "asset-manifest.json");
  if (!fs.existsSync(manifestPath)) return {};
  const parsed: unknown = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const manifest: AssetManifest = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") manifest[key] = value;
  }
  return manifest;
}

function isInsideRoot(root: string, realFile: string): boolean {
  const realRoot = fs.realpathSync(root);
  const prefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  return realFile === realRoot || realFile.startsWith(prefix);
}

export function startStaticServer(
  staticDir: string,
): Promise<{ port: number; close: () => Promise<void> }> {
  const root = path.resolve(staticDir);
  let shellHtml: string | null = null;
  const appShell = (): string => {
    if (shellHtml !== null) return shellHtml;
    const template = fs.readFileSync(path.join(root, "index.html"), "utf8");
    shellHtml = renderIndexHtml(template, readManifest(root));
    return shellHtml;
  };

  const server = http.createServer((req, res) => {
    const urlPath = req.url ?? "/";
    const filePath = resolveInside(root, urlPath);
    if (filePath === null) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const pathname = (urlPath.split("?")[0] ?? "") || "/";
    const shell =
      (pathname === "/" || pathname === "/index.html") &&
      path.resolve(filePath) === path.resolve(root, "index.html");

    res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (shell) {
      const html = appShell();
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    let realFile: string;
    try {
      realFile = fs.realpathSync(filePath);
    } catch {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    if (!isInsideRoot(root, realFile)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const type =
      MIME[path.extname(realFile).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    fs.createReadStream(realFile).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    // Loopback only. Binding 0.0.0.0 would expose the local client.
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Static server did not bind a TCP port"));
        return;
      }
      resolve({
        port: address.port,
        close: () =>
          new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}
