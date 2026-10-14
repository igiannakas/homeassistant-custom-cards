/*
 * Air quality card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Every room's air in one card: a label row that sums up the house under its title, and
 * a tile per room with its status (Excellent / Elevated / Poor / Ventilate) and its key
 * readings – CO₂, VOC and every PM size always, plus whatever else is causing trouble.
 * Readings that are out of range take their level's colour; a room that needs a
 * window opened glows red. Tap a reading for its own sensor, anywhere else on a room
 * for its own air-quality dashboard.
 * See cards/air-quality-card/README.md for every option.
 */

const AQC_VERSION = "1.2.0";
const AQC_TAG = "air-quality-card";

const C = {
  green: "var(--green-color, #4caf50)",
  amber: "var(--amber-color, #ffc107)",
  orange: "var(--orange-color, #ff9800)",
  red: "var(--red-color, #f44336)",
  grey: "var(--grey-color, #9e9e9e)",
};
// The words differ by level, not just the colour: Poor (orange, the step before red) and
// Ventilate (red, a call for attention: open a window), whatever the cause.
const TIERS = [
  { color: C.green, icon: "mdi:leaf", word: "Excellent" },
  { color: C.amber, icon: "mdi:information-outline", word: "Elevated" },
  { color: C.orange, icon: "mdi:alert-outline", word: "Poor" },
  { color: C.red, icon: "mdi:window-open-variant", word: "Ventilate" },
];
// Readable text versions of the tier colours (amber text on white is too faint).
const TEXT = [
  "color-mix(in srgb, var(--green-color, #4caf50) 75%, var(--primary-text-color))",
  "color-mix(in srgb, var(--amber-color, #ffc107) 70%, var(--primary-text-color))",
  "color-mix(in srgb, var(--orange-color, #ff9800) 80%, var(--primary-text-color))",
  "color-mix(in srgb, var(--red-color, #f44336) 85%, var(--primary-text-color))",
];

/*
 * Pollutants: sensor suffix (with `prefix`), default thresholds [elevated, poor, ventilate]
 * (null = that level is skipped), label, icon, decimals, unit, and whether it is always shown.
 */
