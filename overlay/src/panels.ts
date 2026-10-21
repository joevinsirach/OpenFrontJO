import { icon } from "./icons.js";
import type { IconName } from "./icons.js";
import {
  TOOL_LABELS,
  TOOLS,
  applyToolBox,
  clampScale,
  defaultTool,
  trackPointer,
} from "./layout.js";
import type { OverlayLayout, ToolId, ToolLayout } from "./layout.js";
import { SELECTORS } from "./selectors.js";
import type {
  ActionKind,
  OverlayAction,
  Snapshot,
  VisiblePlayer,
} from "./snapshot.js";
import { replacementFlags } from "./snapshot.js";

export interface OverlayHandlers {
  onRatio: (percent: number) => void;
  onAttack: () => void;
  onAlliance: () => void;
  onBreakAlliance: () => void;
  onPlayerButton: (index: number) => void;
  onAttackButton: (index: number) => void;
  onAlertButton: (index: number) => void;
  onUnit: (index: number) => void;
  onBuild: (index: number) => void;
  onSide: (index: number) => void;
  /** Persist a move or resize without rebuilding the panels. */
  onPlace: () => void;
  /** Persist a show, hide, or scale change and redraw. */
  onLayout: () => void;
}

const LEAVE_MS = 170;
const RATIO_PRESETS = [10, 25, 50, 75, 100] as const;
const ACTION_ICONS: Record<ActionKind, IconName> = {
  attack: "sword",
  alliance: "link",
  breakAlliance: "unlink",
};

/** Last text shown per panel, so a change can flash once instead of on every redraw. */
const memory = new WeakMap<HTMLElement, Map<string, string>>();

export function ensureOverlayHost(doc: Document): HTMLElement {
  const existing = doc.getElementById(SELECTORS.overlayId);
  if (existing instanceof HTMLElement) return existing;
  const host = doc.createElement("div");
  host.id = SELECTORS.overlayId;
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = "2147483646";
  doc.body.append(host);
  return host;
}

export function removeOverlayHost(doc: Document): void {
  doc.getElementById(SELECTORS.overlayId)?.remove();
}

/** Draws the snapshot. Official panels stay up when a section has no data. */
export function updateOverlay(
  host: HTMLElement,
  snapshot: Snapshot,
  handlers: OverlayHandlers,
  layout: OverlayLayout,
): void {
  const flags = replacementFlags(snapshot);
  const draw = (
    id: ToolId,
    show: boolean,
    fill: (panel: HTMLElement, body: HTMLElement) => void,
    compact = false,
  ) => {
    const className = `ofjo-${id}`;
    if (!show || !layout[id].visible) {
      dismiss(host, className);
      return;
    }
    const panel =
      livePanel(host, className) ??
      host.appendChild(createBox(id, handlers, layout, compact));
    applyToolBox(panel, layout[id]);
    panel.classList.toggle("ofjo-collapsed", layout[id].collapsed);
    const body = panel.querySelector(".ofjo-body");
    if (body instanceof HTMLElement) fill(panel, body);
  };

  draw("sidebar", flags.sidebar, (panel, body) => {
    fillSidebar(panel, body, snapshot);
  });
  draw("control", flags.control && snapshot.local !== null, (panel, body) => {
    fillControl(panel, body, snapshot, handlers);
  });
  draw("player", flags.player, (panel, body) => {
    fillPlayer(panel, body, snapshot, handlers);
  });
  draw("attacks", flags.attacks, (panel, body) => {
    fillAttacks(panel, body, snapshot, handlers);
  });
  draw("events", flags.events, (panel, body) => {
    fillEvents(panel, body, snapshot, handlers);
  });
  draw("units", flags.units, (panel, body) => {
    fillUnits(panel, body, snapshot, handlers);
  });
  draw("build", flags.build, (panel, body) => {
    fillBuild(panel, body, snapshot, handlers);
  });
  draw(
    "topbar",
    flags.topbar,
    (_panel, body) => {
      fillTopbar(body, snapshot, handlers);
    },
    true,
  );
  syncSettings(host, layout, handlers);
}

function livePanel(host: HTMLElement, className: string): HTMLElement | null {
  for (const child of host.children) {
    if (
      child instanceof HTMLElement &&
      child.classList.contains(className) &&
      !child.classList.contains("ofjo-leaving")
    ) {
      return child;
    }
  }
  return null;
}

