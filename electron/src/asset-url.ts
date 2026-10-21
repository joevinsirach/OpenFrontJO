// Same lookup the game uses in packages/shared/src/AssetPaths.ts. Kept local so
// this package does not import the simulation or the shared workspace.

export type AssetManifest = Record<string, string>;

function assertSafeSegment(segment: string): void {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    decoded = segment;
  }
  if (
    segment === "." ||
    segment === ".." ||
    decoded === "." ||
    decoded === ".."
  ) {
    throw new Error(`Invalid asset path segment: ${segment}`);
  }
}

export function normalizeAssetPath(assetPath: string): string {
  const parts = assetPath
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment.length > 0);
  for (const segment of parts) assertSafeSegment(segment);
  if (parts.length === 0) {
    throw new Error("Asset path must not be empty");
  }
  return parts.join("/");
}

/** Resolve a manifest entry. `cdnBase` is always empty: assets stay same-origin. */
export function buildAssetUrl(
  assetPath: string,
  manifest: AssetManifest,
): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(assetPath)) return assetPath;
  const normalized = normalizeAssetPath(assetPath);
  const direct = manifest[normalized];
  if (direct) return direct;
  return (
    "/" +
    normalized
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")
  );
}