const POLLUTANTS = {
  co2: { suffix: "co2", t: [800, null, 1000], label: "CO₂", digits: 0, unit: "ppm", always: true },
  voc: { suffix: "voc_index", t: [150, 250, 400], label: "VOC", digits: 0, always: true },
  // Particles: always shown, each with its size class as the label, on a line of their own.
  pm1: { suffix: "pm1", t: [12, null, 36], label: "PM1", digits: 1, unit: "µg/m³", always: true, pm: true },
  pm2_5: { suffix: "pm2_5", t: [12, null, 36], label: "PM2.5", digits: 1, unit: "µg/m³", always: true, pm: true },
  pm4: { suffix: "pm4", t: [17, null, 51], label: "PM4", digits: 1, unit: "µg/m³", always: true, pm: true },
  pm10: { suffix: "pm10", t: [17, null, 51], label: "PM10", digits: 1, unit: "µg/m³", always: true, pm: true },
  nox: { suffix: "nox_index", t: [20, 150, 300], label: "NOx", digits: 0 },
};
const ORDER = ["co2", "voc", "nox", "pm1", "pm2_5", "pm4", "pm10"];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n, d = 0) => (n === null ? "–" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

function level(value, t) {
  if (value === null) return 0;
  if (t[2] !== null && t[2] !== undefined && value >= t[2]) return 3;
  if (t[1] !== null && t[1] !== undefined && value >= t[1]) return 2;
  if (t[0] !== null && t[0] !== undefined && value >= t[0]) return 1;
  return 0;
}

/* Everything one tile shows. */
function roomModel(hass, room, thresholds = {}) {
  const readings = [];
  for (const key of ORDER) {
    const p = POLLUTANTS[key];
    const id = room[key] || (room.prefix ? `${room.prefix}${p.suffix}` : null);
    if (!id || !hass.states[id]) continue;
    const value = num(hass.states[id].state);
    readings.push({ key, id, value, level: level(value, thresholds[key] || p.t), ...p });
  }
  const worst = readings.reduce((m, r) => Math.max(m, r.level), 0);
  const tier = { ...TIERS[worst] };
  // Always CO₂, VOC and every PM size; NOx only while it is the cause.
  const shown = readings.filter((r) => r.always || (worst > 0 && r.level === worst));
  return { name: room.name || "Room", worst, tier, readings: shown, missing: !readings.length };
}

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  ha-card { padding: 10px; }
  /* Spacing follows Mushroom: everything inside the card starts 10px from its edge (card padding).
     Two-line label row, the same on every card: a 24px icon in a 36px slot (where the glyph of a
     36px Mushroom icon sits; it shows the house's level, so it takes that colour, and it isn't
     tappable, so no circle), the 14px / 500 title at edge + 46 and the summary under it on the
     same vertical line (ink-aligned, free to wrap). */
  .label { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 0 8px; }
  .slot { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
  .slot ha-icon { --mdc-icon-size: 24px; }
  .lt { flex: 1; min-width: 0; }
  .t { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .lt.one .t { position: relative; top: 1px; } /* alone, a 20px line reads ~1px high next to the icon */
  .s { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .s:empty { display: none; }
  /* The summary wraps only between its parts: a room name never splits. */
  .s .p { white-space: nowrap; }
  /* Room tiles. Every name stays whole: the columns are fitted to the measured names and readings
     (_fit) – even columns as wide as the widest tile needs while two or more fit (up to the
     columns option), else two columns each as wide as its own widest, else one. Without a measurement
     (hidden card) a name wraps rather than being cut. */
  .rooms { display: grid; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 8px;
    container: rooms / inline-size; }
  .room { all: unset; box-sizing: border-box; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 11px 10px;
    min-height: 58px; border-radius: 10px; cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
    -webkit-tap-highlight-color: transparent; transition: background-color 180ms; }
  /* A room that needs a window opened glows red, like a lit room glows on the lights card. */
  .room.alarm { background: ${tint(C.red, 10)}; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    transition: background-color 180ms; }
  .shape ha-icon { --mdc-icon-size: 24px; transition: color 180ms; }
  .txt { flex: 1; min-width: 0; }
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .rooms.measure .nm { white-space: nowrap; width: max-content; }
  .m { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  /* Status, CO₂ and VOC: wrap between readings, never inside one. */
  .row { display: flex; flex-wrap: wrap; column-gap: 7px; }
  /* Particle sizes as a tidy grid: four across when they fit, else 2×2 (PM1 PM2.5 / PM4 PM10),
     else one per line – set from the measured readings (_fit); one per line until then. */
  .row.pm { display: grid; grid-template-columns: max-content; justify-items: start; column-gap: 10px; }
  /* Particle size class as a small label in front of each PM value. */
  /* Labels and units are the same size as the values, only lighter. Every reading keeps its unit. */
  .k { margin-right: 3px; color: color-mix(in srgb, var(--secondary-text-color) 70%, transparent); }
  .v.hot .k { color: inherit; }
  /* One type style for the whole block: same size and weight; colour alone marks a problem. */
  .st { white-space: nowrap; }
  /* Each reading is its own tap target (more-info of its sensor); the rest of the tile navigates. */
  .v { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; cursor: pointer; border-radius: 4px; }
  .v ha-icon { --mdc-icon-size: 14px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .v small { font-size: inherit; color: color-mix(in srgb, var(--secondary-text-color) 70%, transparent); }
  .v.hot small { color: inherit; }
  .room:active, .v:active { filter: brightness(.92); }
  /* Pressing a reading darkens the reading, not the whole tile. */
  .room:has(.v:active) { filter: none; }
  .room:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Phone width: 8px tile sides (the shape–text gap stays 10px). Column count, PM grid and text
     size are not shrunk to fit – _fit gives a tile the width its names and readings need. */
  @container rooms (max-width: 400px) { .room { padding: 11px 8px; } }
`;

/* Ink alignment (design rule): every line of a text block starts on the title's vertical line,
   measured on ink rather than boxes. A reading icon's glyph has its own side bearing inside its
   box (the thermometer 4px, the water drop 3.5px) and so does a leading "1"; each gets the
   margin that puts its ink under the title's first letter. The margin depends only on the glyph,
   not on where it sits, so it holds when a line wraps. */
const INK = { ctx: undefined, units: new Map() };
const inkCtx = () => {
  if (INK.ctx === undefined)
    INK.ctx = /jsdom/i.test(navigator.userAgent) ? null : document.createElement("canvas").getContext("2d");
  return INK.ctx;
};
const inkVisible = (el) => !el.hidden && getComputedStyle(el).display !== "none";
// The first thing drawn in el: a text node or an ha-icon.
function inkLead(el) {
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      if (n.textContent.trim()) return { text: n };
    } else if (n.nodeType === 1 && inkVisible(n)) {
      if (n.localName === "ha-icon") return { icon: n };
      const r = inkLead(n);
      if (r) return r;
    }
  }
  return null;
}
// Left side bearing (px) of a text node's first character, in its own font.
function inkText(node) {
  const ctx = inkCtx();
  if (!ctx) return null;
  const cs = getComputedStyle(node.parentElement);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return -ctx.measureText(node.textContent.trim()[0]).actualBoundingBoxLeft;
}
// Left side bearing (px) of an icon's glyph; null until the icon has loaded.
function inkIcon(hi) {
  const svg = hi.shadowRoot?.querySelector("ha-svg-icon")?.shadowRoot?.querySelector("svg");
  if (!svg) return null;
  const name = hi.getAttribute("icon") || "";
  let u = INK.units.get(name);
  if (u === undefined) {
    let b;
    try {
      b = (svg.querySelector("g") || svg).getBBox();
    } catch (e) {
      return null;
    }
    if (!b.width) return null;
    u = b.x / (svg.viewBox?.baseVal?.width || 24);
    if (name) INK.units.set(name, u);
  }
  return u * (parseFloat(getComputedStyle(svg).width) || 0);
}
const inkSet = (el, px) => {
  const v = Math.abs(px) > 0.2 ? `${px.toFixed(2)}px` : "";
  if (el.style.marginLeft !== v) el.style.marginLeft = v;
};
// Align every block (title line first, then its lines); false while an icon is still loading.
function inkAlign(blocks) {
  let done = true;
  for (const b of blocks) {
    const lines = [...b.children].filter(inkVisible);
    const t = lines.length > 1 ? inkLead(lines[0]) : null;
    if (!t || !t.text) continue;
    const ref = inkText(t.text);
    if (ref === null) return true; // no canvas (tests): leave the layout alone
    for (const line of lines.slice(1)) {
      for (const hi of line.querySelectorAll(".v > ha-icon")) {
        const l = inkIcon(hi);
        if (l === null) done = false;
        else inkSet(hi, ref - l);
      }
      const lead = inkLead(line);
      if (lead && lead.text) inkSet(line, ref - inkText(lead.text));
    }
  }
  return done;
}
// Re-align after a render, once per frame; retries while icons load, then calls after().
function inkSchedule(host, selector, after) {
  if (host._inkQueued) return;
  host._inkQueued = true;
  requestAnimationFrame(() => {
    host._inkQueued = false;
    const root = host.shadowRoot;
    if (!root) return;
    const done = inkAlign(root.querySelectorAll(selector));
    if (after) after();
    host._inkTries = done ? 0 : (host._inkTries || 0) + 1;
    if (!done && host._inkTries < 20) setTimeout(() => inkSchedule(host, selector, after), 150);
  });
}

class AirQualityCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Air quality", rooms: [] };
  }

  static getConfigForm() {
    const sensor = { entity: { domain: "sensor" } };
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "title", selector: { text: {} } },
          { name: "columns", selector: { number: { min: 1, max: 4, mode: "box" } } },
        ] },
        { name: "rooms", selector: { object: {
          multiple: true,
          label_field: "name",
          description_field: "prefix",
          fields: {
            name: { label: "Name", required: true, selector: { text: {} } },
            prefix: { label: "Sensor prefix (e.g. sensor.study_air_quality_)", selector: { text: {} } },
            navigation_path: { label: "Tap goes to", selector: { navigation: {} } },
            co2: { label: "CO₂ (if not found by the prefix)", selector: sensor },
            pm2_5: { label: "PM2.5", selector: sensor },
            voc: { label: "VOC index", selector: sensor },
            pm1: { label: "PM1", selector: sensor },
            pm4: { label: "PM4", selector: sensor },
            pm10: { label: "PM10", selector: sensor },
            nox: { label: "NOx index", selector: sensor },
          },
        } } },
        { name: "thresholds", selector: { object: {} } },
      ],
      computeLabel: (s) =>
        ({ title: "Title", columns: "Tiles per row (at most)", rooms: "Rooms", thresholds: "Thresholds (YAML)" })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          columns: "Default 2. Fewer when a room name or reading wouldn't fit.",
          rooms: "With a prefix, the card finds <prefix>co2, pm1, pm2_5, pm4, pm10, voc_index and nox_index by itself.",
          thresholds: "Per pollutant: [elevated, poor, ventilate]; null skips a level. E.g. co2: [800, null, 1000]",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.rooms)) throw new Error("Add a list of rooms");
    this._config = { ...config, rooms: config.rooms.filter(Boolean) };
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 1 + Math.ceil((this._config?.rooms?.length || 0) / 2) * 1.5;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    this._observe();
  }

  disconnectedCallback() {
    this._ro?.disconnect();
  }

  /* Re-fit the tiles whenever the card's width changes (rotation, sidebar, column count). */
  _observe() {
    const grid = this.shadowRoot?.querySelector(".rooms");
    if (!grid || typeof ResizeObserver === "undefined") return;
    this._ro = this._ro || new ResizeObserver(() => this._fit());
    this._ro.disconnect();
    this._ro.observe(grid);
  }

  _cols() {
    return Math.max(1, Math.min(4, Number(this._config.columns) || 2));
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const c = this._config;
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="label"><div class="slot"><ha-icon icon="mdi:leaf"></ha-icon></div>
        <div class="lt"><div class="t">${esc(c.title ?? "Air quality")}</div><div class="s"></div></div></div>
      <div class="rooms" style="--cols:${this._cols()}">
        ${c.rooms
          .map((r, i) => `<button class="room" data-i="${i}"><span class="shape"><ha-icon></ha-icon></span>
            <span class="txt"><div class="nm"></div><div class="m"></div></span></button>`)
          .join("")}
      </div></ha-card>`;
    root.querySelectorAll(".room").forEach((b) =>
      b.addEventListener("click", (e) => {
        // A reading opens its own sensor, and only that; anywhere else on the tile opens the room.
        const v = e.target.closest?.("[data-e]");
        if (v) {
          e.stopPropagation();
          return this._fire("hass-more-info", { entityId: v.dataset.e });
        }
        const room = c.rooms[Number(b.dataset.i)];
        if (room.navigation_path) {
          history.pushState(null, "", room.navigation_path);
          this._fire("location-changed", { replace: false });
        } else {
          const id = room.co2 || (room.prefix ? `${room.prefix}co2` : null);
          if (id) this._fire("hass-more-info", { entityId: id });
        }
      }),
    );
    this._built = true;
    this._refit = true;
    this._observe();
    this.ownerDocument.fonts?.ready?.then(() => this._fit());
  }

  _render() {
    // Ink-align the tiles and the label row, then re-fit if a name or reading changed.
    inkSchedule(this, ".txt, .lt", () => {
      if (!this._refit) return;
      this._refit = false;
      this._fit();
    });
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const models = this._config.rooms.map((r) => roomModel(this._hass, r, this._config.thresholds));

    models.forEach((m, i) => {
      const el = root.querySelectorAll(".room")[i];
      el.classList.toggle("alarm", m.worst === 3);
      const shape = el.querySelector(".shape");
      shape.style.backgroundColor = tint(m.tier.color, 20);
      const icon = shape.querySelector("ha-icon");
      if (icon.getAttribute("icon") !== m.tier.icon) icon.setAttribute("icon", m.tier.icon);
      icon.style.color = m.tier.color;
      const nm = el.querySelector(".nm");
      if (nm.textContent !== m.name) {
        nm.textContent = m.name;
        this._refit = true;
      }
      el.setAttribute("aria-label", `${m.name}: ${m.tier.word}`);
      // Only touch the DOM when something changed, so a tap is never lost mid-update.
      // Every reading keeps its unit (ppm, µg/m³) and is a tap target for its own sensor.
      const one = (r) => {
        const v = fmt(r.value, r.digits);
        const hot = r.level > 0;
        const head = r.icon ? `<ha-icon icon="${r.icon}"${hot ? ` style="color:${TIERS[r.level].color}"` : ""}></ha-icon>` : `<span class="k">${r.label}</span>`;
        return `<span class="v${hot ? " hot" : ""}" data-e="${esc(r.id)}" title="${esc(r.label)}"${hot ? ` style="color:${TEXT[r.level]}"` : ""}>${head}${v}${r.unit ? `<small> ${r.unit}</small>` : ""}</span>`;
      };
      const gases = m.readings.filter((r) => !r.pm).map(one).join("");
      const pms = m.readings.filter((r) => r.pm).map(one).join("");
      const html =
        `<div class="row"><span class="st" style="color:${TEXT[m.worst]}">${m.missing ? "No sensors" : esc(m.tier.word)}</span>${gases}</div>` +
        (pms ? `<div class="row pm">${pms}</div>` : "");
      const mEl = el.querySelector(".m");
      if (mEl.dataset.h !== html) {
        mEl.innerHTML = html;
        mEl.dataset.h = html;
        this._refit = true;
      }
    });

    // The house in a few words, under the title: the rooms at the worst level by name
    // ("Ventilate Living Room", "Poor in Study, Bedroom"), or a count while only elevated.
    // Each room name is an unbreakable part; the line wraps only between them.
    const worst = models.reduce((a, m) => Math.max(a, m.worst), 0);
    let parts = ["All excellent"];
    if (worst >= 2) {
      const lead = worst === 3 ? "Ventilate" : "Poor in";
      parts = models.filter((m) => m.worst === worst).map((m, i) => (i ? m.name : `${lead} ${m.name}`));
    } else if (worst === 1) {
      const n = models.filter((m) => m.worst === 1).length;
      parts = [`${n} ${n === 1 ? "room" : "rooms"} elevated`];
    }
    const sum = parts.map((p) => `<span class="p">${esc(p)}</span>`).join(", ");
    const sumEl = root.querySelector(".s");
    if (sumEl.innerHTML !== sum) sumEl.innerHTML = sum;
    root.querySelector(".lt").classList.toggle("one", !sum);
    // The label icon shows the house's level, so it takes that colour.
    const lab = root.querySelector(".slot ha-icon");
    const lt = TIERS[worst];
    if (lab.getAttribute("icon") !== lt.icon) lab.setAttribute("icon", lt.icon);
    lab.style.color = lt.color;
  }

  /* Fit the tiles to what they hold, so a room name is never cut (design rule: grids of names are
     fitted to the names). A tile needs its sides, the 36px circle and its gap, plus the widest of:
     its name on one line, its widest single reading (readings wrap between each other, never
     inside one) and its particle sizes two across (the tidy 2×2 – without it a narrow tile would
     stack every reading on a line of its own). Even columns as wide as the widest tile while two
     or more fit (at most the columns option); else two columns each as wide as its own widest
     tile; else one, where only a name wider than the card wraps. Then the particles: four across
     when they fit, else 2×2, else one per line. Measures natural widths, so the answer doesn't
     depend on the layout showing; without a layout (hidden card, or no layout engine) nothing is
     measured or changed. */
  _fit() {
    const grid = this.shadowRoot?.querySelector(".rooms");
    const tiles = grid ? [...grid.querySelectorAll(".room")] : [];
    const W = grid?.clientWidth;
    if (!W || !tiles.length) return;
    const w = (el) => el.getBoundingClientRect().width;
    const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
    // Width of a grid of items k across: each column as wide as its widest item, plus the gaps.
    const across = (ws, k, gap) => {
      let total = (k - 1) * gap;
      for (let j = 0; j < k; j++) total += Math.max(0, ...ws.filter((_, i) => i % k === j));
      return total;
    };
    grid.classList.add("measure");
    const needs = tiles.map((t) => {
      const side = px(t, "paddingLeft") + px(t, "paddingRight") + t.querySelector(".shape").offsetWidth + px(t, "columnGap");
      const pm = t.querySelector(".row.pm");
      const pair = pm && pm.children.length > 1 ? across([...pm.children].map(w), 2, px(pm, "columnGap")) : 0;
      return Math.ceil(side + Math.max(pair, w(t.querySelector(".nm")), ...[...t.querySelectorAll(".st, .v")].map(w)));
    });
    grid.classList.remove("measure");
    const gap = px(grid, "columnGap");
    const most = this._cols();
    const widest = Math.max(...needs);
    let n = most;
    while (n > 1 && n * widest + (n - 1) * gap > W + 0.5) n--;
    let cols = `repeat(${n}, minmax(0, 1fr))`;
    if (n === 1 && most > 1 && tiles.length > 1) {
      const col = (k) => Math.max(0, ...needs.filter((_, i) => i % 2 === k));
      if (col(0) + col(1) + gap <= W + 0.5) cols = `minmax(${col(0)}px, 1fr) minmax(${col(1)}px, 1fr)`;
    }
    if (grid.style.gridTemplateColumns !== cols) grid.style.gridTemplateColumns = cols;

    for (const pm of grid.querySelectorAll(".row.pm")) {
      const ws = [...pm.children].map(w);
      const avail = pm.clientWidth;
      const pg = px(pm, "columnGap");
      // Four readings go 4 or 2×2 (never 3 + 1); other counts try every width down to one.
      const tries = ws.length === 4 ? [4, 2] : Array.from({ length: Math.max(0, ws.length - 1) }, (_, i) => ws.length - i);
      const k = tries.find((x) => across(ws, x, pg) <= avail + 0.5) || 1;
      const v = k > 1 ? `repeat(${k}, max-content)` : "";
      if (pm.style.gridTemplateColumns !== v) pm.style.gridTemplateColumns = v;
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

async function registerAirQualityCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(AQC_TAG)) return;
  registry.define(AQC_TAG, AirQualityCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: AQC_TAG,
    name: "Air quality",
    description: "Every room's air quality in one card: status, key readings, and a red glow when a room needs ventilating.",
  });
  console.info(`%c AIR-QUALITY-CARD %c ${AQC_VERSION} `, "background:#4caf50;color:#fff", "");
}

registerAirQualityCard();
