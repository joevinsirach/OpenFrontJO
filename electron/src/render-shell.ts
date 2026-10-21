import ejs from "ejs";
import { type AssetManifest, buildAssetUrl } from "./asset-url";

// Cloudflare's always-pass test key. The dev client uses the same fallback
// (vite.config.ts). A production Turnstile site key is not baked in here.
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

/**
 * Render the fork's index.html the way the dev server does.
 *
 * gitCommit stays "DEV". The official game worker rejects that commit; this
 * renderer does not substitute "desktop" or a server commit.
 * jwtAudience stays "localhost" so getApiBase() uses the API_DOMAIN baked
 * into the production bundle (api.openfront.io).
 * No cluster / serverHost: the page asks the API which server to use.
 */
export function renderIndexHtml(
  template: string,
  manifest: AssetManifest,
): string {
  const href = (assetPath: string) => buildAssetUrl(assetPath, manifest);
  return ejs.render(template, {
    gitCommit: JSON.stringify("DEV"),
    assetManifest: JSON.stringify(manifest),
    cdnBase: JSON.stringify(""),
    cdnBaseRaw: "",
    gameEnv: JSON.stringify("dev"),
    turnstileSiteKey: JSON.stringify(TURNSTILE_TEST_SITE_KEY),
    jwtAudience: JSON.stringify("localhost"),
    manifestHref: href("manifest.json"),
    faviconHref: href("images/Favicon.svg"),
    gameplayScreenshotUrl: href("images/GameplayScreenshot.png"),
    backgroundImageUrl: href("images/background.webp"),
    desktopLogoImageUrl: href("images/OpenFront.png"),
    mobileLogoImageUrl: href("images/OF.png"),
  });
}
