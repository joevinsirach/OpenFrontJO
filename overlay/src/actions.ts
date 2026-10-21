import { SELECTORS } from "./selectors.js";
import type { ActionKind, OverlayAction } from "./snapshot.js";

const ICONS: Record<ActionKind, string> = {
  attack: SELECTORS.attackIcon,
  alliance: SELECTORS.allianceIcon,
  breakAlliance: SELECTORS.breakAllianceIcon,
};

const HOSTS: Record<ActionKind, readonly string[]> = {
  attack: [SELECTORS.playerInfo, SELECTORS.playerPanel],
  alliance: [SELECTORS.playerPanel, SELECTORS.playerInfo],
  breakAlliance: [SELECTORS.playerPanel, SELECTORS.playerInfo],
};

/** Open shadow root when the component has one; otherwise the light DOM host. */
export function viewOf(host: Element): ParentNode {
  const shadow = host.shadowRoot;
  if (shadow !== null && shadow.childElementCount > 0) return shadow;
  return host;
}

export function listOfficialActions(root: ParentNode): OverlayAction[] {
  const actions: OverlayAction[] = [];
  for (const kind of ["attack", "alliance", "breakAlliance"] as const) {
    const button = findActionButton(root, kind);
    if (button === null) continue;
    actions.push({ kind, label: buttonLabel(button) });
  }
  return actions;
}

/**
 * Clicks the official button already on the page.
 * Returns false when that button is not shown. Never synthesizes a map click.
 */
export function clickOfficialAction(
  root: ParentNode,
  kind: ActionKind,
): boolean {
  const button = findActionButton(root, kind);
  if (button === null) return false;
  button.click();
  return true;
}

/**
 * Drives the official attack-ratio slider. The official handler updates the
 * game; this function does not write game state itself.
 */
export function setOfficialAttackRatio(
  root: ParentNode,
  percent: number,
): boolean {
  const input = officialRange(root);
  if (input === null) return false;
  const clamped = Math.min(100, Math.max(1, Math.round(percent)));
  input.value = String(clamped);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("pointerup", { bubbles: true }));
  return true;
}

export function findActionButton(
  root: ParentNode,
  kind: ActionKind,
): HTMLButtonElement | null {
  const icon = ICONS[kind];
  for (const selector of HOSTS[kind]) {
    for (const host of root.querySelectorAll(selector)) {
      const button = buttonWithIcon(viewOf(host), icon);
      if (button !== null && isShown(button)) return button;
    }
  }
  return null;
}

function officialRange(root: ParentNode): HTMLInputElement | null {
  for (const host of root.querySelectorAll(SELECTORS.controlPanel)) {
    const view = viewOf(host);
    const shell = controlShell(view);
    if (shell === null || !shellVisible(shell)) continue;
    const layout = pickLayout(shell);
    const input = layout?.querySelector(SELECTORS.range);
    if (input instanceof HTMLInputElement) return input;
  }
  return null;
}

export function controlShell(view: ParentNode): HTMLElement | null {
  for (const child of view.children) {
    if (
      child instanceof HTMLElement &&
      child.classList.contains(SELECTORS.shellClass)
    ) {
      return child;
    }
  }
  return null;
}

export function shellVisible(shell: HTMLElement): boolean {
  if (shell.classList.contains(SELECTORS.hiddenClass)) return false;
  return getComputedStyle(shell).display !== "none";
}

export function pickLayout(shell: HTMLElement): HTMLElement | null {
  const layouts = [...shell.children].filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      (child.classList.contains(SELECTORS.layoutMobile) ||
        child.classList.contains(SELECTORS.layoutDesktop)),
  );
  if (layouts.length === 0) return null;
  const visible = layouts.filter(
    (layout) => getComputedStyle(layout).display !== "none",
  );
  if (visible.length === 1) return visible[0];
  return (
    visible.find((layout) =>
      layout.classList.contains(SELECTORS.layoutDesktop),
    ) ??
    visible[0] ??
    null
  );
}

function buttonWithIcon(
  view: ParentNode,
  icon: string,
): HTMLButtonElement | null {
  for (const node of view.querySelectorAll("button")) {
    if (!(node instanceof HTMLButtonElement) || node.disabled) continue;
    const src = node.querySelector("img")?.getAttribute("src") ?? "";
    if (src.includes(icon)) return node;
  }
  return null;
}

