import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAssetUrl } from "../../electron/src/asset-url";
import { renderIndexHtml } from "../../electron/src/render-shell";
import {
  CONTENT_SECURITY_POLICY,
  resolveInside,
} from "../../electron/src/static-server";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("electron shell", () => {
  it("renders the app shell as a DEV localhost client", () => {
    const template = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
    const html = renderIndexHtml(template, {
      "images/Favicon.svg": "/_assets/images/Favicon.hash.svg",
    });

    const boot = html.slice(
      html.indexOf("window.BOOTSTRAP_CONFIG"),
      html.indexOf("window.BOOTSTRAP_CONFIG") + 900,
    );
    expect(boot).toContain('gitCommit: "DEV"');
    expect(boot).toContain('jwtAudience: "localhost"');
    expect(boot).toContain('gameEnv: "dev"');
    expect(boot).toContain('cdnBase: ""');
    expect(boot).not.toContain("cluster:");
    expect(boot).not.toContain("serverHost:");
    expect(html).not.toContain("openfrontDesktop =");
    expect(html).toContain('href="/_assets/images/Favicon.hash.svg"');
  });

  it("keeps same-origin asset urls and rejects parent segments", () => {
    expect(buildAssetUrl("images/OF.png", {})).toBe("/images/OF.png");
    expect(() => buildAssetUrl("../package.json", {})).toThrow(
      /Invalid asset path segment/,
    );
  });

  it("does not let a request path escape the static root", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ofjo-static-"));
    expect(resolveInside(root, "/index.html")).toBe(
      path.join(root, "index.html"),
    );
    expect(resolveInside(root, "/")).toBe(path.join(root, "index.html"));
    expect(resolveInside(root, "/../package.json")).toBeNull();
    expect(resolveInside(root, "/%2e%2e/package.json")).toBeNull();
  });

  it("allows the inline app shell and the official API, and blocks eval", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("'unsafe-inline'");
    expect(CONTENT_SECURITY_POLICY).toContain("https://api.openfront.io");
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe-eval");
  });
});
