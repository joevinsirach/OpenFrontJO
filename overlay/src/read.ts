import {
  buildButtons,
  buttonText,
  controlShell,
  elementShown,
  listOfficialActions,
  pickLayout,
  shellVisible,
  shownButtons,
  sideButtons,
  unitSlots,
  viewOf,
} from "./actions.js";
import { SELECTORS } from "./selectors.js";
import {
  emptySnapshot,
  type ColumnTitles,
  type LocalStatus,
  type SelectedPlayer,
  type Snapshot,
  type VisiblePlayer,
} from "./snapshot.js";

type ColumnKind = "rank" | "name" | "gold" | "troops" | "other";

/**
 * Reads what the official page has already drawn.
 * Missing text stays null. Nothing here is computed from game state.
 */
export function readSnapshot(root: ParentNode): Snapshot {
  const snapshot = emptySnapshot();
  let teamColor: string | null = null;
  const sidebarHost = root.querySelector(SELECTORS.leftSidebar);
  const sidebar = sidebarHost === null ? null : viewOf(sidebarHost);
  if (sidebar !== null) {
    const statsHost = sidebar.querySelector(SELECTORS.playerStats);
    if (
      statsHost instanceof HTMLElement &&
      !statsHost.classList.contains(SELECTORS.hiddenClass)
    ) {
      const table = readTable(viewOf(statsHost));
      snapshot.players = table.players;
      snapshot.titles = table.titles;
    }
    const team = sidebar.querySelector(SELECTORS.teamColor);
    if (team instanceof HTMLElement) {
      const color = team.style.getPropertyValue("--color").trim();
      if (color !== "") teamColor = color;
      const label = clean(team.textContent);
      if (label !== null) snapshot.team = label;
    }
  }

  const controlHost = root.querySelector(SELECTORS.controlPanel);
  if (controlHost !== null) {
    const control = readControl(viewOf(controlHost));
    if (control !== null) {
      snapshot.local = control;
      snapshot.local.color = teamColor;
      snapshot.messages = controlMessages(viewOf(controlHost));
    }
  }

  const pinned = snapshot.players.find((player) => player.local);
  if (pinned !== undefined && teamColor !== null && pinned.color === null) {
    pinned.color = teamColor;
  }
  if (snapshot.local !== null && pinned !== undefined) {
    snapshot.local.name = pinned.name;
    snapshot.local.color ??= pinned.color;
  }

  const panelHost = root.querySelector(SELECTORS.playerPanel);
  if (panelHost !== null) {
    snapshot.selected = readSelected(viewOf(panelHost));
  }
  if (snapshot.selected !== null) {
    for (const player of snapshot.players) {
      if (player.name === snapshot.selected.name) {
        player.relation = snapshot.selected.relation;
      }
    }
  }

  snapshot.actions = listOfficialActions(root);
  snapshot.playerButtons = shownButtons(root, SELECTORS.playerPanel).map(
    (button, index) => ({ label: buttonText(button), index }),
  );
  snapshot.attacks = readAttacks(root);
  snapshot.events = readEvents(root);
  snapshot.alerts = readAlerts(root);
  snapshot.units = readUnits(root);
  snapshot.build = readBuild(root);
  snapshot.timer = readTimer(root);
  snapshot.side = sideButtons(root).map((button, index) => ({
    label: sideLabel(button),
    icon: clean(button.querySelector("img")?.getAttribute("src")),
    index,
  }));
  return snapshot;
}

function readControl(view: ParentNode): LocalStatus | null {
  const shell = controlShell(view);
  if (shell === null || !shellVisible(shell)) return null;
  const layout = pickLayout(shell);
  if (layout === null) return null;

  const troops = readTroopFigures(layout);
  const gold = readGold(layout);
  const ratio = readRatio(layout);
  if (troops.troops === null && gold === null && ratio.percent === null) {
    return null;
  }
  return {
    name: null,
    troops: troops.troops,
    troopsMax: troops.max,
    gold,
    troopRate: troops.rate,
    attackRatioPercent: ratio.percent,
    attackRatioTroops: ratio.troops,
    color: null,
  };
}