function buttonLabel(button: HTMLButtonElement): string {
  const aria = button.getAttribute("aria-label");
  if (aria !== null && aria !== "") return aria;
  const title = button.getAttribute("title");
  if (title !== null && title !== "") return title;
  const span = button.querySelector("span")?.textContent?.trim() ?? "";
  if (span !== "") return span;
  return (button.textContent ?? "").replace(/\s+/g, " ").trim();
}

function isShown(element: HTMLElement): boolean {
  return elementShown(element);
}

/** True when the element and its ancestors are not display:none. */
export function elementShown(element: HTMLElement): boolean {
  let node: HTMLElement | null = element;
  while (node !== null) {
    if (getComputedStyle(node).display === "none") return false;
    node = node.parentElement;
  }
  return true;
}

export function clickHostButton(
  root: ParentNode,
  hostSelector: string,
  index: number,
): boolean {
  const button = shownButtons(root, hostSelector)[index];
  if (button === undefined) return false;
  button.click();
  return true;
}

export function shownButtons(
  root: ParentNode,
  hostSelector: string,
): HTMLButtonElement[] {
  const host = root.querySelector(hostSelector);
  if (!(host instanceof HTMLElement) || !elementShown(host)) return [];
  const buttons: HTMLButtonElement[] = [];
  for (const node of viewOf(host).querySelectorAll("button")) {
    if (!(node instanceof HTMLButtonElement) || node.disabled) continue;
    if (!elementShown(node)) continue;
    buttons.push(node);
  }
  return buttons;
}

export function unitSlots(root: ParentNode): HTMLElement[] {
  const host = root.querySelector(SELECTORS.units);
  if (!(host instanceof HTMLElement) || !elementShown(host)) return [];
  const slots: HTMLElement[] = [];
  for (const image of viewOf(host).querySelectorAll("img")) {
    const alt = image.getAttribute("alt") ?? "";
    if (alt === "") continue;
    const slot = image.closest(SELECTORS.cursorSlot);
    if (!(slot instanceof HTMLElement) || slots.includes(slot)) continue;
    if (!elementShown(slot)) continue;
    slots.push(slot);
  }
  return slots;
}

export function clickUnitSlot(root: ParentNode, index: number): boolean {
  const slot = unitSlots(root)[index];
  if (slot === undefined) return false;
  slot.click();
  return true;
}

export function buildButtons(root: ParentNode): HTMLButtonElement[] {
  const host = root.querySelector(SELECTORS.build);
  if (!(host instanceof HTMLElement)) return [];
  const menu = viewOf(host).querySelector(SELECTORS.buildMenu);
  if (!(menu instanceof HTMLElement) || !elementShown(menu)) return [];
  if (menu.classList.contains(SELECTORS.hiddenClass)) return [];
  const buttons: HTMLButtonElement[] = [];
  for (const node of menu.querySelectorAll(SELECTORS.buildButton)) {
    if (!(node instanceof HTMLButtonElement)) continue;
    if (!elementShown(node)) continue;
    buttons.push(node);
  }
  return buttons;
}

export function clickBuildButton(root: ParentNode, index: number): boolean {
  const button = buildButtons(root)[index];
  if (button === undefined || button.disabled) return false;
  button.click();
  return true;
}

export function sideButtons(root: ParentNode): HTMLElement[] {
  const host = root.querySelector(SELECTORS.rightSidebar);
  if (!(host instanceof HTMLElement) || !elementShown(host)) return [];
  const buttons: HTMLElement[] = [];
  for (const node of viewOf(host).querySelectorAll(SELECTORS.cursorSlot)) {
    if (!(node instanceof HTMLElement) || !elementShown(node)) continue;
    const hiddenAway = node.closest("aside");
    if (
      hiddenAway instanceof HTMLElement &&
      hiddenAway.className.includes("translate-x-full")
    ) {
      continue;
    }
    buttons.push(node);
  }
  return buttons;
}

export function clickSideButton(root: ParentNode, index: number): boolean {
  const button = sideButtons(root)[index];
  if (button === undefined) return false;
  button.click();
  return true;
}

export function buttonText(button: HTMLButtonElement): string {
  return buttonLabel(button);
}
