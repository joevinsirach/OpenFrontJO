// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clickBuildButton,
  clickHostButton,
  clickOfficialAction,
  clickSideButton,
  setOfficialAttackRatio,
} from "../../overlay/src/actions";
import { startOverlay } from "../../overlay/src/mount";
import { readSnapshot } from "../../overlay/src/read";
import { replacementFlags } from "../../overlay/src/snapshot";

const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../overlay/fixtures/official-ingame.html",
);

function mountFixture(): void {
  document.body.innerHTML = readFileSync(fixturePath, "utf8");
}

describe("official page reader", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-ofjo-sidebar");
    document.documentElement.removeAttribute("data-ofjo-control");
  });

  it("copies the figures the desktop control panel and leaderboard are showing", () => {
    mountFixture();
    const snapshot = readSnapshot(document);

    expect(snapshot.local).toMatchObject({
      name: "AnonCastle1",
      troops: "4.89K",
      troopsMax: "80.0K",
      gold: "6.40K",
      troopRate: "+120/s",
      attackRatioPercent: "20%",
      attackRatioTroops: "980",
      color: "rgb(10, 20, 30)",
    });
    expect(snapshot.messages).toEqual([
      "You're near your army limit! Consider sending troops to teammates.",
    ]);
    expect(snapshot.players.map((player) => player.name)).toEqual([
      "AnonCastle1",
      "France",
    ]);
    expect(snapshot.players[0]).toMatchObject({
      rank: "5",
      gold: "6.40K",
      troops: "4.89K",
      relation: null,
      local: true,
      color: "rgb(10, 20, 30)",
    });
    expect(snapshot.players[1]).toMatchObject({
      gold: "0",
      troops: "1.25K",
      relation: "Hostile",
      color: null,
      local: false,
    });
    expect(snapshot.players[0]?.troops).not.toBe("80.0K");
    expect(snapshot.players[0]?.gold).not.toBe("60.0K");
    expect(snapshot.players[0]?.cells).toEqual(
      expect.arrayContaining([
        { title: "Gold Income/min", value: "60.0K" },
        { title: "Max Troops", value: "80.0K" },
      ]),
    );
    expect(snapshot.team).toContain("Blue");
    expect(snapshot.selected?.badge).toBe("Traitor");
    expect(snapshot.attacks[0]?.text).toContain("France");
    expect(
      snapshot.attacks[0]?.actions.map((action) => action.label),
    ).toContain("Riposte");
    expect(snapshot.events).toEqual([
      { text: "France attacked you", important: false },
      { text: "Alliance broken", important: true },
    ]);
    expect(snapshot.alerts[0]?.actions.map((action) => action.label)).toEqual([
      "Accept",
      "Reject",
    ]);
    expect(snapshot.units[0]).toMatchObject({
      label: "city",
      count: "3",
      hotkey: "1",
    });
    expect(snapshot.build[0]).toMatchObject({
      label: "City",
      cost: "125K",
      count: "2",
    });
    expect(snapshot.timer).toBe("12:34");
    expect(snapshot.side.map((button) => button.label)).toEqual([
      "settings",
      "exit",
    ]);
    expect(snapshot.selected).toMatchObject({
      name: "France",
      gold: "0",
      troops: "1.25K",
      relation: "Hostile",
    });
    expect(snapshot.actions.map((action) => action.kind)).toEqual([
      "attack",
      "alliance",
    ]);
    expect(snapshot.titles).toMatchObject({
      rank: "Rank",
      name: "Player",
      gold: "Gold",
      troops: "Troops",
    });
  });

  it("leaves troops empty when the leaderboard is not showing them", () => {
    document.body.innerHTML = `
      <game-left-sidebar>
      <player-stats class="block">
        <div class="stats-table-header-cell" title="Rank"><span>#</span></div>
        <div class="stats-table-header-cell" title="Player">
          <img src="/images/ProfileIcon.svg" alt="" />
        </div>
        <div class="stats-table-header-cell" title="Gold">
          <img src="/images/GoldCoinIcon.svg" alt="" />
        </div>
        <div class="stats-table-row">
          <div class="stats-table-cell"><span>1</span></div>
          <div class="stats-table-cell"><span>Solo</span></div>
          <div class="stats-table-cell"><span>10</span></div>
        </div>
      </player-stats>
      </game-left-sidebar>
    `;
    const snapshot = readSnapshot(document);
    expect(snapshot.players[0]).toMatchObject({
      name: "Solo",
      gold: "10",
      troops: null,
      relation: null,
      color: null,
    });
  });

  it("reads an open shadow root and ignores a hidden control panel", () => {
    const host = document.createElement("control-panel");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <div class="pointer-events-auto">
        <div class="lg:block">
          <img src="/images/GoldCoinIcon.svg" alt="" />
          <span class="tabular-nums">42</span>
          <span>7% (3)</span>
          <input type="range" min="1" max="100" value="7" />
        </div>
      </div>
    `;
    document.body.append(host);
    const open = readSnapshot(document);
    expect(open.local?.gold).toBe("42");
    expect(open.local?.attackRatioPercent).toBe("7%");

    const shell = shadow.querySelector(".pointer-events-auto");
    shell?.classList.add("hidden");
    const closed = readSnapshot(document);
    expect(closed.local).toBeNull();
    expect(replacementFlags(closed).control).toBe(false);
  });
});

describe("official buttons", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("moves the official ratio slider and clicks the official attack and alliance buttons", () => {
    mountFixture();
    const ranges = [
      ...document.querySelectorAll("control-panel input[type='range']"),
    ];
    const desktop = ranges[1];
    if (!(desktop instanceof HTMLInputElement))
      throw new Error("missing slider");
    let ratio = "";
    desktop.addEventListener("input", () => {
      ratio = desktop.value;
    });
    expect(setOfficialAttackRatio(document, 35)).toBe(true);
    expect(ratio).toBe("35");
    expect(ranges[0]).toHaveProperty("value", "1");

    const attack = document.querySelector("player-info-overlay button");
    const alliance = document.querySelector("player-panel button");
    if (!(attack instanceof HTMLButtonElement))
      throw new Error("missing attack");
    if (!(alliance instanceof HTMLButtonElement))
      throw new Error("missing alliance");
    let attacked = 0;
    let allied = 0;
    attack.addEventListener("click", () => {
      attacked += 1;
    });
    alliance.addEventListener("click", () => {
      allied += 1;
    });
    expect(clickOfficialAction(document, "attack")).toBe(true);
    expect(clickOfficialAction(document, "alliance")).toBe(true);
    expect(attacked).toBe(1);
    expect(allied).toBe(1);

    attack.remove();
    expect(clickOfficialAction(document, "attack")).toBe(false);
    expect(attacked).toBe(1);
  });

  it("clicks the official build, retaliate, and exit controls", () => {
    mountFixture();
    const build = document.querySelector("button.build-button");
    const riposte = [
      ...document.querySelectorAll("attacks-display button"),
    ].find((button) => button.textContent === "Riposte");
    const exit = [
      ...document.querySelectorAll("game-right-sidebar .cursor-pointer"),
    ].find(
      (button) => button.querySelector("img")?.getAttribute("alt") === "exit",
    );
    if (
      !(build instanceof HTMLButtonElement) ||
      !(riposte instanceof HTMLButtonElement) ||
      !(exit instanceof HTMLElement)
    ) {
      throw new Error("missing official controls");
    }
    let built = 0;
    let countered = 0;
    let left = 0;
    build.addEventListener("click", () => {
      built += 1;
    });
    riposte.addEventListener("click", () => {
      countered += 1;
    });
    exit.addEventListener("click", () => {
      left += 1;
    });
    const snapshot = readSnapshot(document);
    expect(clickBuildButton(document, snapshot.build[0]?.index ?? -1)).toBe(
      true,
    );
    const riposteAction = snapshot.attacks[0]?.actions.find(
      (action) => action.label === "Riposte",
    );
    expect(
      clickHostButton(document, "attacks-display", riposteAction?.index ?? -1),
    ).toBe(true);
    const exitButton = snapshot.side.find((button) => button.label === "exit");
    expect(clickSideButton(document, exitButton?.index ?? -1)).toBe(true);
    expect(built).toBe(1);
    expect(countered).toBe(1);
    expect(left).toBe(1);
  });
});

describe("overlay mount", () => {
  let stop = () => {};

  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    document.documentElement.removeAttribute("data-ofjo-sidebar");
    document.documentElement.removeAttribute("data-ofjo-control");
  });

  afterEach(() => {
    stop();
    stop = () => {};
  });

  it("shows the scraped troops, hides only the replaced zones, and forwards an attack click", async () => {
    mountFixture();
    const attack = document.querySelector("player-info-overlay button");
    if (!(attack instanceof HTMLButtonElement))
      throw new Error("missing attack");
    let attacked = 0;
    attack.addEventListener("click", () => {
      attacked += 1;
    });

    stop = startOverlay(document);
    const host = document.getElementById("ofjo-overlay");
    if (!(host instanceof HTMLElement)) throw new Error("missing overlay");
    expect(host.style.pointerEvents).toBe("none");
    expect(Number(host.style.zIndex)).toBeGreaterThan(10020);
    expect(host.querySelector(".ofjo-sidebar")?.textContent).toContain("4.89K");
    expect(host.querySelector(".ofjo-control")?.textContent).toContain("6.40K");
    expect(host.querySelector(".ofjo-control")?.textContent).toContain(
      "You're near your army limit! Consider sending troops to teammates.",
    );
    expect(document.documentElement.getAttribute("data-ofjo-sidebar")).toBe(
      "1",
    );
    expect(document.documentElement.getAttribute("data-ofjo-control")).toBe(
      "1",
    );
    expect(
      host.querySelector("player-panel, game-left-sidebar, control-panel"),
    ).toBeNull();

    host
      .querySelector<HTMLButtonElement>("[data-ofjo-action='attack']")
      ?.click();
    expect(attacked).toBe(1);

    const cell = document.querySelector(
      ".stats-table-pinned-row .stats-table-cell:nth-child(5) span",
    );
    if (!(cell instanceof HTMLElement)) throw new Error("missing troop cell");
    cell.textContent = "5.10K";
    await Promise.resolve();
    await Promise.resolve();
    expect(host.querySelector(".ofjo-sidebar")?.textContent).toContain("5.10K");

    const stats = document.querySelector("player-stats");
    stats?.classList.add("hidden");
    await Promise.resolve();
    await Promise.resolve();
    expect(document.documentElement.hasAttribute("data-ofjo-sidebar")).toBe(
      false,
    );
    expect(host.querySelector(".ofjo-sidebar")).toBeNull();
    expect(document.documentElement.getAttribute("data-ofjo-control")).toBe(
      "1",
    );
  });

  it("hides, scales, and moves a panel from the settings tool", () => {
    mountFixture();
    stop = startOverlay(document);
    const host = document.getElementById("ofjo-overlay");
    if (!(host instanceof HTMLElement)) throw new Error("missing overlay");

    host
      .querySelector<HTMLButtonElement>(
        "[data-ofjo-tool='sidebar'] [data-ofjo-act='visible']",
      )
      ?.click();
    expect(host.querySelector(".ofjo-sidebar")).toBeNull();
    expect(document.documentElement.hasAttribute("data-ofjo-sidebar")).toBe(
      false,
    );
    expect(document.documentElement.getAttribute("data-ofjo-control")).toBe(
      "1",
    );

    host
      .querySelector<HTMLButtonElement>(
        "[data-ofjo-tool='sidebar'] [data-ofjo-act='visible']",
      )
      ?.click();
    expect(host.querySelector(".ofjo-sidebar")).not.toBeNull();

    const buttons = host.querySelectorAll("[data-ofjo-tool='control'] button");
    const grow = [...buttons].find((button) => button.textContent === "+");
    if (!(grow instanceof HTMLButtonElement)) throw new Error("missing scale");
    grow.click();
    expect(host.querySelector<HTMLElement>(".ofjo-control")?.style.scale).toBe(
      "1.1",
    );

    const grip = host.querySelector(".ofjo-sidebar .ofjo-drag");
    if (!(grip instanceof HTMLElement)) throw new Error("missing grip");
    grip.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 0,
        clientY: 0,
        bubbles: true,
      }),
    );
    grip.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 30,
        clientY: 40,
        bubbles: true,
      }),
    );
    grip.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    expect(host.querySelector<HTMLElement>(".ofjo-sidebar")?.style.left).toBe(
      "30px",
    );
    expect(host.querySelector<HTMLElement>(".ofjo-sidebar")?.style.top).toBe(
      "40px",
    );
  });

  it("leaves the official panels in place when the page has no game data", () => {
    document.body.innerHTML =
      "<control-panel><div class='pointer-events-auto hidden'></div></control-panel>";
    stop = startOverlay(document);
    expect(document.documentElement.hasAttribute("data-ofjo-control")).toBe(
      false,
    );
    expect(document.documentElement.hasAttribute("data-ofjo-sidebar")).toBe(
      false,
    );
    expect(document.querySelector(".ofjo-control")).toBeNull();
    expect(document.querySelector(".ofjo-sidebar")).toBeNull();
  });
});

describe("overlay source", () => {
  it("does not touch the connection, the worker, or the Steam shell", () => {
    const directory = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../overlay/src",
    );
    const files = [
      "selectors.ts",
      "snapshot.ts",
      "read.ts",
      "actions.ts",
      "panels.ts",
      "mount.ts",
      "content.ts",
      "layout.ts",
      "icons.ts",
    ];
    const banned = [
      "gitCommit",
      "openfrontDesktop",
      "WebSocket",
      "GameView",
      "app://openfront",
      "@openfront/",
    ];
    for (const file of files) {
      const source = readFileSync(path.join(directory, file), "utf8");
      for (const token of banned) {
        expect(source, file).not.toContain(token);
      }
    }
    const shellDir = path.join(directory, "../shell");
    for (const file of ["main.mjs", "preload.mjs"]) {
      const source = readFileSync(path.join(shellDir, file), "utf8");
      for (const token of banned) {
        expect(source, file).not.toContain(token);
      }
    }
  });
});