function controlMessages(view: ParentNode): string[] {
  const shell = controlShell(view);
  if (shell === null || !shellVisible(shell)) return [];
  const layout = pickLayout(shell);
  if (layout === null) return [];
  const messages: string[] = [];
  for (const span of layout.querySelectorAll("span")) {
    const mark = span.textContent?.trim() ?? "";
    if (mark !== SELECTORS.warningMark && mark !== SELECTORS.infoMark) continue;
    const parent = span.parentElement;
    if (parent === null) continue;
    for (const other of parent.querySelectorAll(":scope > span")) {
      if (other === span) continue;
      const text = other.textContent?.trim() ?? "";
      if (text === "") continue;
      messages.push(text);
    }
  }
  return messages;
}

function readTroopFigures(layout: ParentNode): {
  troops: string | null;
  max: string | null;
  rate: string | null;
} {
  let rate: string | null = null;
  for (const span of layout.querySelectorAll("span")) {
    const text = span.textContent?.trim() ?? "";
    if (/^\+\S+\/s$/.test(text)) rate = text;
  }
  for (const span of layout.querySelectorAll("span")) {
    if ((span.textContent?.trim() ?? "") !== "/") continue;
    return {
      troops: clean(span.previousElementSibling?.textContent),
      max: clean(span.nextElementSibling?.textContent),
      rate,
    };
  }
  const bar = layout.querySelector(".justify-between");
  if (bar !== null) {
    const values = [...bar.querySelectorAll(":scope > span")]
      .map((span) => span.textContent?.trim() ?? "")
      .filter((text) => text !== "");
    return { troops: values[0] ?? null, max: values[1] ?? null, rate };
  }
  return { troops: null, max: null, rate };
}

function readGold(layout: ParentNode): string | null {
  for (const image of layout.querySelectorAll("img")) {
    const src = image.getAttribute("src") ?? "";
    if (!src.includes(SELECTORS.goldIcon)) continue;
    const box = image.parentElement;
    if (box === null) continue;
    for (const span of box.querySelectorAll("span.tabular-nums")) {
      if (span.classList.contains("gold-gain-pop")) continue;
      const text = span.textContent?.trim() ?? "";
      if (text !== "") return text;
    }
  }
  return null;
}

function readRatio(layout: ParentNode): {
  percent: string | null;
  troops: string | null;
} {
  for (const span of layout.querySelectorAll("span")) {
    const text = span.textContent ?? "";
    const match = /(\d+)%\s*\(([^)]+)\)/s.exec(text);
    if (match === null) continue;
    return { percent: `${match[1]}%`, troops: match[2].trim() };
  }
  const input = layout.querySelector(SELECTORS.range);
  if (input instanceof HTMLInputElement && input.value !== "") {
    return { percent: `${input.value}%`, troops: null };
  }
  return { percent: null, troops: null };
}

function readTable(stats: ParentNode): {
  players: VisiblePlayer[];
  titles: ColumnTitles;
} {
  const headers = [...stats.querySelectorAll(SELECTORS.statsHeaderCell)];
  const kinds = headers.map(columnKind);
  const titles: ColumnTitles = {
    rank: null,
    name: null,
    gold: null,
    troops: null,
    headers: headers.map(headerLabel),
  };
  kinds.forEach((kind, index) => {
    if (kind === "other") return;
    const title = headers[index]?.getAttribute("title");
    if (title !== null && title !== "") titles[kind] = title;
  });

  const players: VisiblePlayer[] = [];
  for (const row of stats.querySelectorAll(SELECTORS.statsRow)) {
    const sources = [...row.querySelectorAll(SELECTORS.statsCell)];
    let name: string | null = null;
    let rank: string | null = null;
    let gold: string | null = null;
    let troops: string | null = null;
    let color: string | null = null;
    const cells: { title: string; value: string }[] = [];
    kinds.forEach((kind, index) => {
      const source = sources[index];
      const value =
        source === undefined ? "" : (clean(source.textContent) ?? "");
      cells.push({ title: titles.headers[index] ?? "", value });
      if (source === undefined) return;
      if (kind === "name") {
        name = value === "" ? null : value;
        color = inlineColor(source);
      } else if (kind === "rank") rank = value === "" ? null : value;
      else if (kind === "gold") gold = value === "" ? null : value;
      else if (kind === "troops") troops = value === "" ? null : value;
    });
    if (name === null) continue;
    players.push({
      name,
      rank,
      gold,
      troops,
      relation: null,
      color,
      local: row.classList.contains(SELECTORS.pinnedRowClass),
      cells,
    });
  }
  return { players, titles };
}

