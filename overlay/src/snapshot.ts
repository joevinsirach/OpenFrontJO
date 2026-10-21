export const ACTION_KINDS = ["attack", "alliance", "breakAlliance"] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

/** A button the official client has already drawn. */
export interface OverlayAction {
  kind: ActionKind;
  label: string;
}

export interface ColumnTitles {
  rank: string | null;
  name: string | null;
  gold: string | null;
  troops: string | null;
  headers: string[];
}

/** One cell already painted in the official leaderboard. */
export interface BoardCell {
  title: string;
  value: string;
}

/** A button the official page already drew, addressed by its order in that host. */
export interface OfficialPress {
  label: string;
  index: number;
}

/** One leaderboard row currently in the official DOM. Text is copied as shown. */
export interface VisiblePlayer {
  name: string;
  rank: string | null;
  troops: string | null;
  gold: string | null;
  relation: string | null;
  color: string | null;
  local: boolean;
  cells: BoardCell[];
}

/** The local strip the control panel is showing. Null when that panel is hidden. */
export interface LocalStatus {
  name: string | null;
  troops: string | null;
  troopsMax: string | null;
  gold: string | null;
  troopRate: string | null;
  attackRatioPercent: string | null;
  attackRatioTroops: string | null;
  color: string | null;
}

/** The player panel, when the official client has it open. */
export interface SelectedPlayer {
  name: string;
  troops: string | null;
  gold: string | null;
  relation: string | null;
  color: string | null;
  badge: string | null;
}

export interface AttackLine {
  text: string;
  actions: OfficialPress[];
}

export interface EventLine {
  text: string;
  important: boolean;
}

export interface AlertCard {
  text: string;
  actions: OfficialPress[];
}

export interface UnitChip {
  label: string;
  count: string | null;
  hotkey: string | null;
  /** Image URL the official page already uses for this slot. */
  icon: string | null;
  selected: boolean;
  dimmed: boolean;
  index: number;
}

export interface BuildChoice {
  label: string;
  cost: string | null;
  count: string | null;
  icon: string | null;
  disabled: boolean;
  index: number;
}

export interface SideButton {
  label: string;
  icon: string | null;
  index: number;
}

export interface Snapshot {
  local: LocalStatus | null;
  players: VisiblePlayer[];
  titles: ColumnTitles;
  team: string | null;
  selected: SelectedPlayer | null;
  playerButtons: OfficialPress[];
  messages: string[];
  actions: OverlayAction[];
  attacks: AttackLine[];
  events: EventLine[];
  alerts: AlertCard[];
  units: UnitChip[];
  build: BuildChoice[];
  timer: string | null;
  side: SideButton[];
}

export function emptySnapshot(): Snapshot {
  return {
    local: null,
    players: [],
    titles: { rank: null, name: null, gold: null, troops: null, headers: [] },
    team: null,
    selected: null,
    playerButtons: [],
    messages: [],
    actions: [],
    attacks: [],
    events: [],
    alerts: [],
    units: [],
    build: [],
    timer: null,
    side: [],
  };
}

/** Hide an official zone only when the reader actually found something there. */
export function replacementFlags(snapshot: Snapshot): {
  sidebar: boolean;
  control: boolean;
  player: boolean;
  attacks: boolean;
  events: boolean;
  units: boolean;
  build: boolean;
  topbar: boolean;
} {
  return {
    sidebar: snapshot.players.length > 0,
    control: snapshot.local !== null,
    player: snapshot.selected !== null,
    attacks: snapshot.attacks.length > 0,
    events: snapshot.events.length > 0 || snapshot.alerts.length > 0,
    units: snapshot.units.length > 0,
    build: snapshot.build.length > 0,
    topbar: snapshot.timer !== null || snapshot.side.length > 0,
  };
}

export function syncOfficialVisibility(
  doc: Document,
  snapshot: Snapshot,
  shown: {
    sidebar: boolean;
    control: boolean;
    player: boolean;
    attacks: boolean;
    events: boolean;
    units: boolean;
    build: boolean;
    topbar: boolean;
  } = {
    sidebar: true,
    control: true,
    player: true,
    attacks: true,
    events: true,
    units: true,
    build: true,
    topbar: true,
  },
): void {
  const flags = replacementFlags(snapshot);
  setFlag(doc, "data-ofjo-sidebar", flags.sidebar && shown.sidebar);
  setFlag(doc, "data-ofjo-control", flags.control && shown.control);
  setFlag(doc, "data-ofjo-player", flags.player && shown.player);
  setFlag(doc, "data-ofjo-attacks", flags.attacks && shown.attacks);
  setFlag(doc, "data-ofjo-events", flags.events && shown.events);
  setFlag(doc, "data-ofjo-units", flags.units && shown.units);
  setFlag(doc, "data-ofjo-build", flags.build && shown.build);
  setFlag(doc, "data-ofjo-topbar", flags.topbar && shown.topbar);
}

function setFlag(doc: Document, name: string, on: boolean): void {
  const current = doc.documentElement.getAttribute(name) === "1";
  if (current === on) return;
  if (on) doc.documentElement.setAttribute(name, "1");
  else doc.documentElement.removeAttribute(name);
}
