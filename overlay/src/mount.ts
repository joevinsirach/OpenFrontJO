import {
  clickBuildButton,
  clickHostButton,
  clickOfficialAction,
  clickSideButton,
  clickUnitSlot,
  setOfficialAttackRatio,
} from "./actions.js";
import { loadLayout, saveLayout } from "./layout.js";
import {
  ensureOverlayHost,
  removeOverlayHost,
  updateOverlay,
} from "./panels.js";
import { readSnapshot } from "./read.js";
import { SELECTORS } from "./selectors.js";
import { syncOfficialVisibility } from "./snapshot.js";

/** Watches the official DOM and keeps the overlay in step. Returns a cleanup. */
export function startOverlay(doc: Document): () => void {
  const layout = loadLayout();
  const handlers = {
    onRatio(percent: number) {
      setOfficialAttackRatio(doc, percent);
    },
    onAttack() {
      clickOfficialAction(doc, "attack");
    },
    onAlliance() {
      clickOfficialAction(doc, "alliance");
    },
    onBreakAlliance() {
      clickOfficialAction(doc, "breakAlliance");
    },
    onPlayerButton(index: number) {
      clickHostButton(doc, SELECTORS.playerPanel, index);
    },
    onAttackButton(index: number) {
      clickHostButton(doc, SELECTORS.attacks, index);
    },
    onAlertButton(index: number) {
      clickHostButton(doc, SELECTORS.alerts, index);
    },
    onUnit(index: number) {
      clickUnitSlot(doc, index);
    },
    onBuild(index: number) {
      clickBuildButton(doc, index);
    },
    onSide(index: number) {
      clickSideButton(doc, index);
    },
    onPlace() {
      saveLayout(layout);
    },
    onLayout() {
      saveLayout(layout);
      refresh();
    },
  };

  function refresh(): void {
    const snapshot = readSnapshot(doc);
    syncOfficialVisibility(doc, snapshot, {
      sidebar: layout.sidebar.visible,
      control: layout.control.visible,
      player: layout.player.visible,
      attacks: layout.attacks.visible,
      events: layout.events.visible,
      units: layout.units.visible,
      build: layout.build.visible,
      topbar: layout.topbar.visible,
    });
    if (doc.body === null) return;
    updateOverlay(ensureOverlayHost(doc), snapshot, handlers, layout);
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      refresh();
    });
  };

  refresh();
  const observer = new MutationObserver((records) => {
    if (records.every((record) => isOwnMutation(doc, record))) return;
    schedule();
  });
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });

  return () => {
    observer.disconnect();
    removeOverlayHost(doc);
    doc.documentElement.removeAttribute("data-ofjo-sidebar");
    doc.documentElement.removeAttribute("data-ofjo-control");
    doc.documentElement.removeAttribute("data-ofjo-player");
    doc.documentElement.removeAttribute("data-ofjo-attacks");
    doc.documentElement.removeAttribute("data-ofjo-events");
    doc.documentElement.removeAttribute("data-ofjo-units");
    doc.documentElement.removeAttribute("data-ofjo-build");
    doc.documentElement.removeAttribute("data-ofjo-topbar");
  };
}

function isOwnMutation(doc: Document, record: MutationRecord): boolean {
  if (record.target === doc.documentElement) {
    return record.attributeName?.startsWith("data-ofjo-") === true;
  }
  const element =
    record.target instanceof Element
      ? record.target
      : record.target.parentElement;
  if (element === null) return false;
  return (
    element.id === SELECTORS.overlayId ||
    element.closest(`#${SELECTORS.overlayId}`) !== null
  );
}