/** Fades a panel out, then removes it. Without the Web Animations API it goes at once. */
function dismiss(host: HTMLElement, className: string): void {
  const panel = livePanel(host, className);
  if (panel === null) return;
  if (typeof panel.animate !== "function") {
    panel.remove();
    return;
  }
  panel.classList.add("ofjo-leaving");
  const animation = panel.animate(
    [
      { opacity: 1, filter: "blur(0px)" },
      { opacity: 0, filter: "blur(3px)", translate: "0 6px" },
    ],
    { duration: LEAVE_MS, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" },
  );
  const drop = () => {
    panel.remove();
  };
  animation.onfinish = drop;
  animation.oncancel = drop;
}

function fillSidebar(
  panel: HTMLElement,
  body: HTMLElement,
  snapshot: Snapshot,
): void {
  setMeta(panel, String(snapshot.players.length));
  body.replaceChildren();
  if (snapshot.team !== null) {
    const team = el("div", "ofjo-team");
    const local = snapshot.players.find((player) => player.local);
    const swatch = el("span", "ofjo-swatch");
    if (local !== undefined && local.color !== null) {
      swatch.style.setProperty("--swatch", local.color);
    }
    team.append(swatch, text("span", "ofjo-team-name", snapshot.team));
    body.append(team);
  }

  const headers =
    snapshot.titles.headers.length > 0
      ? snapshot.titles.headers
      : [
          snapshot.titles.rank ?? "",
          snapshot.titles.name ?? "",
          snapshot.titles.gold ?? "",
          snapshot.titles.troops ?? "",
        ];
  const roles = headers.map((title) => {
    if (title !== "" && title === snapshot.titles.rank) return "rank";
    if (title !== "" && title === snapshot.titles.name) return "name";
    if (title !== "" && title === snapshot.titles.gold) return "gold";
    if (title !== "" && title === snapshot.titles.troops) return "troops";
    return "num";
  });
  const board = el("div", "ofjo-board");
  board.style.setProperty(
    "--cols",
    roles
      .map((role) => {
        if (role === "rank") return "26px";
        if (role === "name") return "minmax(78px, 1fr)";
        return "minmax(42px, auto)";
      })
      .join(" "),
  );

  const head = el("div", "ofjo-row ofjo-head");
  headers.forEach((title, index) => {
    const cell = text("span", `ofjo-cell ofjo-${roles[index]}`, title);
    cell.title = title;
    head.append(cell);
  });
  board.append(head);

  const seen = memoryOf(panel);
  for (const player of snapshot.players) {
    board.append(boardRow(player, roles, seen));
  }
  body.append(board);
}

function boardRow(
  player: VisiblePlayer,
  roles: string[],
  seen: Map<string, string>,
): HTMLElement {
  const row = el("div", player.local ? "ofjo-row ofjo-local" : "ofjo-row");
  const values =
    player.cells.length > 0
      ? player.cells.map((cell) => cell.value)
      : [
          player.rank ?? "",
          player.name,
          player.gold ?? "",
          player.troops ?? "",
        ];
  values.forEach((value, index) => {
    const role = roles[index] ?? "num";
    const cell = el("span", `ofjo-cell ofjo-${role}`);
    if (role === "name") {
      const swatch = el("span", "ofjo-swatch");
      if (player.color !== null)
        swatch.style.setProperty("--swatch", player.color);
      cell.append(swatch, text("span", "ofjo-ellipsis", value));
      if (player.relation !== null) {
        cell.append(text("span", "ofjo-pill", player.relation));
      }
      cell.title = value;
    } else if (role === "rank") {
      cell.textContent = value;
      if (value === "1" || value === "2" || value === "3") {
        cell.dataset.podium = value;
      }
    } else {
      cell.textContent = value;
      flash(cell, seen, `${player.name}|${index}`, value);
    }
    row.append(cell);
  });
  return row;
}

function fillControl(
  panel: HTMLElement,
  body: HTMLElement,
  snapshot: Snapshot,
  handlers: OverlayHandlers,
): void {
  const local = snapshot.local;
  if (local === null) return;
  if (body.childElementCount === 0) buildControl(body, handlers);
  const seen = memoryOf(panel);

  const alerts = body.querySelector(".ofjo-alerts");
  if (alerts instanceof HTMLElement) {
    alerts.replaceChildren();
    for (const message of snapshot.messages) {
      const line = el("div", "ofjo-alert");
      line.append(icon("alert"), text("span", "", message));
      alerts.append(line);
    }
  }

  const troops = body.querySelector(".ofjo-troops");
  if (troops instanceof HTMLElement) {
    troops.replaceChildren(
      text("strong", "", local.troops ?? ""),
      text(
        "span",
        "ofjo-max",
        local.troops !== null && local.troopsMax !== null
          ? ` / ${local.troopsMax}`
          : (local.troopsMax ?? ""),
      ),
    );
    flash(troops, seen, "troops", local.troops ?? "");
  }
  const meter = body.querySelector<HTMLElement>(".ofjo-meter > i");
  const fill = ratioOf(local.troops, local.troopsMax);
  meter?.parentElement?.toggleAttribute("hidden", fill === null);
  if (meter !== null && fill !== null) {
    meter.style.width = `${Math.round(fill * 1000) / 10}%`;
    meter.parentElement?.classList.toggle("ofjo-full", fill >= 0.95);
  }

  setFlashing(body, ".ofjo-rate", seen, "rate", local.troopRate);
  setFlashing(body, ".ofjo-gold", seen, "gold", local.gold);
  const ratio = body.querySelector(".ofjo-ratio");
  if (ratio instanceof HTMLElement) {
    ratio.textContent = ratioLine(
      local.attackRatioPercent,
      local.attackRatioTroops,
    );
  }

  const percent = parsePercent(local.attackRatioPercent);
  const ratioRow = body.querySelector(".ofjo-ratio-row");
  if (ratioRow instanceof HTMLElement) ratioRow.hidden = percent === null;
  const range = body.querySelector("[data-ofjo-ratio]");
  if (range instanceof HTMLInputElement) {
    range.hidden = percent === null;
    if (percent !== null && body.ownerDocument.activeElement !== range) {
      range.value = String(percent);
      paintRange(range);
    }
  }
  for (const chip of body.querySelectorAll<HTMLElement>("[data-ofjo-preset]")) {
    chip.classList.toggle(
      "ofjo-on",
      percent !== null && chip.dataset.ofjoPreset === String(percent),
    );
  }

  const actions = body.querySelector(".ofjo-actions");
  if (actions instanceof HTMLElement) {
    fillActions(actions, snapshot.actions, handlers);
  }
}

function buildControl(body: HTMLElement, handlers: OverlayHandlers): void {
  const alerts = el("div", "ofjo-alerts");

  const stats = el("div", "ofjo-stats");
  const troopTile = el("div", "ofjo-tile ofjo-tile-wide");
  troopTile.append(
    tileLabel("shield", "ofjo-tone-troop"),
    el("div", "ofjo-value ofjo-troops"),
  );
  const meter = el("div", "ofjo-meter");
  meter.append(el("i", ""));
  troopTile.append(meter);

  const rateTile = el("div", "ofjo-tile");
  rateTile.append(
    tileLabel("bolt", "ofjo-tone-rate"),
    el("div", "ofjo-value ofjo-rate"),
  );
  const goldTile = el("div", "ofjo-tile");
  goldTile.append(
    tileLabel("coin", "ofjo-tone-gold"),
    el("div", "ofjo-value ofjo-gold"),
  );
  stats.append(troopTile, rateTile, goldTile);

  const ratioRow = el("div", "ofjo-ratio-row");
  const ratioHead = el("div", "ofjo-ratio-head");
  ratioHead.append(icon("sword"), el("span", "ofjo-ratio"));
  const presets = el("div", "ofjo-presets");
  for (const value of RATIO_PRESETS) {
    const chip = press(`${value}%`, () => {
      handlers.onRatio(value);
    });
    chip.dataset.ofjoPreset = String(value);
    presets.append(chip);
  }
  ratioHead.append(presets);
  const range = document.createElement("input");
  range.type = "range";
  range.min = "1";
  range.max = "100";
  range.className = "ofjo-range";
  range.dataset.ofjoRatio = "1";
  range.addEventListener("input", () => {
    paintRange(range);
    handlers.onRatio(Number(range.value));
  });
  ratioRow.append(ratioHead, range);

  const actions = el("div", "ofjo-actions");
  body.append(alerts, stats, ratioRow, actions);
}

function tileLabel(name: IconName, tone: string): HTMLElement {
  const label = el("span", `ofjo-tile-ico ${tone}`);
  label.append(icon(name));
  return label;
}

function paintRange(range: HTMLInputElement): void {
  const value = Number(range.value);
  const min = Number(range.min);
  const max = Number(range.max);
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  range.style.setProperty("--pct", `${pct}%`);
}

function fillActions(
  host: HTMLElement,
  actions: readonly OverlayAction[],
  handlers: OverlayHandlers,
): void {
  const signature = actions
    .map((action) => `${action.kind}:${action.label}`)
    .join("|");
  if (host.dataset.signature === signature) return;
  host.dataset.signature = signature;
  host.replaceChildren();
  for (const action of actions) {
    if (action.label === "") continue;
    const button = press(action.label, () => {
      if (action.kind === "attack") handlers.onAttack();
      else if (action.kind === "alliance") handlers.onAlliance();
      else handlers.onBreakAlliance();
    });
    button.dataset.ofjoAction = action.kind;
    button.classList.add("ofjo-act", `ofjo-act-${action.kind}`);
    button.prepend(icon(ACTION_ICONS[action.kind]));
    host.append(button);
  }
}

function fillPlayer(
  panel: HTMLElement,
  body: HTMLElement,
  snapshot: Snapshot,
  handlers: OverlayHandlers,
): void {
  const selected = snapshot.selected;
  if (selected === null) return;
  const seen = memoryOf(panel);
  body.replaceChildren();

  const identity = el("div", "ofjo-identity");
  const avatar = text(
    "span",
    "ofjo-avatar",
    selected.name.trim().charAt(0).toUpperCase(),
  );
  if (selected.color !== null)
    avatar.style.setProperty("--swatch", selected.color);
  const names = el("div", "ofjo-identity-text");
  names.append(text("div", "ofjo-name", selected.name));
  const tags = el("div", "ofjo-tags");
  if (selected.badge !== null) {
    tags.append(text("span", "ofjo-pill ofjo-pill-danger", selected.badge));
  }
  if (selected.relation !== null) {
    tags.append(text("span", "ofjo-pill", selected.relation));
  }
  if (tags.childElementCount > 0) names.append(tags);
  identity.append(avatar, names);
  body.append(identity);

  const stats = el("div", "ofjo-stats ofjo-stats-2");
  for (const [name, tone, value, key] of [
    ["coin", "ofjo-tone-gold", selected.gold, "gold"],
    ["shield", "ofjo-tone-troop", selected.troops, "troops"],
  ] as const) {
    if (value === null) continue;
    const tile = el("div", "ofjo-tile");
    const figure = text("div", `ofjo-value ofjo-${key}`, value);
    flash(figure, seen, `${selected.name}|${key}`, value);
    tile.append(tileLabel(name, tone), figure);
    stats.append(tile);
  }
  if (stats.childElementCount > 0) body.append(stats);

  const actions = el("div", "ofjo-grid-actions");
  for (const button of snapshot.playerButtons) {
    if (button.label === "") continue;
    actions.append(
      press(button.label, () => {
        handlers.onPlayerButton(button.index);
      }),
    );
  }
  if (actions.childElementCount > 0) body.append(actions);
}

function fillAttacks(
  panel: HTMLElement,
  body: HTMLElement,
  snapshot: Snapshot,
  handlers: OverlayHandlers,
): void {
  setMeta(panel, String(snapshot.attacks.length));
  const seen = memoryOf(panel);
  const previous = new Set(seen.keys());
  seen.clear();
  body.replaceChildren();
  for (const line of snapshot.attacks) {
    const incoming = line.text.includes("↓");
    const row = el(
      "div",
      incoming ? "ofjo-attack ofjo-incoming" : "ofjo-attack ofjo-outgoing",
    );
    if (!previous.has(line.text) && previous.size > 0)
      row.classList.add("ofjo-fresh");
    seen.set(line.text, "1");
    const [first, ...rest] = line.actions;
    let shown = line.text.replace(/^[↓↑]\s*/u, "");
    for (const action of rest) {
      if (shown.endsWith(action.label)) {
        shown = shown.slice(0, -action.label.length).trimEnd();
      }
    }
    const main = press(shown === "" ? line.text : shown, () => {
      if (first !== undefined) handlers.onAttackButton(first.index);
    });
    main.classList.add("ofjo-attack-main");
    main.prepend(icon(incoming ? "arrowDown" : "arrowUp"));
    main.disabled = first === undefined;
    row.append(main);
    for (const action of rest) {
      const chip = press(action.label, () => {
        handlers.onAttackButton(action.index);
      });
      chip.classList.add("ofjo-chip");
      row.append(chip);
    }
    body.append(row);
  }
}

function fillEvents(
  panel: HTMLElement,
  body: HTMLElement,
  snapshot: Snapshot,
  handlers: OverlayHandlers,
): void {
  setMeta(panel, String(snapshot.events.length + snapshot.alerts.length));
  const seen = memoryOf(panel);
  const previous = new Set(seen.keys());
  seen.clear();
  body.replaceChildren();
  const isFresh = (key: string) => {
    seen.set(key, "1");
    return previous.size > 0 && !previous.has(key);
  };

  for (const card of snapshot.alerts) {
    const box = el("div", "ofjo-card");
    if (isFresh(`alert|${card.text}`)) box.classList.add("ofjo-fresh");
    box.append(text("div", "ofjo-card-text", card.text));
    const row = el("div", "ofjo-card-actions");
    card.actions.forEach((action, order) => {
      const button = press(action.label, () => {
        handlers.onAlertButton(action.index);
      });
      button.classList.add(order === 0 ? "ofjo-primary" : "ofjo-ghost");
      row.append(button);
    });
    if (row.childElementCount > 0) box.append(row);
    body.append(box);
  }

  const feed = el("div", "ofjo-feed");
  for (const line of snapshot.events) {
    const row = el(
      "div",
      line.important ? "ofjo-event ofjo-important" : "ofjo-event",
    );
    if (isFresh(`event|${line.text}`)) row.classList.add("ofjo-fresh");
    row.append(el("span", "ofjo-dot"), text("span", "", line.text));
    feed.append(row);
  }
  if (feed.childElementCount > 0) body.append(feed);
}

function fillUnits(
  panel: HTMLElement,
  body: HTMLElement,
  snapshot: Snapshot,
  handlers: OverlayHandlers,
): void {
  setMeta(panel, "");
  const seen = memoryOf(panel);
  body.replaceChildren();
  const bar = el("div", "ofjo-hotbar");
  for (const unit of snapshot.units) {
    const slot = press("", () => {
      handlers.onUnit(unit.index);
    });
    slot.classList.add("ofjo-slot");
    slot.classList.toggle("ofjo-on", unit.selected);
    slot.classList.toggle("ofjo-dim", unit.dimmed);
    slot.title =
      unit.hotkey === null ? unit.label : `${unit.label} [${unit.hotkey}]`;
    if (unit.hotkey !== null) slot.append(text("kbd", "ofjo-key", unit.hotkey));
    slot.append(picture(unit.icon, unit.label));
    if (unit.count !== null) {
      const count = text("span", "ofjo-count", unit.count);
      flash(count, seen, unit.label, unit.count);
      slot.append(count);
    }
    bar.append(slot);
  }
  body.append(bar);
}

function fillBuild(
  panel: HTMLElement,
  body: HTMLElement,
  snapshot: Snapshot,
  handlers: OverlayHandlers,
): void {
  setMeta(panel, String(snapshot.build.length));
  body.replaceChildren();
  const grid = el("div", "ofjo-build-grid");
  for (const choice of snapshot.build) {
    const tile = press("", () => {
      handlers.onBuild(choice.index);
    });
    tile.classList.add("ofjo-build-tile");
    tile.disabled = choice.disabled;
    tile.title = choice.label;
    tile.append(picture(choice.icon, choice.label));
    tile.append(text("span", "ofjo-build-name", choice.label));
    if (choice.cost !== null) {
      const cost = el("span", "ofjo-build-cost");
      cost.append(icon("coin"), text("span", "", choice.cost));
      tile.append(cost);
    }
    if (choice.count !== null) {
      tile.append(text("span", "ofjo-count", choice.count));
    }
    grid.append(tile);
  }
  body.append(grid);
}

function fillTopbar(
  body: HTMLElement,
  snapshot: Snapshot,
  handlers: OverlayHandlers,
): void {
  body.replaceChildren();
  if (snapshot.timer !== null) {
    const time = el("span", "ofjo-clock");
    time.append(icon("clock"), text("span", "ofjo-timer", snapshot.timer));
    body.append(time);
  }
  if (snapshot.timer !== null && snapshot.side.length > 0) {
    body.append(el("span", "ofjo-sep"));
  }
  for (const button of snapshot.side) {
    if (button.label === "") continue;
    const node = press("", () => {
      handlers.onSide(button.index);
    });
    node.classList.add("ofjo-icon-btn");
    node.title = button.label;
    node.setAttribute("aria-label", button.label);
    node.append(picture(button.icon, button.label));
    body.append(node);
  }
}

/** Shows the official image, and its label when that image does not load. */
function picture(src: string | null, label: string): HTMLElement {
  const frame = el("span", "ofjo-pic");
  const fallback = text("span", "ofjo-pic-text", label);
  if (src === null) {
    frame.append(fallback);
    return frame;
  }
  const image = document.createElement("img");
  image.alt = "";
  image.draggable = false;
  image.addEventListener("error", () => {
    image.remove();
    frame.append(fallback);
  });
  image.src = src;
  frame.append(image);
  return frame;
}

function createBox(
  id: ToolId,
  handlers: OverlayHandlers,
  layout: OverlayLayout,
  compact: boolean,
): HTMLElement {
  const panel = el("section", `ofjo-panel ofjo-${id}`);
  if (id === "player") panel.classList.add("ofjo-player-card");
  if (compact) panel.classList.add("ofjo-compact");
  panel.dataset.ofjoPanel = id;
  panel.style.pointerEvents = "auto";
  panel.append(chrome(id, panel, handlers, layout, compact));
  const wrap = el("div", "ofjo-body-wrap");
  wrap.append(el("div", "ofjo-body"));
  panel.append(wrap);
  return panel;
}

function chrome(
  id: ToolId,
  panel: HTMLElement,
  handlers: OverlayHandlers,
  layout: OverlayLayout,
  compact: boolean,
): HTMLElement {
  const bar = el("header", "ofjo-chrome");
  const grip = el("span", "ofjo-drag");
  grip.title = "Déplacer";
  grip.append(icon("grip", "ofjo-ico ofjo-grip"));
  if (!compact) grip.append(text("span", "ofjo-title", TOOL_LABELS[id]));
  const tool = () => layout[id];
  let origin: { x: number; y: number } | null = null;
  trackPointer(
    grip,
    (dx, dy) => {
      if (Math.abs(dx) + Math.abs(dy) <= 3) return;
      if (origin === null) {
        origin = visualOrigin(panel, tool());
        panel.classList.add("ofjo-dragging");
      }
      tool().x = origin.x + dx;
      tool().y = origin.y + dy;
      applyToolBox(panel, tool());
    },
    (moved) => {
      origin = null;
      panel.classList.remove("ofjo-dragging");
      if (moved) handlers.onPlace();
    },
  );
  bar.append(grip);

  if (!compact) {
    bar.append(el("span", "ofjo-meta"));
    const collapse = press("", () => {
      tool().collapsed = !tool().collapsed;
      panel.classList.toggle("ofjo-collapsed", tool().collapsed);
      handlers.onPlace();
    });
    collapse.classList.add("ofjo-icon-btn", "ofjo-collapse");
    collapse.title = "Replier";
    collapse.setAttribute("aria-label", "Replier");
    collapse.append(icon("chevron"));
    bar.append(collapse);
  }

  const resize = el("span", "ofjo-resize");
  resize.title = "Largeur";
  let widthOrigin: number | null = null;
  trackPointer(
    resize,
    (dx) => {
      if (Math.abs(dx) <= 3) return;
      const current = tool();
      widthOrigin ??= current.width ?? panel.offsetWidth;
      current.width = Math.max(160, Math.round(widthOrigin + dx));
      applyToolBox(panel, current);
    },
    (moved) => {
      widthOrigin = null;
      if (moved) handlers.onPlace();
    },
  );
  bar.append(resize);
  return bar;
}

function setMeta(panel: HTMLElement, value: string): void {
  const meta = panel.querySelector(".ofjo-meta");
  if (meta instanceof HTMLElement) {
    meta.textContent = value === "0" ? "" : value;
  }
}

function visualOrigin(
  panel: HTMLElement,
  tool: ToolLayout,
): { x: number; y: number } {
  if (tool.x !== null && tool.y !== null) return { x: tool.x, y: tool.y };
  const host = panel.offsetParent;
  const hostRect =
    host instanceof HTMLElement ? host.getBoundingClientRect() : null;
  const rect = panel.getBoundingClientRect();
  return {
    x: rect.left - (hostRect?.left ?? 0),
    y: rect.top - (hostRect?.top ?? 0),
  };
}

function syncSettings(
  host: HTMLElement,
  layout: OverlayLayout,
  handlers: OverlayHandlers,
): void {
  const panel =
    livePanel(host, "ofjo-settings") ??
    host.appendChild(createSettings(layout, handlers));
  if (layout.settingsX !== null && layout.settingsY !== null) {
    panel.style.left = `${layout.settingsX}px`;
    panel.style.top = `${layout.settingsY}px`;
    panel.style.right = "auto";
  }
  let shown = 0;
  for (const id of TOOLS) {
    const row = panel.querySelector(`[data-ofjo-tool="${id}"]`);
    if (!(row instanceof HTMLElement)) continue;
    row.classList.toggle("ofjo-off", !layout[id].visible);
    if (layout[id].visible) shown += 1;
    const visible = row.querySelector('[data-ofjo-act="visible"]');
    if (visible instanceof HTMLButtonElement) {
      visible.setAttribute("aria-checked", String(layout[id].visible));
      visible.title = layout[id].visible ? "Masquer" : "Afficher";
    }
    const scale = row.querySelector("[data-ofjo-scale]");
    if (scale !== null) {
      scale.textContent = `${Math.round(layout[id].scale * 100)}%`;
    }
  }
  const count = panel.querySelector(".ofjo-meta");
  if (count !== null) count.textContent = `${shown}/${TOOLS.length}`;
}

function createSettings(
  layout: OverlayLayout,
  handlers: OverlayHandlers,
): HTMLElement {
  const panel = el("div", "ofjo-panel ofjo-settings");
  const bar = el("header", "ofjo-chrome");
  const grip = el("span", "ofjo-drag ofjo-launcher");
  grip.title = "Réglages";
  grip.append(
    icon("gear", "ofjo-ico ofjo-gear"),
    text("span", "ofjo-title", "Réglages"),
    el("span", "ofjo-meta"),
    icon("chevron", "ofjo-ico ofjo-caret"),
  );
  let originX: number | null = null;
  let originY: number | null = null;
  trackPointer(
    grip,
    (dx, dy) => {
      if (Math.abs(dx) + Math.abs(dy) <= 3) return;
      if (originX === null || originY === null) {
        const host = panel.offsetParent;
        const hostRect =
          host instanceof HTMLElement ? host.getBoundingClientRect() : null;
        const rect = panel.getBoundingClientRect();
        originX = layout.settingsX ?? rect.left - (hostRect?.left ?? 0);
        originY = layout.settingsY ?? rect.top - (hostRect?.top ?? 0);
        panel.classList.add("ofjo-dragging");
      }
      layout.settingsX = originX + dx;
      layout.settingsY = originY + dy;
      panel.style.left = `${layout.settingsX}px`;
      panel.style.top = `${layout.settingsY}px`;
      panel.style.right = "auto";
    },
    (moved) => {
      originX = null;
      originY = null;
      panel.classList.remove("ofjo-dragging");
      if (moved) handlers.onPlace();
      else panel.classList.toggle("ofjo-open");
    },
  );
  bar.append(grip);

  const wrap = el("div", "ofjo-body-wrap");
  const body = el("div", "ofjo-settings-body");
  for (const id of TOOLS) body.append(toolRow(id, layout, handlers));
  const footer = el("div", "ofjo-settings-foot");
  const showAll = press("Tout afficher", () => {
    for (const id of TOOLS) layout[id].visible = true;
    handlers.onLayout();
  });
  showAll.classList.add("ofjo-ghost");
  const resetAll = press("Tout replacer", () => {
    for (const id of TOOLS) layout[id] = defaultTool();
    layout.settingsX = null;
    layout.settingsY = null;
    panel.style.left = "";
    panel.style.top = "";
    panel.style.right = "";
    handlers.onLayout();
  });
  resetAll.classList.add("ofjo-ghost");
  footer.append(showAll, resetAll);
  body.append(footer);
  wrap.append(body);
  panel.append(bar, wrap);
  return panel;
}

function toolRow(
  id: ToolId,
  layout: OverlayLayout,
  handlers: OverlayHandlers,
): HTMLElement {
  const row = el("div", "ofjo-tool");
  row.dataset.ofjoTool = id;

  const visible = press("", () => {
    layout[id].visible = !layout[id].visible;
    handlers.onLayout();
  });
  visible.classList.add("ofjo-switch");
  visible.setAttribute("role", "switch");
  visible.dataset.ofjoAct = "visible";
  visible.append(el("span", "ofjo-knob"));

  const name = text("span", "ofjo-tool-name", TOOL_LABELS[id]);

  const stepper = el("div", "ofjo-stepper");
  const smaller = press("−", () => {
    layout[id].scale = clampScale(layout[id].scale - 0.1);
    handlers.onLayout();
  });
  smaller.title = "Réduire";
  const scale = el("span", "ofjo-scale");
  scale.dataset.ofjoScale = "1";
  const larger = press("+", () => {
    layout[id].scale = clampScale(layout[id].scale + 0.1);
    handlers.onLayout();
  });
  larger.title = "Agrandir";
  stepper.append(smaller, scale, larger);

  const reset = press("", () => {
    layout[id] = defaultTool();
    handlers.onLayout();
  });
  reset.classList.add("ofjo-icon-btn");
  reset.title = "Remettre à sa place";
  reset.setAttribute("aria-label", "Remettre à sa place");
  reset.append(icon("reset"));

  row.append(visible, name, stepper, reset);
  return row;
}

/** Marks a value that changed since the last draw, up or down, for one short flash. */
function flash(
  node: HTMLElement,
  seen: Map<string, string>,
  key: string,
  value: string,
): void {
  const before = seen.get(key);
  seen.set(key, value);
  if (before === undefined || before === value) return;
  const from = parseShown(before);
  const to = parseShown(value);
  const tone =
    from !== null && to !== null && to < from ? "ofjo-down" : "ofjo-up";
  node.classList.remove("ofjo-up", "ofjo-down");
  node.getBoundingClientRect();
  node.classList.add(tone);
}

function setFlashing(
  body: HTMLElement,
  selector: string,
  seen: Map<string, string>,
  key: string,
  value: string | null,
): void {
  const node = body.querySelector(selector);
  if (!(node instanceof HTMLElement)) return;
  node.textContent = value ?? "";
  flash(node, seen, key, value ?? "");
}

function memoryOf(panel: HTMLElement): Map<string, string> {
  let seen = memory.get(panel);
  if (seen === undefined) {
    seen = new Map();
    memory.set(panel, seen);
  }
  return seen;
}

/** Reads a figure as the page wrote it ("4.89K", "1.2M") for bars and trend colour. */
function parseShown(value: string): number | null {
  const match = /^([+-]?\d+(?:[.,]\d+)?)\s*([kmb])?/i.exec(value.trim());
  if (match === null) return null;
  const base = Number((match[1] ?? "").replace(",", "."));
  const unit = match[2]?.toLowerCase();
  const factor =
    unit === "k" ? 1e3 : unit === "m" ? 1e6 : unit === "b" ? 1e9 : 1;
  return base * factor;
}

function ratioOf(value: string | null, max: string | null): number | null {
  if (value === null || max === null) return null;
  const current = parseShown(value);
  const limit = parseShown(max);
  if (current === null || limit === null || limit <= 0) return null;
  return Math.min(1, Math.max(0, current / limit));
}

function ratioLine(percent: string | null, troops: string | null): string {
  if (percent === null) return "";
  if (troops === null) return percent;
  return `${percent} (${troops})`;
}

function parsePercent(value: string | null): number | null {
  if (value === null) return null;
  const match = /^(\d+)%$/.exec(value);
  if (match === null) return null;
  return Number(match[1]);
}

function press(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  if (label !== "") button.append(text("span", "ofjo-label", label));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== "") node.className = className;
  return node;
}

function text<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  value: string,
): HTMLElementTagNameMap[K] {
  const node = el(tag, className);
  node.textContent = value;
  return node;
}
