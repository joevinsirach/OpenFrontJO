export const TOOLS = [
  "sidebar",
  "control",
  "player",
  "attacks",
  "events",
  "units",
  "build",
  "topbar",
] as const;

export type ToolId = (typeof TOOLS)[number];

export const TOOL_LABELS: Record<ToolId, string> = {
  sidebar: "Classement",
  control: "Contrôle",
  player: "Joueur",
  attacks: "Attaques",
  events: "Événements",
  units: "Unités",
  build: "Construction",
  topbar: "Barre",
};

/** Position and size the player chose. Null keeps the default CSS placement. */
export interface ToolLayout {
  visible: boolean;
  collapsed: boolean;
  x: number | null;
  y: number | null;
  scale: number;
  width: number | null;
}

export interface OverlayLayout {
  sidebar: ToolLayout;
  control: ToolLayout;
  player: ToolLayout;
  attacks: ToolLayout;
  events: ToolLayout;
  units: ToolLayout;
  build: ToolLayout;
  topbar: ToolLayout;
  settingsX: number | null;
  settingsY: number | null;
}

const STORAGE_KEY = "ofjo-layout";
const MIN_SCALE = 0.6;
const MAX_SCALE = 2;

export function defaultTool(): ToolLayout {
  return {
    visible: true,
    collapsed: false,
    x: null,
    y: null,
    scale: 1,
    width: null,
  };
}

export function defaultLayout(): OverlayLayout {
  return {
    sidebar: defaultTool(),
    control: defaultTool(),
    player: defaultTool(),
    attacks: defaultTool(),
    events: defaultTool(),
    units: defaultTool(),
    build: defaultTool(),
    topbar: defaultTool(),
    settingsX: null,
    settingsY: null,
  };
}

export function clampScale(value: number): number {
  const stepped = Math.round(value * 10) / 10;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, stepped));
}

export function loadLayout(): OverlayLayout {
  const layout = defaultLayout();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return layout;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return layout;
    const record = parsed as Record<string, unknown>;
    layout.sidebar = readTool(record.sidebar);
    layout.control = readTool(record.control);
    layout.player = readTool(record.player);
    layout.attacks = readTool(record.attacks);
    layout.events = readTool(record.events);
    layout.units = readTool(record.units);
    layout.build = readTool(record.build);
    layout.topbar = readTool(record.topbar);
    layout.settingsX = readCoord(record.settingsX);
    layout.settingsY = readCoord(record.settingsY);
  } catch {
    return defaultLayout();
  }
  return layout;
}

export function saveLayout(layout: OverlayLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Private mode can reject storage. The choice still applies this page.
  }
}

export function applyToolBox(panel: HTMLElement, tool: ToolLayout): void {
  panel.style.scale = String(tool.scale);
  panel.style.transformOrigin = "top left";
  if (tool.x === null || tool.y === null) {
    panel.style.left = "";
    panel.style.top = "";
    panel.style.bottom = "";
    panel.style.transform = "";
  } else {
    panel.style.left = `${tool.x}px`;
    panel.style.top = `${tool.y}px`;
    panel.style.bottom = "auto";
    panel.style.transform = "none";
  }
  panel.style.width = tool.width === null ? "" : `${tool.width}px`;
}

/** Drag and resize. Movement is reported in viewport pixels. */
export function trackPointer(
  handle: HTMLElement,
  onDelta: (dx: number, dy: number) => void,
  onUp: (moved: boolean) => void,
): void {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      onDelta(dx, dy);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      onUp(moved);
    };
    if (typeof handle.setPointerCapture === "function") {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // jsdom has no pointer capture.
      }
    }
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  });
}
function readTool(value: unknown): ToolLayout {
  const tool = defaultTool();
  if (typeof value !== "object" || value === null) return tool;
  const record = value as Record<string, unknown>;
  if (typeof record.visible === "boolean") tool.visible = record.visible;
  if (typeof record.collapsed === "boolean") tool.collapsed = record.collapsed;
  tool.x = readCoord(record.x);
  tool.y = readCoord(record.y);
  if (typeof record.scale === "number" && Number.isFinite(record.scale)) {
    tool.scale = clampScale(record.scale);
  }
  if (
    typeof record.width === "number" &&
    Number.isFinite(record.width) &&
    record.width >= 160
  ) {
    tool.width = record.width;
  }
  return tool;
}

function readCoord(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}
