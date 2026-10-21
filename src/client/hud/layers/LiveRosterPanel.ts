import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { Controller } from "../../Controller";
import type { ColumnId } from "../../StatsConstants";
import { getTranslatedPlayerTeamLabel, translateText } from "../../Utils";
import type { GameView } from "../../view";
import type { PlayerView } from "../../view/PlayerView";
import {
  type ColumnDef,
  type ColumnRow,
  columnById,
  columnValues,
} from "./lib/StatsColumns";

const DATA_COLUMNS = [
  "gold",
  "troops",
  "tiles",
  "goldIncomePerMin",
  "allies",
  "betrayals",
] as const satisfies readonly ColumnId[];

const HEADER_KEYS = [
  "leaderboard.rank",
  "leaderboard.player",
  "leaderboard.gold",
  "leaderboard.troops",
  "leaderboard.owned",
  "leaderboard.goldIncomePerMin",
  "leaderboard.team",
  "leaderboard.allies",
  "leaderboard.betrayals",
] as const;

export interface RosterLine {
  readonly key: string;
  readonly rank: number;
  readonly name: string;
  readonly team: string;
  readonly mine: boolean;
  readonly gold: string;
  readonly troops: string;
  readonly territory: string;
  readonly gpm: string;
  readonly allies: string;
  readonly betrayals: string;
}

function dataColumns(): ColumnDef[] {
  return DATA_COLUMNS.map((id) => columnById(id));
}

function cellText(
  player: PlayerView,
  game: GameView,
  column: ColumnDef,
  values: ReadonlyMap<ColumnId, number>,
  rank: number,
): string {
  const row: ColumnRow = {
    position: rank,
    name: player.name(),
    clanTag: player.clanTag(),
    value: values.get(column.id) ?? 0,
  };
  return column.cell(row, game);
}

/**
 * One row per living player, sorted by territory like the default leaderboard.
 * Reads PlayerView and the existing column formatters. Does not emit intents.
 */
export function buildRosterLines(game: GameView): RosterLine[] {
  const columns = dataColumns();
  const players = game
    .playerViews()
    .filter((player) => player.isAlive())
    .sort((a, b) => {
      const byTiles = b.numTilesOwned() - a.numTilesOwned();
      if (byTiles !== 0) return byTiles;
      return a.name().localeCompare(b.name());
    });

  return players.map((player, index) => {
    const rank = index + 1;
    const values = columnValues(player, game, columns);
    const text = (id: (typeof DATA_COLUMNS)[number]) =>
      cellText(player, game, columnById(id), values, rank);
    const team = player.team();
    const teamLabel =
      team === null
        ? ""
        : getTranslatedPlayerTeamLabel(team, game.teamClanTag(team));
    return {
      key: player.id(),
      rank,
      name: player.name(),
      team: teamLabel === "" ? "—" : teamLabel,
      mine: player.isMe(),
      gold: text("gold"),
      troops: text("troops"),
      territory: text("tiles"),
      gpm: text("goldIncomePerMin"),
      allies: text("allies"),
      betrayals: text("betrayals"),
    };
  });
}

@customElement("live-roster-panel")
export class LiveRosterPanel extends LitElement implements Controller {
  public game: GameView | null = null;

  @state()
  private lines: RosterLine[] = [];

  createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add(
      "fixed",
      "top-16",
      "left-2",
      "z-[260]",
      "pointer-events-auto",
      "max-h-[40vh]",
      "max-w-[92vw]",
      "overflow-auto",
      "rounded-lg",
      "bg-gray-800/92",
      "px-2",
      "py-1",
      "text-xs",
      "text-white",
      "shadow-lg",
      "backdrop-blur-sm",
      "tabular-nums",
    );
  }

  init(): void {
    this.refresh();
  }

  getTickIntervalMs(): number {
    return 500;
  }

  tick(): void {
    this.refresh();
  }

  private refresh(): void {
    const game = this.game;
    if (game === null) return;
    this.lines = buildRosterLines(game);
  }

  render() {
    const headers = HEADER_KEYS.map((key) => translateText(key));
    return html`
      <h2 class="m-0 px-1 py-1 text-[11px] font-semibold tracking-wide">
        ${translateText("live_roster.title")}
      </h2>
      <table class="w-full border-collapse">
        <thead>
          <tr class="text-left text-slate-300">
            ${headers.map(
              (label) =>
                html`<th class="px-1 py-0.5 font-medium">${label}</th>`,
            )}
          </tr>
        </thead>
        <tbody>
          ${this.lines.length === 0
            ? nothing
            : repeat(
                this.lines,
                (line) => line.key,
                (line) => html`
                  <tr class=${line.mine ? "bg-gray-700/95" : ""}>
                    <td class="px-1 py-0.5">${line.rank}</td>
                    <td class="max-w-32 truncate px-1 py-0.5">${line.name}</td>
                    <td class="px-1 py-0.5">${line.gold}</td>
                    <td class="px-1 py-0.5">${line.troops}</td>
                    <td class="px-1 py-0.5">${line.territory}</td>
                    <td class="px-1 py-0.5">${line.gpm}</td>
                    <td class="px-1 py-0.5">${line.team}</td>
                    <td class="px-1 py-0.5">${line.allies}</td>
                    <td class="px-1 py-0.5">${line.betrayals}</td>
                  </tr>
                `,
              )}
        </tbody>
      </table>
    `;
  }
}