function headerLabel(header: Element): string {
  const title = header.getAttribute("title");
  if (title !== null && title !== "") return title;
  const aria = header.querySelector("button")?.getAttribute("aria-label");
  if (aria !== null && aria !== undefined && aria !== "") return aria;
  return clean(header.textContent) ?? "";
}

function columnKind(header: Element): ColumnKind {
  if ((header.textContent?.trim() ?? "") === "#") return "rank";
  const sources = [...header.querySelectorAll("img")].map(
    (image) => image.getAttribute("src") ?? "",
  );
  if (sources.some((src) => src.includes(SELECTORS.maxTroopIcon)))
    return "other";
  if (sources.some((src) => src.includes(SELECTORS.troopIcon))) return "troops";
  if (sources.some((src) => src.includes(SELECTORS.goldIcon))) {
    const rate = [...header.querySelectorAll("span")].some((span) =>
      (span.textContent ?? "").includes("/"),
    );
    return rate ? "other" : "gold";
  }
  if (sources.some((src) => src.includes(SELECTORS.nameIcon))) return "name";
  return "other";
}

function readSelected(view: ParentNode): SelectedPlayer | null {
  const heading = view.querySelector(SELECTORS.playerName);
  if (!(heading instanceof HTMLElement)) return null;
  const name = heading.textContent?.trim() ?? "";
  if (name === "") return null;
  return {
    name,
    gold: textByMark(view, SELECTORS.goldMark),
    troops: textByMark(view, SELECTORS.troopMark),
    relation: readRelation(view),
    color: inlineColor(heading),
    badge: readBadge(view),
  };
}

function textByMark(view: ParentNode, mark: string): string | null {
  for (const span of view.querySelectorAll("span")) {
    if ((span.textContent?.trim() ?? "") !== mark) continue;
    const box = span.parentElement;
    if (box === null) return null;
    for (const value of box.querySelectorAll("span.tabular-nums")) {
      const text = value.textContent?.trim() ?? "";
      if (text !== "") return text;
    }
    return null;
  }
  return null;
}

function readRelation(view: ParentNode): string | null {
  const span = view.querySelector(SELECTORS.relation);
  if (!(span instanceof HTMLElement)) return null;
  if (span.querySelector("img") !== null) return null;
  return clean(span.textContent);
}

function inlineColor(element: Element): string | null {
  if (!(element instanceof HTMLElement)) return null;
  const color = element.style.color.trim();
  if (color !== "") return color;
  for (const child of element.querySelectorAll("[style]")) {
    if (!(child instanceof HTMLElement)) continue;
    const nested = child.style.color.trim();
    if (nested !== "") return nested;
  }
  return null;
}

function readBadge(view: ParentNode): string | null {
  const badge = view.querySelector("[role='status']");
  if (!(badge instanceof HTMLElement)) return null;
  return clean(badge.textContent);
}

function readAttacks(root: ParentNode): Snapshot["attacks"] {
  const host = root.querySelector(SELECTORS.attacks);
  if (!(host instanceof HTMLElement) || !elementShown(host)) return [];
  const grid = viewOf(host).querySelector("div");
  if (grid === null) return [];
  const lines: Snapshot["attacks"] = [];
  let index = 0;
  for (const row of grid.children) {
    if (!(row instanceof HTMLElement)) continue;
    const text = collapse(row.textContent);
    if (text === "") continue;
    const actions: Snapshot["attacks"][number]["actions"] = [];
    for (const node of row.querySelectorAll("button")) {
      if (!(node instanceof HTMLButtonElement) || node.disabled) continue;
      const label = buttonText(node);
      if (label === "") continue;
      actions.push({ label, index });
      index += 1;
    }
    lines.push({ text, actions });
  }
  return lines;
}

function readEvents(root: ParentNode): Snapshot["events"] {
  const host = root.querySelector(SELECTORS.events);
  if (!(host instanceof HTMLElement) || !elementShown(host)) return [];
  const lines: Snapshot["events"] = [];
  for (const row of viewOf(host).querySelectorAll("tr")) {
    const text = collapse(row.textContent);
    if (text === "") continue;
    lines.push({
      text,
      important: row.closest(SELECTORS.importantEvents) !== null,
    });
  }
  return lines;
}

function readAlerts(root: ParentNode): Snapshot["alerts"] {
  const host = root.querySelector(SELECTORS.alerts);
  if (!(host instanceof HTMLElement) || !elementShown(host)) return [];
  const cards: Snapshot["alerts"] = [];
  let index = 0;
  for (const card of viewOf(host).querySelectorAll("div.rounded-lg")) {
    const actions: Snapshot["alerts"][number]["actions"] = [];
    let text = "";
    for (const node of card.querySelectorAll("button")) {
      if (!(node instanceof HTMLButtonElement) || node.disabled) continue;
      const label = buttonText(node);
      if (label === "") continue;
      if (text === "") text = label;
      else actions.push({ label, index });
      index += 1;
    }
    if (text === "") continue;
    cards.push({ text, actions });
  }
  return cards;
}

function readUnits(root: ParentNode): Snapshot["units"] {
  return unitSlots(root).map((slot, index) => {
    const image = slot.querySelector("img");
    const label = image?.getAttribute("alt") ?? "";
    const count = clean(slot.querySelector("span")?.textContent);
    const hotkeyNode = [...slot.querySelectorAll("div")].find((node) => {
      if (node.querySelector("img") !== null) return false;
      const text = clean(node.textContent);
      return text !== null && text.length <= 3;
    });
    return {
      label,
      count,
      hotkey: clean(hotkeyNode?.textContent ?? null),
      icon: clean(image?.getAttribute("src")),
      selected: slot.classList.contains(SELECTORS.unitSelectedClass),
      dimmed: slot.classList.contains(SELECTORS.unitDimmedClass),
      index,
    };
  });
}

function readBuild(root: ParentNode): Snapshot["build"] {
  return buildButtons(root).map((button, index) => ({
    label:
      clean(button.querySelector(SELECTORS.buildName)?.textContent) ??
      buttonText(button),
    cost: clean(button.querySelector(SELECTORS.buildCost)?.textContent),
    count: clean(button.querySelector(SELECTORS.buildCount)?.textContent),
    icon: clean(button.querySelector("img")?.getAttribute("src")),
    disabled: button.disabled,
    index,
  }));
}

function readTimer(root: ParentNode): string | null {
  const host = root.querySelector(SELECTORS.rightSidebar);
  if (!(host instanceof HTMLElement) || !elementShown(host)) return null;
  const timer = viewOf(host).querySelector(SELECTORS.timer);
  if (!(timer instanceof HTMLElement)) return null;
  const aside = timer.closest("aside");
  if (
    aside instanceof HTMLElement &&
    aside.className.includes("translate-x-full")
  ) {
    return null;
  }
  return clean(timer.textContent);
}

function sideLabel(button: HTMLElement): string {
  const alt = button.querySelector("img")?.getAttribute("alt");
  if (alt !== null && alt !== undefined && alt !== "") return alt;
  const title = button.getAttribute("title");
  if (title !== null && title !== "") return title;
  return clean(button.textContent) ?? "";
}

function collapse(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function clean(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text === "" ? null : text;
}
