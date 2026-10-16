/*
 * Home Assistant custom cards – https://github.com/igiannakas/homeassistant-custom-cards
 * Built from the cards folder by scripts/build.js – edit the cards, not this file.
 * air-quality-card, appliance-alert-card, appliance-card, climate-modes-card, enclosure-filter-card, energy-summary-card, home-status-card, mmu-lanes-card, printer-status-card, printer-temps-card, robot-vacuum-card, room-lights-card, vacuum-maintenance-card, weather-presence-card
 */

/* ===== air-quality-card 1.3.4 ===== */
(() => {
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

const AQC_VERSION = "1.3.4";
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
  pm1: { suffix: "pm1", t: [12, null, 36], label: "PM1", digits: 1, unit: "", always: true, pm: true },
  pm2_5: { suffix: "pm2_5", t: [12, null, 36], label: "PM2.5", digits: 1, unit: "", always: true, pm: true },
  pm4: { suffix: "pm4", t: [17, null, 51], label: "PM4", digits: 1, unit: "", always: true, pm: true },
  pm10: { suffix: "pm10", t: [17, null, 51], label: "PM10", digits: 1, unit: "", always: true, pm: true },
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
  /* Room tiles: \`columns\` even columns (two by default), on a phone too. A tile is one tap
     target – it opens the room's air quality dashboard, which has every detail. A name too long
     for its tile wraps rather than being cut. */
  .rooms { display: grid; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 8px;
    container: rooms / inline-size; }
  .room { all: unset; box-sizing: border-box; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 11px 10px;
    min-height: 58px; border-radius: 10px; cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
    -webkit-tap-highlight-color: transparent; transition: background-color 180ms; container-type: inline-size; }
  /* A room that needs a window opened glows red, like a lit room glows on the lights card. */
  .room.alarm { background: ${tint(C.red, 10)}; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    transition: background-color 180ms; }
  .shape ha-icon { --mdc-icon-size: 24px; transition: color 180ms; }
  .txt { flex: 1; min-width: 0; }
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .m { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  /* Status, CO₂ and VOC: wrap between readings, never inside one. */
  .row { display: flex; flex-wrap: wrap; column-gap: 7px; }
  /* Particle sizes as a tidy grid: four across when they fit, else 2×2 (PM1 PM2.5 / PM4 PM10),
     else one per line – chosen from the measured readings (_fitPm), so nothing ever runs past the
     tile. PM is always µg/m³, so the values go without the unit. */
  .row.pm { display: grid; grid-template-columns: max-content; justify-items: start; column-gap: 10px; }
  /* Particle size class as a small label in front of each PM value. */
  /* Labels and units are the same size as the values, only lighter. Every reading keeps its unit. */
  .k { margin-right: 3px; color: color-mix(in srgb, var(--secondary-text-color) 70%, transparent); }
  .v.hot .k { color: inherit; }
  /* One type style for the whole block: same size and weight; colour alone marks a problem. */
  .st { white-space: nowrap; }
  .v { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
  .v ha-icon { --mdc-icon-size: 14px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .v small { font-size: inherit; color: color-mix(in srgb, var(--secondary-text-color) 70%, transparent); }
  .v.hot small { color: inherit; }
  .room:active { filter: brightness(.92); }
  .room:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Phone width: 8px tile sides (the shape–text gap stays 10px, so names stay at edge + 46). When
     a room's name, or its CO₂ and VOC, would still need a second line, every tile takes the room
     lights' tight phone spacing – 6px sides, 6px gap – if that keeps it on one: "CO₂ 526 ppm  VOC
     119" is a few px too wide for a 430–440px phone's tile, and one taller tile makes every tile
     taller. Text sizes never change. */
  @container rooms (max-width: 400px) { .room { padding: 11px 8px; } }
  .tight .room { padding: 11px 6px; gap: 6px; }
  /* Status and gases on one line only when all fit; else the status alone, the gases together. */
  .split .row:not(.pm) .st { flex-basis: 100%; }
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
        // The whole tile opens the room's dashboard (every detail is there); without one, CO₂.
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
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this._fit());
      this._ro.observe(root.querySelector(".rooms"));
    }
    this.ownerDocument.fonts?.ready?.then(() => this._fit());
  }

  /* The particle grid per tile: 4 across, else 2×2 (never 3 + 1), else one per line – from the
     readings' natural widths against the space the tile has. Without a layout nothing changes. */
  /* Fit the tiles to what they hold, the same for every tile (equal rows), read from where the
     text actually lands – not from adding up rounded widths, which missed a VOC 0.4px too wide:
     - the status and the gases share a line only when every tile's fit on one; otherwise the
       status gets its own line and CO₂ and VOC the next ("Excellent" / "CO₂ 526 ppm  VOC 119") –
       never a ragged split with VOC left on its own;
     - the tight phone spacing (6px sides, 6px gap) whenever that puts a wrapped name or CO₂ / VOC
       line back on one line, so no tile – and with equal rows no row – grows a line for a few px;
     - then each particle grid.
     Font sizes never change; a line that doesn't fit even then wraps between readings. */
  _fit() {
    const root = this.shadowRoot;
    const card = root?.querySelector("ha-card");
    if (!card || !card.isConnected) return;
    const rooms = [...root.querySelectorAll(".room")];
    const lines = (els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size;
    const wrapped = (el) => !!el && el.getBoundingClientRect().height > (parseFloat(getComputedStyle(el).lineHeight) || 20) * 1.5;
    const gasesOf = (t) => [...(t.querySelector(".row:not(.pm)")?.children || [])].filter((c) => !c.classList.contains("st"));
    // Tiles where something meant for one line takes two.
    const broken = () => rooms.filter((t) => wrapped(t.querySelector(".nm")) || (gasesOf(t).length > 1 && lines(gasesOf(t)) > 1)).length;
    // Does every tile's status and gases fit on one line?
    const shared = () => rooms.every((t) => {
      const row = t.querySelector(".row:not(.pm)");
      return !row || lines([...row.children]) === 1;
    });
    card.classList.remove("tight", "split");
    card.classList.toggle("split", !shared());
    const before = broken();
    if (before) {
      card.classList.add("tight");
      if (broken() >= before) card.classList.remove("tight"); // no help: keep the roomy sides
      else if (card.classList.contains("split")) {
        card.classList.remove("split");
        card.classList.toggle("split", !shared());
      }
    }
    this._fitPm();
  }

  _fitPm() {
    for (const pm of this.shadowRoot?.querySelectorAll(".row.pm") || []) {
      const avail = pm.parentElement?.clientWidth;
      if (!avail) continue;
      const ws = [...pm.children].map((c) => c.getBoundingClientRect().width);
      const gap = parseFloat(getComputedStyle(pm).columnGap) || 0;
      const across = (k) => (k - 1) * gap + Array.from({ length: k }, (_, j) => Math.max(0, ...ws.filter((_, i) => i % k === j))).reduce((a, b) => a + b, 0);
      const tries = ws.length === 4 ? [4, 2] : Array.from({ length: Math.max(0, ws.length - 1) }, (_, i) => ws.length - i);
      const k = tries.find((x) => across(x) <= avail + 0.5) || 1;
      const v = k > 1 ? `repeat(${k}, max-content)` : "";
      if (pm.style.gridTemplateColumns !== v) pm.style.gridTemplateColumns = v;
    }
  }

  connectedCallback() {
    if (this._ro) this._ro.observe(this.shadowRoot.querySelector(".rooms"));
  }

  disconnectedCallback() {
    this._ro?.disconnect();
  }

  _render() {
    // Ink-align the tiles and the label row; re-fit the particle grids when a reading changed.
    inkSchedule(this, ".txt, .lt", () => {
      if (!this._pmDirty) return;
      this._pmDirty = false;
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
      if (nm.textContent !== m.name) nm.textContent = m.name;
      el.setAttribute("aria-label", `${m.name}: ${m.tier.word}`);
      // Only touch the DOM when something changed, so a tap is never lost mid-update.
      // CO₂ keeps its unit (ppm); particle sizes are always µg/m³ and go without it.
      const one = (r) => {
        const v = fmt(r.value, r.digits);
        const hot = r.level > 0;
        const head = r.icon ? `<ha-icon icon="${r.icon}"${hot ? ` style="color:${TIERS[r.level].color}"` : ""}></ha-icon>` : `<span class="k">${r.label}</span>`;
        return `<span class="v${hot ? " hot" : ""}" title="${esc(r.label)}"${hot ? ` style="color:${TEXT[r.level]}"` : ""}>${head}${v}${r.unit ? `<small> ${r.unit}</small>` : ""}</span>`;
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
        this._pmDirty = true;
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
    if (sumEl._h !== sum) {
      sumEl.innerHTML = sum;
      sumEl._h = sum;
    }
    root.querySelector(".lt").classList.toggle("one", !sum);
    // The label icon shows the house's level, so it takes that colour.
    const lab = root.querySelector(".slot ha-icon");
    const lt = TIERS[worst];
    if (lab.getAttribute("icon") !== lt.icon) lab.setAttribute("icon", lt.icon);
    lab.style.color = lt.color;
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
})();

/* ===== appliance-alert-card 1.3.1 ===== */
(() => {
/*
 * Appliance alert card – an appliance that needs you (a water tank to empty), at the top of its page.
 *
 *   type: custom:appliance-alert-card
 *   entity: input_boolean.clothes_dryer_tank_alert
 *   since: input_datetime.clothes_dryer_tank_full_since
 *   message: Water tank full, please empty
 *
 * The card shows only while `entity` is on, and takes no room otherwise: it hides itself the way
 * Home Assistant's conditional cards do, so the section closes up around it (in the dashboard
 * editor it stays visible, as a preview). An automation turns the entity on when the appliance
 * stops with its plug on, and off again the next time the appliance runs.
 *
 * One row, on one centre line: the glyph (red, a call for attention; decorative, so no circle),
 * the message with "Stopped at 20:34" under it (from `since`, ink-aligned with the message), and
 * the Clear pill, which turns the entity off at once (clearing an alert is benign, so no
 * dialog). Only the glyph and the stop time are red; the card keeps the theme's own background.
 * The pill stays beside the message while both fit on one line and moves to a full-width row of
 * its own when they don't (measured, not a breakpoint).
 */

const AAC_VERSION = "1.3.1";
const AAC_TAG = "appliance-alert-card";

const C = {
  teal: "var(--teal-color, #009688)",
  red: "var(--red-color, #f44336)",
};
const tx =(c, p = 70) => `color-mix(in srgb, ${c} ${p}%, var(--primary-text-color))`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LIVE = (s) => s && s !== "unavailable" && s !== "unknown";
const DEFAULT_MESSAGE = "Water tank full, please empty";
const DEFAULT_ICON = "mdi:water-alert";
const DEFAULT_CLEAR = "Clear";

/* Clock parts of a moment in a time zone (undefined = the browser's). */
function zoned(ms, tz) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)))
    parts[p.type] = p.value;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hm: `${parts.hour}:${parts.minute}` };
}

/* "at 20:34" today, "at Thu 20:34" within the week, "on 4 Oct" before that (as the appliance card). */
function when(ms, now, tz) {
  const a = zoned(ms, tz);
  if (a.day === zoned(now, tz).day) return `at ${a.hm}`;
  const days = (now - ms) / 864e5;
  if (days < 6.5) return `at ${new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: tz }).format(new Date(ms))} ${a.hm}`;
  return `on ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: tz }).format(new Date(ms))}`;
}

/* The moment a `since` entity holds: an input_datetime's timestamp attribute (its state is local
   time without a zone), else a timestamp sensor's or datetime entity's ISO state. */
function momentOf(s) {
  if (!s || !LIVE(s.state)) return null;
  const ts = Number(s.attributes?.timestamp);
  if (s.attributes?.has_date && Number.isFinite(ts)) return ts * 1000;
  const t = Date.parse(s.state);
  return Number.isFinite(t) && /[zZ]|[+-]\d\d:?\d\d$/.test(s.state) ? t : null;
}

/* The card's whole view: everything the DOM shows, as plain values. */
function model(hass, cfg, now) {
  const s = hass.states[cfg.entity];
  const active = s?.state === "on";
  const tz = hass.locale?.time_zone === "server" ? hass.config?.time_zone : undefined;
  const at = cfg.since ? momentOf(hass.states[cfg.since]) : null;
  return {
    active,
    message: cfg.message || DEFAULT_MESSAGE,
    icon: cfg.icon || DEFAULT_ICON,
    clear: cfg.clear_label || DEFAULT_CLEAR,
    sub: at !== null && at <= now + 60000 ? `Stopped ${when(at, now, tz)}` : "",
    name: s?.attributes?.friendly_name || cfg.entity,
  };
}

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  :host { display: block; }
  :host([hidden]) { display: none; }
  /* A single-block card: content 10px from the sides like Mushroom, 12px top and bottom for air.
     No red highlight on the card: it sits on the theme's card background like its neighbours, and
     the red glyph and red stop time carry the alert. */
  ha-card { padding: 12px 10px; container-type: inline-size; }
  /* One centre line: glyph, text block and pill.
     Mushroom measures its 10px from the card's outer edge (its content overlaps the border), so the
     row moves out by the border width. A negative margin, never calc(10px - border) on the padding:
     themes set --ha-card-border-width to a bare 0 (the home view's does), which makes such a calc
     invalid and the padding drop to 0. Here the same 0 only makes the margin invalid, and a margin's
     fallback, 0, is right for a card without a border. */
  .wrap { display: flex; align-items: center; gap: 10px; margin: 0 calc(-1 * var(--ha-card-border-width, 1px)); }
  .head { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; }
  /* Mushroom-sized slot: a 24px glyph in 36px, so it sits where a Mushroom shape's glyph does and the
     message starts at edge + 46. Decorative (the pill is the only action), so no circle. */
  .slot { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
  .slot ha-icon { --mdc-icon-size: 24px; color: ${C.red}; }
  .txt { flex: 1; min-width: 0; }
  .txt > span { display: block; }
  /* Never cut off: the message wraps. */
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .txt.one .nm { position: relative; top: 1px; } /* alone, a 20px line reads ~1px high next to the glyph */
  .sc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: ${tx(C.red, 85)}; }
  .sc:empty { display: none; }
  /* Primary pill (36px = the icon slot), neutral, its icon teal: you can tap it. */
  .pill { all: unset; box-sizing: border-box; flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; padding: 0 14px 0 10px; border-radius: 18px; cursor: pointer; white-space: nowrap;
    font-size: 13px; font-weight: 600; letter-spacing: .2px; color: var(--primary-text-color);
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); -webkit-tap-highlight-color: transparent; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.teal}; }
  .pill[aria-disabled="true"] { opacity: .45; cursor: default; }
  /* When message and pill don't fit on one line (measured in _fit()), the pill takes a full-width
     row under the message, which then has the whole width. */
  .wrap.stacked { flex-wrap: wrap; row-gap: 8px; }
  .wrap.stacked .head { flex: 1 1 100%; }
  .wrap.stacked .pill { flex: 1 1 100%; }
  .pill:active { filter: brightness(.92); }
  .pill:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

/* Ink alignment (design rule): every line of a text block starts on the title's vertical line,
   measured on ink rather than boxes – a leading "S" or "1" has its own side bearing. */
const INK = { ctx: undefined };
const inkCtx = () => {
  if (INK.ctx === undefined)
    INK.ctx = /jsdom/i.test(navigator.userAgent) ? null : document.createElement("canvas").getContext("2d");
  return INK.ctx;
};
const inkVisible = (el) => !el.hidden && getComputedStyle(el).display !== "none";
function inkLead(el) {
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      if (n.textContent.trim()) return n;
    } else if (n.nodeType === 1 && inkVisible(n)) {
      const r = inkLead(n);
      if (r) return r;
    }
  }
  return null;
}
function inkText(node) {
  const ctx = inkCtx();
  if (!ctx) return null;
  const cs = getComputedStyle(node.parentElement);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return -ctx.measureText(node.textContent.trim()[0]).actualBoundingBoxLeft;
}
function inkAlign(root) {
  for (const b of root.querySelectorAll(".txt")) {
    const lines = [...b.children].filter(inkVisible);
    const t = lines.length > 1 ? inkLead(lines[0]) : null;
    if (!t) continue;
    const ref = inkText(t);
    if (ref === null) return;
    for (const line of lines.slice(1)) {
      const lead = inkLead(line);
      if (!lead) continue;
      const px = ref - inkText(lead);
      const v = Math.abs(px) > 0.2 ? `${px.toFixed(2)}px` : "";
      if (line.style.marginLeft !== v) line.style.marginLeft = v;
    }
  }
}

class ApplianceAlertCard extends HTMLElement {
  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {});
    const alert = ids.find((e) => e.startsWith("input_boolean.") && /alert|full/.test(e)) || ids.find((e) => e.startsWith("input_boolean."));
    return { entity: alert || "input_boolean.example_tank_alert" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: ["input_boolean", "switch"] } } },
        { name: "since", selector: { entity: { domain: ["input_datetime", "sensor", "datetime"] } } },
        { name: "message", selector: { text: {} } },
        { type: "grid", name: "", schema: [
          { name: "icon", selector: { icon: {} } },
          { name: "clear_label", selector: { text: {} } },
        ] },
      ],
      computeLabel: (s) =>
        ({
          entity: "Alert (shown while on)",
          since: "Stopped at",
          message: "Message",
          icon: "Icon",
          clear_label: "Button label",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          entity: "Clear turns it off. Usually an input_boolean that an automation turns on.",
          since: "An input_datetime (or timestamp sensor) with when the appliance stopped.",
          message: `Default: "${DEFAULT_MESSAGE}".`,
          clear_label: `Default: "${DEFAULT_CLEAR}".`,
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.entity) throw new Error("Set entity: the alert to show while on (e.g. input_boolean.clothes_dryer_tank_alert)");
    this._config = { ...config };
    this._built = false;
    this._pending = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  /* Home Assistant sets this in the dashboard editor: the card shows there even while the alert is off. */
  set preview(v) {
    this._preview = !!v;
    this._render();
  }

  get preview() {
    return !!this._preview;
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    // "Stopped at 20:34" becomes "Stopped at Thu 20:34" after midnight.
    clearInterval(this._timer);
    this._timer = setInterval(() => this._render(), 60000);
    this._observe();
    if (this._hass) this._render();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = null;
    this._ro?.disconnect();
  }

  _now() {
    return Date.now();
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="wrap" role="alert">
        <div class="head"><span class="slot"><ha-icon></ha-icon></span><span class="txt"><span class="nm"></span><span class="sc"></span></span></div>
        <button class="pill"><ha-icon icon="mdi:check"></ha-icon><span></span></button>
      </div></ha-card>`;
    root.querySelector(".pill").addEventListener("click", () => this._clear());
    this._built = true;
    this._observe();
    this.ownerDocument.fonts?.ready?.then(() => this._fit());
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const m = model(this._hass, this._config, this._now());
    this._m = m;

    // Shown while the alert is on (and always in the editor). Hidden the way conditional cards
    // are: Home Assistant's card wrapper reads `hidden` and drops the card from the section.
    const show = m.active || this.preview;
    if (this.hidden !== !show) {
      this.hidden = !show;
      this.dispatchEvent(new CustomEvent("card-visibility-changed", { detail: { value: show } }));
    }
    if (!m.active) this._pending = false;

    // Only touch what changed, so a tap is never lost mid-update. Compare with the string last
    // written – innerHTML never serialises back to exactly the same text.
    const set = (sel, v) => {
      const n = root.querySelector(sel);
      if (n && n._h !== v) {
        n.innerHTML = v;
        n._h = v;
      }
    };
    const ic = root.querySelector(".slot ha-icon");
    if (ic.getAttribute("icon") !== m.icon) ic.setAttribute("icon", m.icon);
    set(".nm", esc(m.message));
    // In the editor while the alert is off, the line under the message says when the card shows.
    const sub = m.active ? m.sub : `Shows while ${m.name} is on`;
    set(".sc", esc(sub));
    root.querySelector(".txt").classList.toggle("one", !sub);
    set(".pill span", esc(m.clear));
    const pill = root.querySelector(".pill");
    const off = !m.active || this._pending;
    if (pill.getAttribute("aria-disabled") !== String(off)) pill.setAttribute("aria-disabled", String(off));

    if (!this._inkQueued) {
      this._inkQueued = true;
      requestAnimationFrame(() => {
        this._inkQueued = false;
        if (!this.shadowRoot) return;
        inkAlign(this.shadowRoot);
        this._fit();
      });
    }
  }

  /* Re-check the layout whenever the card's width changes (rotation, sidebar, column count). */
  _observe() {
    const wrap = this.shadowRoot?.querySelector(".wrap");
    if (!wrap || typeof ResizeObserver === "undefined") return;
    this._ro = this._ro || new ResizeObserver(() => this._fit());
    this._ro.disconnect();
    this._ro.observe(wrap);
  }

  /* Does the pill need its own row? Not while the glyph, the message on one line (and the line
     under it) and the pill at its natural width all fit in the row. Natural widths, so the answer
     is the same whichever layout is showing (no flip-flop). */
  static stacks(available, head, gap, pill) {
    return head + gap + pill > available + 0.5;
  }

  _fit() {
    const root = this.shadowRoot;
    const wrap = root?.querySelector(".wrap");
    if (!wrap || !wrap.clientWidth) return; // not laid out (hidden)
    const range = this.ownerDocument.createRange();
    const contentW = (node) => (range.selectNodeContents(node), range.getBoundingClientRect().width);
    const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
    const nm = root.querySelector(".nm");
    nm.style.whiteSpace = "nowrap";
    const text = Math.max(contentW(nm), contentW(root.querySelector(".sc")));
    nm.style.whiteSpace = "";
    const headEl = root.querySelector(".head");
    const head = root.querySelector(".slot").offsetWidth + px(headEl, "columnGap") + text;
    const p = root.querySelector(".pill");
    const pill = contentW(p) + px(p, "paddingLeft") + px(p, "paddingRight");
    wrap.classList.toggle("stacked", ApplianceAlertCard.stacks(wrap.clientWidth, head, px(wrap, "columnGap"), pill));
  }

  /* Clear turns the alert off at once. The pill rests until the state changes or the call fails. */
  async _clear() {
    const m = this._m;
    if (!m?.active || this._pending) return;
    const id = this._config.entity;
    const domain = id.split(".")[0];
    this._pending = true;
    this._render();
    try {
      await this._hass.callService(["input_boolean", "switch"].includes(domain) ? domain : "homeassistant", "turn_off", { entity_id: id });
    } catch (err) {
      this._pending = false;
      this._render();
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || `Couldn't clear ${m.name}.` }, bubbles: true, composed: true }));
    }
  }
}

async function registerApplianceAlertCard() {
  await window.customElements.whenDefined("home-assistant");
  if (window.customElements.get(AAC_TAG)) return;
  window.customElements.define(AAC_TAG, ApplianceAlertCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: AAC_TAG,
    name: "Appliance alert",
    description: "An appliance that needs you (a water tank to empty): shown only while its alert is on, with a Clear button.",
  });
  console.info(`%c APPLIANCE-ALERT-CARD %c ${AAC_VERSION} `, "background:#f44336;color:#fff", "");
}

registerApplianceAlertCard();
})();

/* ===== appliance-card 1.0.3 ===== */
(() => {
/*
 * Appliance card – a plug-powered appliance (dehumidifier, air purifier, dryer…) in one card.
 *
 *   type: custom:appliance-card
 *   entity: switch.dehumidifier
 *   name: Bedroom Dehumidifier
 *   power: sensor.dehumidifier_power
 *   energy: sensor.dehumidifier_energy_today
 *   reading: { entity: sensor.bedroom_air_quality_humidity, name: Humidity }
 *   navigation_path: /lovelace/dehumidifier
 *   schedule:
 *     turn_on:  { automation: automation.dehumidifier_on, above: input_number.dehumidifier_on_above,
 *                 from: input_datetime.dehumidifier_on_from, until: input_datetime.dehumidifier_on_until }
 *     turn_off: { automation: automation.dehumidifier_off, at: input_datetime.dehumidifier_off_at }
 *     presence: input_boolean.home_master
 *
 * Head row: the icon circle (orange while on – power, like a lit room – grey while off),
 * "Name · Running" and, under it, what the automation does next, read from the same helpers the
 * automation uses ("On at 17:30", "Off at 09:00", "On above 62% · from 21:15"), so the card can't
 * disagree with it. At the end, the
 * power pill, as on the printer card: "On | 252 W" (orange) while on, "Off" while off. The left
 * half switches the plug at once, the watts open the power sensor.
 * Below: the reading, how long it has been on (or since when it is off), today's energy and cost,
 * split by straight dividers. Anywhere but the pill opens the appliance's own dashboard.
 */

const AC_VERSION = "1.0.3";
const AC_TAG = "appliance-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  orange: "var(--orange-color, #ff9800)",
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n, d = 0) => (n === null ? "–" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));
const isEntity = (v) => typeof v === "string" && /^[a-z_]+\.\w+$/.test(v);
const LIVE = (s) => s && s !== "unavailable" && s !== "unknown";

/* 45 min, 1 h 23 min, 3 h, 2 d (design rule: a space, short units). */
function dur(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  if (m < 1440) return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
  return `${Math.floor(m / 1440)} d`;
}

/* Clock parts of a moment in a time zone (undefined = the browser's). */
function zoned(ms, tz) {
  const parts = {};
  for (const p of new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)))
    parts[p.type] = p.value;
  return { day: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute), hm: `${parts.hour}:${parts.minute}` };
}

/* "07:00" today, "Tue 18:10" within the week, "4 Oct" before that. */
function since(ms, now, tz) {
  const a = zoned(ms, tz);
  if (a.day === zoned(now, tz).day) return a.hm;
  const days = (now - ms) / 864e5;
  const opts = days < 6.5 ? { weekday: "short" } : { day: "numeric", month: "short" };
  const d = new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: tz }).format(new Date(ms));
  return days < 6.5 ? `${d} ${a.hm}` : d;
}

/* A time helper (input_datetime "21:15:00") or a literal "21:15" → minutes and "21:15". */
function timeOf(hass, v) {
  const raw = isEntity(v) ? hass.states[v]?.state : v;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(raw ?? ""));
  if (!m) return null;
  return { min: Number(m[1]) * 60 + Number(m[2]), hm: `${m[1].padStart(2, "0")}:${m[2]}` };
}

/* A value with its unit: "62%", "21.4°", "612 ppm"; µg/m³ is left out (the label says PM2.5).
   Home Assistant spells it with a Greek mu (μg/m³); some integrations use the micro sign. */
const PER_M3 = (unit) => unit === "μg/m³" || unit === "µg/m³";
function withUnit(v, unit) {
  if (!unit || PER_M3(unit)) return v;
  return unit === "%" || unit.startsWith("°") ? `${v}${unit}` : `${v} ${unit}`;
}

/* Decimals for a reading, by the house formats first – whole numbers for %, ppm, µg/m³ and W
   ("52%", not the sensor's 52.43), one for degrees – else the entity's display precision, else 1. */
function decimals(hass, id, unit) {
  if (unit === "%" || unit === "ppm" || unit === "W" || PER_M3(unit)) return 0;
  if (unit && unit.startsWith("°")) return 1;
  const p = hass.entities?.[id]?.display_precision;
  return typeof p === "number" ? p : unit ? 1 : 0;
}

/* A threshold: an input_number / number / sensor entity, or a plain number; unit from the entity,
   else the reading's. */
function threshold(hass, v, fallbackUnit) {
  const s = isEntity(v) ? hass.states[v] : null;
  const n = num(s ? s.state : v);
  if (n === null) return null;
  const unit = s?.attributes?.unit_of_measurement ?? fallbackUnit;
  return withUnit(fmt(n, Number.isInteger(n) ? 0 : 1), unit);
}

/* Someone home: an input_boolean / binary_sensor on, a person or device tracker at home, a zone with people in it. */
function present(hass, id) {
  const s = hass.states[id]?.state;
  if (!LIVE(s)) return true; // unknown presence never hides the schedule
  if (id.startsWith("zone.")) return Number(s) > 0;
  return s === "on" || s === "home";
}

function kwh(s) {
  const v = num(s?.state);
  if (v === null) return null;
  const u = s.attributes?.unit_of_measurement;
  return u === "Wh" ? v / 1000 : u === "MWh" ? v * 1000 : v;
}

function money(v, currency) {
  if (v === null || !currency) return null;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(v);
  } catch (e) {
    return `${v.toFixed(2)} ${currency}`;
  }
}

/* Costs (design rule): under a pound in pence – "7p", under a penny "0.5p" – and from a pound up
   as money, "£1.23"; the same for cents in euros and dollars. Other currencies always as money. */
const MINOR = { GBP: "p", EUR: "c", USD: "¢" };
function cost(v, currency) {
  if (v === null || v === undefined || !Number.isFinite(v) || !currency) return null;
  const unit = MINOR[currency];
  // Rounded to the penny first, so 99.5p reads £1.00 (never "100p", nor £0.99 from 0.995).
  const q = Math.round(Math.abs(v) * 100);
  if (!unit || q >= 100) return money((v < 0 ? -q : q) / 100, currency);
  const c = v * 100;
  return `${c > 0 && c < 0.95 ? c.toFixed(1) : Math.round(c)}${unit}`;
}

/* The price per kWh: the card's own setting, else the grid price in the Energy settings. */
async function findPrice(hass, cfg) {
  if (isEntity(cfg.price)) return { entity: cfg.price };
  if (num(cfg.price) !== null) return { value: num(cfg.price) };
  try {
    const prefs = await hass.callWS({ type: "energy/get_prefs" });
    const flows = [];
    for (const src of prefs.energy_sources || []) {
      if (src.type !== "grid") continue;
      if (src.stat_energy_from) flows.push(src);
      for (const f of src.flow_from || []) flows.push(f);
    }
    const f = flows[0];
    if (f?.entity_energy_price) return { entity: f.entity_energy_price };
    if (typeof f?.number_energy_price === "number") return { value: f.number_energy_price };
  } catch (e) {
    /* Energy not set up, or no permission: the cost is left out. */
  }
  return null;
}

/*
 * When the current on (or off) run began, from the history. Unavailable and unknown don't break a
 * run (a restart makes the plug unavailable for a moment, and its last_changed would claim it has
 * only just switched), and neither does a flick shorter than a minute (on and straight off again):
 * "Off since 07:00", not "since the 3 seconds at 17:04". The first row is the oldest we have – the
 * state at the window's start, or the oldest the recorder kept – so a run that begins there
 * started at least that long ago (`open`).
 */
const FLICK_MS = 60000;
function runStart(rows, current) {
  // On/off segments, oldest first, with neighbours of the same state merged.
  const seg = [];
  for (const r of rows || []) {
    if (r.s !== "on" && r.s !== "off") continue;
    const t = (r.lc ?? r.lu) * 1000;
    if (!seg.length || seg[seg.length - 1].s !== r.s) seg.push({ s: r.s, t });
  }
  // Drop flicks (any but the current run), then merge again.
  const kept = [];
  seg.forEach((g, i) => {
    const next = seg[i + 1];
    if (next && next.t - g.t < FLICK_MS && i > 0) return;
    if (kept.length && kept[kept.length - 1].s === g.s) return;
    kept.push(g);
  });
  const last = kept[kept.length - 1];
  if (!last || last.s !== current) return null;
  return { t: last.t, open: kept.length === 1 && last === seg[0] };
}

/*
 * The line under the name: what the automation does next, built from the helpers it uses.
 * While on: the turn_off rule ("Off at 09:00"); while off: the turn_on rule ("On at 17:30",
 * "On above 62% · from 21:15", "… · until 06:50" inside the window). "Schedule off" when the
 * rule's automation is switched off; "Paused while away" when it only runs with someone home.
 */
function ruleLine(hass, cfg, isOn, now, tz) {
  const sch = cfg.schedule;
  const rule = sch && (isOn ? sch.turn_off : sch.turn_on);
  if (!rule) return [];
  if (rule.automation && hass.states[rule.automation]?.state !== "on") return ["Schedule off"];
  if (!isOn && sch.presence && !present(hass, sch.presence)) return ["Paused while away"];
  if (rule.text) return String(rule.text).split(" · ");
  const unit = cfg.reading?.entity ? hass.states[cfg.reading.entity]?.attributes?.unit_of_measurement : undefined;
  let head = isOn ? "Off" : "On";
  let any = false;
  const above = rule.above !== undefined ? threshold(hass, rule.above, unit) : null;
  const below = rule.below !== undefined ? threshold(hass, rule.below, unit) : null;
  const at = rule.at ? timeOf(hass, rule.at) : null;
  if (above) (head += ` above ${above}`), (any = true);
  if (below) (head += ` below ${below}`), (any = true);
  if (at) (head += ` at ${at.hm}`), (any = true);
  const parts = [];
  const from = rule.from ? timeOf(hass, rule.from) : null;
  const until = rule.until ? timeOf(hass, rule.until) : null;
  if (from && until) {
    const t = zoned(now, tz).min;
    const inside = from.min <= until.min ? t >= from.min && t < until.min : t >= from.min || t < until.min;
    parts.push(inside ? `until ${until.hm}` : `from ${from.hm}`);
    any = true;
  }
  return any ? [head, ...parts] : [];
}

/* The card's whole view of the appliance: everything the DOM shows, as plain values. */
function model(hass, cfg, now, run, price) {
  const S = hass.states;
  const sw = S[cfg.entity];
  const state = sw?.state;
  const live = LIVE(state);
  const isOn = state === "on";
  const name = cfg.name || sw?.attributes?.friendly_name || cfg.entity;
  const ps = cfg.power ? S[cfg.power] : null;
  const watts = ps && LIVE(ps.state) ? num(ps.state) : null;
  const idleBelow = num(cfg.idle_below) ?? 2;
  const word = !live ? "Unavailable" : !isOn ? "Off" : watts !== null && watts < idleBelow ? "Idle" : cfg.power ? "Running" : "On";
  // Under the browser's or the server's zone, as the user set in their profile.
  const tz = hass.locale?.time_zone === "server" ? hass.config?.time_zone : undefined;
  const serverTz = hass.config?.time_zone;

  const stats = [];
  const r = cfg.reading;
  if (r?.entity) {
    const rs = S[r.entity];
    const unit = rs?.attributes?.unit_of_measurement;
    const v = rs && LIVE(rs.state) ? num(rs.state) : null;
    const label = r.name || { humidity: "Humidity", temperature: "Temperature", pm25: "PM2.5", pm10: "PM10", carbon_dioxide: "CO₂" }[rs?.attributes?.device_class] || rs?.attributes?.friendly_name || r.entity;
    stats.push({ v: v === null ? "–" : withUnit(fmt(v, decimals(hass, r.entity, unit)), unit), l: label });
  }
  if (live) {
    if (!run) stats.push({ v: "–", l: isOn ? "On for" : "Off since" });
    else if (run.open) stats.push({ v: `${Math.max(1, Math.floor((now - run.t) / 864e5))} d+`, l: isOn ? "On for" : "Off for" });
    else if (isOn) stats.push({ v: dur(now - run.t), l: "On for" });
    else stats.push({ v: since(run.t, now, tz), l: "Off since" });
  }
  if (cfg.energy) {
    const k = kwh(S[cfg.energy]);
    stats.push({ v: k === null ? "–" : `${k === 0 ? "0" : fmt(k, k < 10 ? 2 : k < 100 ? 1 : 0)} kWh`, l: "Today" });
    const p = price ? (price.entity ? num(S[price.entity]?.state) : price.value) : null;
    const spent = k !== null && p !== null && p !== undefined ? cost(k * p, hass.config?.currency) : null;
    if (spent) stats.push({ v: spent, l: "Today's cost" });
  }

  return {
    live, isOn, name, word, watts,
    icon: cfg.icon || sw?.attributes?.icon || "mdi:power-plug",
    // The circle shows the state: on is power (orange, as a lit room and the pill), off is grey.
    color: isOn ? C.orange : C.grey,
    rule: live ? ruleLine(hass, cfg, isOn, now, serverTz) : [],
    stats,
  };
}

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  /* Spacing follows Mushroom: content starts 10px from the card edge, the name at edge + 46. */
  ha-card { padding: 10px; container-type: inline-size; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  /* One centre line: circle, text block and pill. */
  .head { display: flex; align-items: center; gap: 10px; }
  /* The circle and the text are one button (the keyboard's way to the dashboard); a tap anywhere
     but the pill goes there too. */
  .open { all: unset; box-sizing: border-box; flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px;
    cursor: pointer; border-radius: 18px; -webkit-tap-highlight-color: transparent; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    transition: background-color 180ms; }
  .shape ha-icon { --mdc-icon-size: 24px; transition: color 180ms; }
  .txt { flex: 1; min-width: 0; }
  .txt > span { display: block; }
  /* Never cut off: the name wraps, and the state word moves to the next line whole, the dot
     staying with the name. */
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .nm .st { font-weight: 400; color: var(--secondary-text-color); white-space: nowrap; }
  .sc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .sc:empty { display: none; }
  .sc .p { white-space: nowrap; }
  /* The power pill, as on the printer card: the plug half switches, the watts open the sensor. */
  .pill { flex: none; display: inline-flex; align-items: stretch; height: 36px; border-radius: 18px;
    font-size: 13px; font-weight: 600; letter-spacing: .2px; white-space: nowrap; cursor: default;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--secondary-text-color); }
  .pill[hidden], .pill button[hidden] { display: none; }
  .pill button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
    -webkit-tap-highlight-color: transparent; }
  .pill .tog { padding: 0 12px 0 10px; }
  .pill .tog:has(+ .w[hidden]) { padding-right: 14px; }
  .pill .w { padding: 0 14px 0 10px; border-left: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  .pill.on { background: ${tint(C.orange, 18)}; color: color-mix(in srgb, ${C.orange} 70%, var(--primary-text-color)); }
  .pill.on ha-icon { color: ${C.orange}; }
  /* Today's numbers, split by straight 1px dividers (as on the printer card). */
  .stats { display: grid; grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr)); margin: 10px 0 0; text-align: center; }
  .stats:empty { display: none; }
  .stats > div { display: grid; align-content: start; min-width: 0; border-left: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  .stats > div:first-child { border-left: none; }
  .stats b { font-size: 14px; line-height: 20px; font-weight: 500; color: var(--primary-text-color); white-space: nowrap; }
  .stats span { font-size: 11px; line-height: 14px; letter-spacing: .4px; color: var(--secondary-text-color); overflow-wrap: break-word; padding: 0 4px; }
  .open:active, .pill button:active, .stats:active { filter: brightness(.92); }
  .open:focus-visible, .pill button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

/* Ink alignment (design rule): every line of a text block starts on the title's vertical line,
   measured on ink rather than boxes – a leading "1" or "O" has its own side bearing. */
const INK = { ctx: undefined };
const inkCtx = () => {
  if (INK.ctx === undefined)
    INK.ctx = /jsdom/i.test(navigator.userAgent) ? null : document.createElement("canvas").getContext("2d");
  return INK.ctx;
};
const inkVisible = (el) => !el.hidden && getComputedStyle(el).display !== "none";
function inkLead(el) {
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      if (n.textContent.trim()) return n;
    } else if (n.nodeType === 1 && inkVisible(n)) {
      const r = inkLead(n);
      if (r) return r;
    }
  }
  return null;
}
function inkText(node) {
  const ctx = inkCtx();
  if (!ctx) return null;
  const cs = getComputedStyle(node.parentElement);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return -ctx.measureText(node.textContent.trim()[0]).actualBoundingBoxLeft;
}
function inkAlign(root) {
  for (const b of root.querySelectorAll(".txt")) {
    const lines = [...b.children].filter(inkVisible);
    const t = lines.length > 1 ? inkLead(lines[0]) : null;
    if (!t) continue;
    const ref = inkText(t);
    if (ref === null) return;
    for (const line of lines.slice(1)) {
      const lead = inkLead(line);
      if (!lead) continue;
      const px = ref - inkText(lead);
      const v = Math.abs(px) > 0.2 ? `${px.toFixed(2)}px` : "";
      if (line.style.marginLeft !== v) line.style.marginLeft = v;
    }
  }
}

class ApplianceCard extends HTMLElement {
  static getStubConfig(hass) {
    const sw = Object.keys(hass?.states || {}).find((e) => e.startsWith("switch."));
    return { entity: sw || "switch.example" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: ["switch", "input_boolean", "fan", "light", "humidifier"] } } },
        { type: "grid", name: "", schema: [
          { name: "name", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ] },
        { type: "grid", name: "", schema: [
          { name: "power", selector: { entity: { domain: "sensor", device_class: "power" } } },
          { name: "energy", selector: { entity: { domain: "sensor", device_class: "energy" } } },
        ] },
        { name: "reading", type: "grid", schema: [
          { name: "entity", selector: { entity: { domain: "sensor" } } },
          { name: "name", selector: { text: {} } },
        ] },
        { type: "grid", name: "", schema: [
          { name: "navigation_path", selector: { navigation: {} } },
          { name: "price", selector: { text: {} } },
        ] },
        { name: "idle_below", selector: { number: { min: 0, max: 100, step: 0.5, mode: "box", unit_of_measurement: "W" } } },
        { name: "schedule", selector: { object: {} } },
      ],
      computeLabel: (s) =>
        ({
          entity: "Plug or switch",
          name: "Name",
          icon: "Icon",
          power: "Power (W)",
          energy: "Energy today (kWh)",
          reading: "Reading",
          navigation_path: "Tap opens",
          price: "Price per kWh (or a sensor)",
          idle_below: "Idle below",
          schedule: "Schedule (YAML)",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          reading: "Shown first in the numbers, e.g. the room's humidity.",
          price: "Leave empty to use the grid price from Settings → Energy.",
          idle_below: "On but drawing less than this shows as Idle (default 2 W).",
          schedule:
            "turn_on / turn_off: { automation, at, above, below, from, until } – the helpers the automation uses; presence: who must be home. See the README.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.entity) throw new Error("Set entity: the appliance's plug or switch (e.g. switch.dehumidifier)");
    this._config = { ...config };
    this._built = false;
    this._price = undefined;
    this._runKey = null;
    this._run = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    // Durations ("On for 45 min") and the rule's window move with the clock.
    clearInterval(this._timer);
    this._timer = setInterval(() => this._render(), 30000);
    if (this._hass) this._render();
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = null;
  }

  _now() {
    return Date.now();
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="head">
        <button class="open"><span class="shape"><ha-icon></ha-icon></span><span class="txt"><span class="nm"></span><span class="sc"></span></span></button>
        <div class="pill"><button class="tog"><ha-icon></ha-icon><span></span></button><button class="w"><span></span></button></div>
      </div>
      <div class="stats"></div></ha-card>`;
    root.querySelector("ha-card").addEventListener("click", (e) => {
      if (!e.target.closest(".pill")) this._open();
    });
    root.querySelector(".tog").addEventListener("click", () => this._toggle());
    root.querySelector(".w").addEventListener("click", () => this._more(this._config.power));
    this._built = true;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    const cfg = this._config;
    const root = this.shadowRoot;
    const now = this._now();
    this._loadRun();
    if (cfg.energy && this._price === undefined) {
      this._price = null;
      findPrice(hass, cfg).then((p) => {
        this._price = p;
        this._render();
      });
    }
    const m = model(hass, cfg, now, this._run, this._price);
    this._m = m;

    // Only touch what changed, so a tap is never lost mid-update. Compare with the string last
    // written – innerHTML never serialises back to exactly the same text.
    const set = (sel, v) => {
      const n = root.querySelector(sel);
      if (n && n._h !== v) {
        n.innerHTML = v;
        n._h = v;
      }
    };
    const shape = root.querySelector(".shape");
    const bg = tint(m.color, 20);
    if (shape.style.background !== bg) shape.style.background = bg;
    const ic = shape.querySelector("ha-icon");
    if (ic.getAttribute("icon") !== m.icon) ic.setAttribute("icon", m.icon);
    if (ic.style.color !== m.color) ic.style.color = m.color;
    set(".nm", `${esc(m.name)}<span class="st">&nbsp;· ${esc(m.word)}</span>`);
    set(".sc", m.rule.map((p, i) => `<span class="p">${esc(p)}${i < m.rule.length - 1 ? "&nbsp;·" : ""}</span>`).join(" "));

    const pill = root.querySelector(".pill");
    pill.hidden = !m.live;
    pill.classList.toggle("on", m.isOn);
    const tog = pill.querySelector(".tog");
    const plugIcon = m.isOn ? "mdi:power-plug" : "mdi:power-plug-off";
    const ti = tog.querySelector("ha-icon");
    if (ti.getAttribute("icon") !== plugIcon) ti.setAttribute("icon", plugIcon);
    set(".tog span", m.isOn ? "On" : "Off");
    tog.setAttribute("aria-pressed", String(m.isOn));
    tog.setAttribute("aria-label", `${m.name} plug`);
    const w = pill.querySelector(".w");
    const showW = m.isOn && m.watts !== null;
    if (w.hidden !== !showW) w.hidden = !showW;
    set(".w span", showW ? `${fmt(m.watts)} W` : "");

    const stats = root.querySelector(".stats");
    stats.style.setProperty("--n", String(m.stats.length || 1));
    set(".stats", m.stats.map((s) => `<div><b>${esc(s.v)}</b><span>${esc(s.l)}</span></div>`).join(""));

    if (!this._inkQueued) {
      this._inkQueued = true;
      requestAnimationFrame(() => {
        this._inkQueued = false;
        if (this.shadowRoot) inkAlign(this.shadowRoot);
      });
    }
  }

  /* Look up when the current on/off run began, once per state change. */
  async _loadRun() {
    const hass = this._hass;
    const id = this._config.entity;
    const s = hass.states[id];
    if (!s || !["on", "off"].includes(s.state) || typeof hass.callWS !== "function") return;
    const key = `${s.state}|${s.last_changed}`;
    if (this._runKey === key) return;
    this._runKey = key;
    this._run = null;
    try {
      const from = this._now() - 10 * 864e5;
      const res = await hass.callWS({
        type: "history/history_during_period", start_time: new Date(from).toISOString(), entity_ids: [id],
        minimal_response: true, no_attributes: true, significant_changes_only: false,
      });
      if (this._runKey !== key) return;
      this._run = runStart(res?.[id], s.state);
    } catch (e) {
      this._run = null; // no history (recorder off, no permission): the cell shows "–"
    }
    this._render();
  }

  _open() {
    const path = this._config.navigation_path;
    if (path) {
      history.pushState(null, "", path);
      this.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false }, bubbles: true, composed: true }));
    } else {
      this._more(this._config.entity);
    }
  }

  _more(id) {
    if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
  }

  /* The plug switches at once, both ways (as the old toggle did). */
  _toggle() {
    const m = this._m;
    if (!m?.live) return;
    const id = this._config.entity;
    const [domain] = id.split(".");
    this._call(domain, m.isOn ? "turn_off" : "turn_on", { entity_id: id }, `turn ${m.name} ${m.isOn ? "off" : "on"}`);
  }

  /* HA's own message when it has one, else "Couldn't <what you tried>." – never an entity id. */
  async _call(domain, service, data, what) {
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || `Couldn't ${what}.` }, bubbles: true, composed: true }));
    }
  }
}

async function registerApplianceCard() {
  await window.customElements.whenDefined("home-assistant");
  if (window.customElements.get(AC_TAG)) return;
  window.customElements.define(AC_TAG, ApplianceCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: AC_TAG,
    name: "Appliance",
    description: "A plug-powered appliance: state, what its automation does next, a power pill, and today's reading, run time, energy and cost.",
  });
  console.info(`%c APPLIANCE-CARD %c ${AC_VERSION} `, "background:#ff9800;color:#fff", "");
}

registerApplianceCard();
})();

/* ===== climate-modes-card 1.4.3 ===== */
(() => {
/*
 * Climate modes card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Whole-house shortcuts in one card: a label row (icon, title, what the rooms are
 * on under the title, or a switch) and a row of mode tiles. A tile glows in its colour
 * while it is the active mode, and the label icon takes that colour (grey when nothing is
 * on). Made for heating presets across several thermostats, and just as happy with any
 * entity + state (e.g. an aircon speed helper). Any tap action can ask first: add
 * `confirmation` and the card shows its own confirm dialog (Bubble Card look, texts may be
 * templates), so no pop-up card is needed. With `status: activity` the label row shows what
 * the heating is doing instead of the mode: which rooms are calling for heat, Idle, or a
 * lock (e.g. summer mode) – and the icon follows. Tile names are never cut: when they don't
 * fit side by side, the tiles wrap into balanced rows.
 * See cards/climate-modes-card/README.md for every option.
 */

const CMC_VERSION = "1.4.3";
const CMC_TAG = "climate-modes-card";

const NAMED = ["red", "pink", "purple", "deep-purple", "indigo", "blue", "light-blue", "cyan", "teal", "green", "light-green",
  "lime", "yellow", "amber", "orange", "deep-orange", "brown", "grey", "blue-grey"];
const FALLBACK = { cyan: "#00bcd4", blue: "#2196f3", purple: "#9c27b0", amber: "#ffc107", red: "#f44336", orange: "#ff9800",
  teal: "#009688", green: "#4caf50", grey: "#9e9e9e", "light-blue": "#03a9f4", indigo: "#3f51b5", "deep-purple": "#673ab7" };
const color = (c) => (!c ? `var(--grey-color, #9e9e9e)` : NAMED.includes(c) ? `var(--${c}-color, ${FALLBACK[c] || "#9e9e9e"})` : c);
const GREY = color("grey");
// Teal = you can tap / pick this (design tokens → Colours): the switch is teal when on unless it
// has a colour of its own, and a tile or switch without a state colour of its own – none, or
// grey (Off, Away) – asks in teal: a filled grey button would read as disabled. (Such a tile
// glows teal when it is the mode – see pickColor.)
const TEAL = color("teal");
// The active tile glows in its mode's colour; a mode without a state colour of its own (none, or
// grey – Off, Away) glows teal instead, as "what you picked", or nothing would show it's active.
const pickColor = (c) => (!c || c === "grey" || c === "gray" ? TEAL : color(c));
const askColor = (m) => {
  const c = m?.color ? color(m.color) : TEAL;
  return c === GREY ? TEAL : c;
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const list = (v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);

const DIALOG_CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); padding: 25px 18px 18px;
    border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .row { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; }
  /* The text sits under the title, starting on its line (8 + 42px glyph + 6px gap). One glyph,
     no subject line: the dialog opens from the card's own tile or switch. */
  .text { margin: 12px 0 0 56px; font-size: 15px; line-height: 21px; color: var(--secondary-text-color); }
  .buttons { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); display: grid; gap: 8px; }
  button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 56px; padding-left: 10px;
    border-radius: 28px; cursor: pointer; font-size: 16px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color); }
  button .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  button .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
  button.confirm { color: #fff; }
  button.confirm .glyph { background: rgba(255,255,255,.2); }
  button.confirm .glyph ha-icon { color: #fff; }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  button:active { filter: brightness(.92); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

/* Render a Home Assistant template once (titles and texts may be templates). */
function renderTemplate(hass, tpl) {
  const t = String(tpl ?? "");
  if (!/\{[{%]/.test(t) || !hass?.connection?.subscribeMessage) return Promise.resolve(t);
  return new Promise((resolve) => {
    let finished = false;
    let unsub;
    const finish = (v) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      Promise.resolve(unsub).then((u) => typeof u === "function" && u()).catch(() => {});
      resolve(String(v ?? ""));
    };
    const timer = setTimeout(() => finish(""), 4000);
    unsub = hass.connection.subscribeMessage((msg) => finish(msg?.result), { type: "render_template", template: t, report_errors: false });
    Promise.resolve(unsub).catch(() => finish(""));
  });
}

/* Confirm dialog in the Bubble Card look, the same layout as every card's: a title row with one
   glyph, the text under the title, then Confirm / Cancel below a rule. In the colour of the
   control that opened it. Resolves true (confirm) or false (cancel). */
function confirmDialog({ title, icon, color: col, text, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("cmc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(col, 20)}"><ha-icon icon="${esc(icon)}" style="color:${col}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        ${text ? `<div class="text">${esc(text)}</div>` : ""}
        <div class="buttons">
          <button class="confirm" style="background:${col}"><span class="glyph"><ha-icon icon="${esc(icon)}"></ha-icon></span>${esc(confirmLabel)}</button>
          <button class="cancel"><span class="glyph"><ha-icon icon="mdi:close"></ha-icon></span>Cancel</button>
        </div></div>`;
    const done = (ok) => {
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      resolve(ok);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        done(false);
      }
    };
    root.querySelector(".backdrop").addEventListener("click", () => done(false));
    root.querySelector(".cancel").addEventListener("click", () => done(false));
    root.querySelector(".confirm").addEventListener("click", () => done(true));
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
    root.querySelector(".confirm").focus();
  });
}

/* What the heating is doing: locked (e.g. summer mode), rooms calling for heat, or idle. The
   text comes in parts (a list inside a part is joined with commas): the line wraps only
   between them. */
function activity(hass, cfg) {
  const lock = cfg.lock;
  if (lock?.entity && hass.states[lock.entity]?.state === "on") {
    // Grey by default: a lock (summer mode) is an off state, not a warning.
    const text = String(lock.text || "Locked");
    return { kind: "locked", parts: text.split(/\s+·\s+/), icon: lock.icon || cfg.icon, color: color(lock.color || "grey") };
  }
  const calling = list(cfg.thermostats).filter((id) => hass.states[id]?.attributes?.hvac_action === "heating");
  if (calling.length) {
    const names = calling.map((id) => cfg.names?.[id] || String(hass.states[id]?.attributes?.friendly_name || id).replace(/\s+thermostat$/i, ""));
    return {
      kind: "heating", parts: ["Heating", names],
      short: ["Heating", `${calling.length} room${calling.length > 1 ? "s" : ""}`],
      icon: cfg.icon, color: color(cfg.icon_color || "orange"),
    };
  }
  return { kind: "idle", parts: ["Idle"], icon: cfg.icon, color: GREY };
}

/* "All rooms · Night" as HTML: each part unbreakable, joined so the dot stays with the part
   before it (design tokens → Status lines). */
const partsHtml = (parts) =>
  parts
    .map((p) => (Array.isArray(p) ? p.map((n) => `<span class="p">${esc(n)}</span>`).join(", ") : `<span class="p">${esc(p)}</span>`))
    .join("&nbsp;· ");

/* Which mode is on? A preset all thermostats share, or a mode's own entity + state. */
/* A flag tile glows on its own, next to the active mode: active: {attribute, state} is on
   when every thermostat's attribute is one of state (e.g. schedule_override_active: false
   → the rooms follow their schedule). */
function flagOn(hass, cfg, m) {
  if (!m.active?.attribute) return false;
  const th = list(cfg.thermostats).map((id) => hass.states[id]).filter(Boolean);
  const want = list(m.active.state).map(String);
  return th.length > 0 && th.every((s) => want.includes(String(s.attributes?.[m.active.attribute])));
}

function activeIndex(hass, cfg) {
  const modes = cfg.modes || [];
  const th = list(cfg.thermostats).map((id) => hass.states[id]).filter(Boolean);
  const presets = th.map((s) => s.attributes?.preset_mode);
  const allSame = presets.length && presets.every((p) => p === presets[0]);
  return modes.findIndex((m) => {
    if (m.active?.attribute) return false; // a flag tile (see flagOn), never "the" mode
    if (m.active?.entity) {
      const s = hass.states[m.active.entity];
      return !!s && list(m.active.state).map(String).includes(String(s.state));
    }
    return m.preset !== undefined && allSame && presets[0] === m.preset;
  });
}

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  ha-card { padding: 10px; }
  /* Spacing follows Mushroom: everything inside the card starts 10px from its edge (card padding).
     Label row: 40px high (room for the 24px switch). The icon is Mushroom-sized (24px) and sits where
     the glyph of a 36px Mushroom icon would, so it lines up with the icons of Mushroom, Tado and
     All lights cards and the title starts where theirs do. Only a tappable icon gets the filled circle. */
  .label { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 0 8px; } /* 10px gap: titles at edge + 46, like Mushroom */
  .label > ha-icon:first-child { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; --mdc-icon-size: 24px; }
  /* header_tap_action: icon, title and status line all open it; the icon keeps a filled circle in
     its own colour – the tap-target convention. The switch keeps its own action. */
  .label .title.tap, .label .status.tap { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .label > ha-icon.tap { width: 36px; border-radius: 50%; cursor: pointer; background: color-mix(in srgb, currentColor 20%, transparent);
    -webkit-tap-highlight-color: transparent; }
  .label > ha-icon.tap:active { filter: brightness(.92); }
  .label > ha-icon.tap:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Card label row: same on every card – a 24px icon in a 36px slot, a 14px / 500 title (like
     Mushroom names) and, under the title, the summary (12px, free to wrap between its parts).
     The icon and the switch are centred on the two lines. */
  .lt { flex: 1; min-width: 0; }
  .title { display: block; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    overflow-wrap: break-word; }
  /* top: 1px – optical centring: alone, a 20px line box sits ~1px high against an icon of the same height. */
  .lt.one .title { position: relative; top: 1px; }
  .status { display: block; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .status:empty { display: none; }
  .status .p { white-space: nowrap; }
  .status.measure { white-space: nowrap; }
  /* Switch after the label; padded so the whole label + switch is an easy tap target. */
  .switch { all: unset; flex: none; margin: -6px -4px -6px 4px; padding: 6px 4px 6px 10px; display: inline-flex; align-items: center; gap: 8px;
    cursor: pointer; border-radius: 16px; font-size: 12px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; -webkit-tap-highlight-color: transparent; }
  /* Label-row switch: 40×24, the same on every card. */
  .sw { flex: none; width: 40px; height: 24px; border-radius: 12px; position: relative; background: var(--disabled-color, #bdbdbd); transition: background-color 160ms; }
  .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .switch.on .sw { background: var(--sw-color); }
  .switch.on .sw::after { transform: translateX(16px); }
  /* Mode tiles: one row, equal widths while every name fits; a longer name takes the width it
     needs. When they don't all fit, the card measures the names and lays the tiles out in even,
     balanced rows (.fit: e.g. 3 + 3 rather than 5 + 1). Names are never cut and never shrink. */
  .modes { display: flex; flex-wrap: wrap; gap: 8px; }
  .modes.fit { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); }
  .mode { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: max-content; display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 11px 10px; border-radius: 10px; cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
    -webkit-tap-highlight-color: transparent; transition: background-color 180ms; }
  .modes.fit .mode { min-width: 0; }
  .shape { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: ${tint(GREY, 20)}; transition: background-color 180ms; }
  .shape ha-icon { --mdc-icon-size: 24px; color: ${GREY}; transition: color 180ms; }
  /* 12px like every other card's second line; the icon carries the tile. A name wraps only if it
     is wider than the whole card on its own. */
  .name { font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .2px; color: var(--primary-text-color);
    white-space: nowrap; text-align: center; }
  .modes.wrap .name { white-space: normal; overflow-wrap: break-word; }
  /* Active tile glow: its colour at 10%, the icon circle at 20%. */
  .mode.on { background: color-mix(in srgb, var(--c) 10%, transparent); }
  .mode.on .shape { background: color-mix(in srgb, var(--c) 20%, transparent); }
  .mode.on .shape ha-icon { color: var(--c); }
  /* Press feedback without moving anything, so taps near the edge still land. */
  .mode:active, .switch:active { filter: brightness(.92); }
  .mode:focus-visible, .switch:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

/* Ink alignment (design rule): the summary under the title starts on the title's vertical line,
   measured on ink rather than boxes (a leading "1" or "A" has its own side bearing). */
const INK = { ctx: undefined };
const inkCtx = () => {
  if (INK.ctx === undefined)
    INK.ctx = /jsdom/i.test(navigator.userAgent) ? null : document.createElement("canvas").getContext("2d");
  return INK.ctx;
};
const inkVisible = (el) => !el.hidden && getComputedStyle(el).display !== "none";
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
function inkText(node) {
  const ctx = inkCtx();
  if (!ctx) return null;
  const cs = getComputedStyle(node.parentElement);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return -ctx.measureText(node.textContent.trim()[0]).actualBoundingBoxLeft;
}
const inkSet = (el, px) => {
  const v = Math.abs(px) > 0.2 ? `${px.toFixed(2)}px` : "";
  if (el.style.marginLeft !== v) el.style.marginLeft = v;
};
function inkAlign(blocks) {
  for (const b of blocks) {
    const lines = [...b.children].filter(inkVisible);
    const t = lines.length > 1 ? inkLead(lines[0]) : null;
    if (!t || !t.text) continue;
    const ref = inkText(t.text);
    if (ref === null) return;
    for (const line of lines.slice(1)) {
      const lead = inkLead(line);
      if (lead && lead.text) inkSet(line, ref - inkText(lead.text));
    }
  }
}
function inkSchedule(host, selector) {
  if (host._inkQueued) return;
  host._inkQueued = true;
  requestAnimationFrame(() => {
    host._inkQueued = false;
    if (host.shadowRoot) inkAlign(host.shadowRoot.querySelectorAll(selector));
  });
}

class ClimateModesCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Heating", icon: "mdi:radiator", thermostats: [], modes: [] };
  }

  static getConfigForm() {
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "title", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ] },
        { name: "icon_color", selector: { ui_color: {} } },
        { name: "thermostats", selector: { entity: { domain: "climate", multiple: true } } },
        { type: "grid", name: "", schema: [
          { name: "switch", selector: { entity: { domain: ["automation", "input_boolean", "switch"] } } },
          { name: "switch_name", selector: { text: {} } },
        ] },
        { name: "switch_tap_action", selector: { ui_action: {} } },
        { name: "header_tap_action", selector: { ui_action: {} } },
        { name: "status", selector: { select: { mode: "dropdown", options: [
          { value: "mode", label: "The active mode (All rooms · Day)" },
          { value: "activity", label: "What the heating is doing (Heating · Study / Idle)" },
        ] } } },
        { name: "lock", selector: { object: {} } },
        { name: "modes", selector: { object: {} } },
      ],
      computeLabel: (s) =>
        ({
          title: "Title",
          icon: "Icon",
          icon_color: "Icon colour (default: the active mode's colour, grey when none)",
          thermostats: "Thermostats (a mode is active when all share its preset)",
          switch: "Switch in the label row (optional)",
          switch_name: "Switch label (default Automatic)",
          switch_tap_action: "Switch tap (default: toggle)",
          header_tap_action: "Header tap – icon, title and status (optional, e.g. open the climate view)",
          status: "Label row shows",
          modes: "Modes",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          modes: "One entry per tile: name, icon, color, preset (or active: {entity, state} / {attribute, state}) and tap_action.",
          switch: "Shown after the title, e.g. summer mode or an automatic-aircon automation. Teal when on unless switch_color is set.",
          switch_tap_action: "Add confirmation: {title, text} in YAML to ask first.",
          lock: "With activity: {entity, text, icon, color} – e.g. summer mode: Summer · heating locked (grey unless color is set).",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.modes)) throw new Error("Add a list of modes");
    this._config = { ...config };
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const c = this._config;
    this._ro?.disconnect();
    this._ro = null;
    this._statusKey = undefined;
    root.innerHTML = `<style>${CSS}</style><ha-card>
      ${c.title || c.icon ? `<div class="label"><ha-icon icon="${esc(c.icon || "mdi:thermostat")}"${this._headerAction() ? ` class="tap" role="button" tabindex="0" aria-label="${esc(c.title || "Open")}"` : ""}></ha-icon>
        <div class="lt"><span class="title">${esc(c.title || "")}</span><span class="status"></span></div>
        ${c.switch ? `<button class="switch" role="switch" style="--sw-color:${c.switch_color ? color(c.switch_color) : TEAL}"><span class="swl"></span><span class="sw"></span></button>` : ""}</div>` : ""}
      <div class="modes">
        ${c.modes
          .map((m, i) => `<button class="mode" data-i="${i}" style="--c:${pickColor(m.color)}" aria-pressed="false">
            <span class="shape"><ha-icon icon="${esc(m.icon || "mdi:thermostat")}"></ha-icon></span><span class="name">${esc(m.name || "")}</span></button>`)
          .join("")}
      </div></ha-card>`;
    root.querySelectorAll(".mode").forEach((b) =>
      b.addEventListener("click", () => {
        const m = c.modes[Number(b.dataset.i)];
        this._tap(m, `switch to ${m.name || "that mode"}`);
      }),
    );
    root.querySelector(".switch")?.addEventListener("click", () => this._toggleSwitch());
    const tapIcon = root.querySelector(".label > ha-icon.tap");
    if (tapIcon) {
      // The header's dialog takes the header icon's colour as it is now (teal while it is grey:
      // then it is just a tap target with no state colour of its own).
      const go = () =>
        this._tap({ name: c.title, icon: tapIcon.getAttribute("icon"), col: this._headColor && this._headColor !== GREY ? this._headColor : TEAL,
          tap_action: this._headerAction() });
      tapIcon.addEventListener("click", go);
      tapIcon.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go()));
      root.querySelectorAll(".label .title, .label .status").forEach((n) => { n.classList.add("tap"); n.addEventListener("click", go); });
    }
    // Names and the status line are measured: again when the card resizes and once the font has loaded.
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => {
        this._fitModes();
        this._fitStatus();
      });
      root.querySelectorAll(".modes, .label").forEach((n) => this._ro.observe(n));
    }
    document.fonts?.ready?.then(() => {
      this._fitModes();
      this._fitStatus();
    });
    this._built = true;
  }

  /* header_tap_action (icon_tap_action is the older name for the same thing). */
  _headerAction() {
    return this._config.header_tap_action || this._config.icon_tap_action;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    inkSchedule(this, ".lt");
    const hass = this._hass;
    const root = this.shadowRoot;
    const c = this._config;
    const active = activeIndex(hass, c);
    root.querySelectorAll(".mode").forEach((b, i) => {
      // A flag (e.g. "on schedule") means nothing while a lock such as summer mode holds the rooms.
      const locked = c.lock?.entity && hass.states[c.lock.entity]?.state === "on";
      const on = i === active || (!locked && flagOn(hass, c, c.modes[i]));
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const status = root.querySelector(".status");
    const ic = root.querySelector(".label > ha-icon");
    if (status && c.status === "activity") {
      // The header says what the heating is doing; the tiles below already show the mode.
      const a = activity(hass, c);
      const icon = a.icon || "mdi:thermostat";
      if (ic.getAttribute("icon") !== icon) ic.setAttribute("icon", icon);
      this._headColor = a.color;
      root.querySelector(".label").dataset.activity = a.kind;
      this._status = a;
    } else if (status) {
      // The active mode, under the title. The icon takes the active mode's colour – grey when
      // nothing is on – unless icon_color fixes it.
      const n = list(c.thermostats).length;
      const parts = !n ? (active >= 0 ? [c.modes[active].name] : [])
        : active >= 0 ? [n > 1 ? "All rooms" : "On", c.modes[active].name] : ["Mixed"];
      this._headColor = c.icon_color ? color(c.icon_color) : active >= 0 ? color(c.modes[active].color) : GREY;
      this._status = { parts: parts.filter(Boolean) };
    }
    // A tappable header icon sits in a tinted circle – the tap signal – and a tap target is never
    // grey: with no state colour of its own (idle, locked, Off) it is teal (design tokens → Colours).
    const shown = ic?.classList.contains("tap") && this._headColor === GREY ? TEAL : this._headColor;
    if (ic && ic.style.color !== shown) ic.style.color = shown;
    this._fitStatus();
    const sw = root.querySelector(".switch");
    if (sw) {
      const s = hass.states[c.switch];
      const on = s?.state === "on";
      sw.classList.toggle("on", on);
      sw.setAttribute("aria-checked", String(on));
      const label = c.switch_name ?? "Automatic";
      if (sw.querySelector(".swl").textContent !== label) sw.querySelector(".swl").textContent = label;
    }
  }

  /* The summary under the title. Room names when they fit on one line, otherwise "Heating · 3
     rooms" (re-checked when the card resizes); either way it wraps only between its parts. */
  _fitStatus() {
    const status = this.shadowRoot?.querySelector(".status");
    const a = this._status;
    if (!status || !a) return;
    const full = partsHtml(a.parts);
    let html = full;
    if (a.short && status.clientWidth) {
      const key = `${full}|${status.clientWidth}`;
      if (key === this._statusKey) html = this._statusHtml;
      else {
        if (status._h !== full) {
          status.innerHTML = full;
          status._h = full;
        }
        status.classList.add("measure");
        if (status.scrollWidth > status.clientWidth) html = partsHtml(a.short);
        status.classList.remove("measure");
        this._statusKey = key;
        this._statusHtml = html;
      }
    }
    if (status._h !== html) {
      status.innerHTML = html;
      status._h = html;
    }
    status.parentElement.classList.toggle("one", !html);
  }

  /* Mode tiles: every name whole, never under 12px. One row while every tile fits (name + 20px
     padding, at least the 36px icon); else even rows as balanced as they can be; and only if a
     single name is wider than the card does it wrap. Without layout (tests), the CSS default
     stays: one flex row that wraps a tile rather than squeezing its name. */
  _fitModes() {
    const box = this.shadowRoot?.querySelector(".modes");
    const W = box?.clientWidth;
    const names = box ? [...box.querySelectorAll(".mode .name")] : [];
    if (!W || !names.length) return;
    box.classList.remove("wrap");
    const need = Math.max(56, ...names.map((n) => Math.ceil(n.scrollWidth) + 20));
    const n = names.length;
    const fit = Math.max(1, Math.floor((W + 8) / (need + 8)));
    const cols = n <= fit ? 0 : Math.ceil(n / Math.ceil(n / fit));
    box.classList.toggle("fit", cols > 0);
    if (cols && box.style.getPropertyValue("--cols") !== String(cols)) box.style.setProperty("--cols", String(cols));
    box.classList.toggle("wrap", need > W);
  }

  /* what: what a failure message says you tried ("Couldn't switch to Night."). */
  async _tap(mode, what = "do that") {
    const a = mode?.tap_action;
    if (!a || a.action === "none") return;
    this._fire("haptic", "light");
    if (a.confirmation && !(await this._confirm(mode, a.confirmation))) return;
    try {
      if (a.action === "navigate") {
        history.pushState(null, "", a.navigation_path);
        this._fire("location-changed", { replace: false });
      } else if (a.action === "more-info") {
        this._fire("hass-more-info", { entityId: a.entity || mode.active?.entity });
      } else if (a.action === "toggle") {
        await this._hass.callService("homeassistant", "toggle", { entity_id: a.entity || mode.active?.entity });
      } else if (a.action === "perform-action" || a.action === "call-service") {
        const [domain, service] = String(a.perform_action || a.service).split(".");
        await this._hass.callService(domain, service, { ...(a.data || a.service_data || {}) }, a.target);
      }
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || `Couldn't ${what}.` });
    }
  }

  /* Ask first. confirmation: true, or {title, icon, text, confirm_label}; every text may be a
     template. Defaults come from the tile (name, icon). The colour is the control's own: the
     tile's colour (teal for a tile without one, or a grey one), the switch's, or the header
     icon's. The older subject is no longer a line of its own: it stands in for the text when
     there is none. */
  async _confirm(mode, conf) {
    if (this._asking) return false;
    this._asking = true;
    try {
      const o = conf === true ? {} : conf || {};
      const [title, icon, subject, text, label] = await Promise.all(
        [o.title, o.icon, o.subject, o.text, o.confirm_label].map((v) => (v ? renderTemplate(this._hass, v) : Promise.resolve(""))),
      );
      const name = title.trim() || mode.name || "Are you sure?";
      return await confirmDialog({
        title: name,
        icon: icon.trim() || mode.icon || "mdi:help-circle-outline",
        color: mode.col || askColor(mode),
        text: text.trim() || subject.trim(),
        confirmLabel: label.trim() || name,
      });
    } finally {
      this._asking = false;
    }
  }

  async _toggleSwitch() {
    const c = this._config;
    const id = c.switch;
    const on = this._hass.states[id]?.state === "on";
    // For messages: the switch's friendly name, never its entity id.
    const name = this._hass.states[id]?.attributes?.friendly_name || c.switch_name || "the switch";
    const what = `turn ${name} ${on ? "off" : "on"}`;
    if (c.switch_tap_action) {
      return this._tap({
        name: c.switch_name ?? "Automatic", color: c.switch_color, icon: c.icon,
        active: { entity: id }, tap_action: c.switch_tap_action,
      }, what);
    }
    this._fire("haptic", "light");
    try {
      await this._hass.callService("homeassistant", on ? "turn_off" : "turn_on", { entity_id: id });
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || `Couldn't ${what}.` });
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

async function registerClimateModesCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(CMC_TAG)) return;
  registry.define(CMC_TAG, ClimateModesCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CMC_TAG,
    name: "Climate modes",
    description: "Whole-house mode tiles (heating presets, aircon speeds…) with the active one highlighted.",
  });
  console.info(`%c CLIMATE-MODES-CARD %c ${CMC_VERSION} `, "background:#ff9800;color:#fff", "");
}

registerClimateModesCard();
})();

/* ===== enclosure-filter-card 1.2.2 ===== */
(() => {
/*
 * Enclosure filter card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A printer enclosure's filter / vent (e.g. a StealthMax): the vent position as a
 * segmented selector (a tap moves the selection at once; it falls back if Home Assistant
 * doesn't confirm), intake and exhaust side by side (temperature, humidity, VOC, VOC with
 * manual calibration), the summary under the title, and any extra readings (e.g. the delta),
 * each with its unit, as a small line. Tap any value for its own more-info.
 * See cards/enclosure-filter-card/README.md for every option.
 */

const EFC_VERSION = "1.2.2";
const EFC_TAG = "enclosure-filter-card";
const PENDING_MS = 45000; // how long a vent move shows before Home Assistant confirms it

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  green: "var(--green-color, #4caf50)",
  amber: "var(--amber-color, #ffc107)",
  orange: "var(--orange-color, #ff9800)",
  red: "var(--red-color, #f44336)",
};
// VOC index tiers (Sensirion), same as the air quality card: [colour, readable text colour].
const VOC = [
  [C.green, "color-mix(in srgb, var(--green-color, #4caf50) 75%, var(--primary-text-color))"],
  [C.amber, "color-mix(in srgb, var(--amber-color, #ffc107) 70%, var(--primary-text-color))"],
  [C.orange, "color-mix(in srgb, var(--orange-color, #ff9800) 80%, var(--primary-text-color))"],
  [C.red, "color-mix(in srgb, var(--red-color, #f44336) 85%, var(--primary-text-color))"],
];
const vocLevel = (v) => (v === null ? 0 : v >= 400 ? 3 : v >= 250 ? 2 : v >= 150 ? 1 : 0);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n, d = 0) => (n === null ? "–" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));

/* A reading with its unit, as the cards write them: "48%", "21.4°" (no C), "612 ppm". */
function withUnit(text, unit) {
  const u = String(unit || "").trim();
  if (!u || text === "–") return text;
  if (u === "%") return `${text}%`;
  if (/^°[CF]?$/.test(u)) return `${text}°`;
  return `${text} ${u}`;
}

/* "0" → Closed, "100" → Open, numbers as they are. */
function optionLabel(o) {
  if (String(o) === "0") return "Closed";
  if (String(o) === "100") return "Open";
  return String(o);
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
     Mushroom icon sits), the 14px / 500 title at edge + 46 and the 12px summary under it on the
     same vertical line (ink-aligned, free to wrap). The icon is decorative: grey, no circle. */
  .label { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 0 8px; }
  .slot { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
  .slot ha-icon { --mdc-icon-size: 24px; color: ${C.grey}; }
  .lt { flex: 1; min-width: 0; }
  .t { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .lt.one .t { position: relative; top: 1px; } /* alone, a 20px line reads ~1px high next to the icon */
  .s { display: block; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .s:empty { display: none; }
  /* Summary parts stay whole; the line wraps only between them. */
  .p { white-space: nowrap; }
  .vent { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; }
  .vl { flex: none; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  /* Segmented selector (32px segments in a 38px track), as on the robot vacuum card. A label too
     long for its segment wraps (the segment grows), never cut; a single word is never split. */
  .seg { flex: 1; min-width: 0; display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); }
  .opt { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: min-content; min-height: 32px; padding: 0 6px; border-radius: 9px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; text-align: center; font-size: 12px; line-height: 16px; font-weight: 500;
    color: var(--secondary-text-color); overflow-wrap: break-word; -webkit-tap-highlight-color: transparent; }
  .opt.on { background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
  .io { display: flex; align-items: stretch; gap: 8px; }
  .side { box-sizing: border-box; flex: 1; min-width: 0; padding: 11px 10px; border-radius: 10px; cursor: pointer;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .04); display: grid; gap: 1px; -webkit-tap-highlight-color: transparent; }
  .vals { display: flex; flex-wrap: wrap; gap: 1px 10px; }
  .h { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .v, .x { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 2px; font-size: 12px; line-height: 16px;
    letter-spacing: .4px; color: var(--secondary-text-color); white-space: nowrap; cursor: pointer; border-radius: 4px;
    -webkit-tap-highlight-color: transparent; }
  /* An extra reading's name may wrap on a narrow card; its value and unit stay together. */
  .x { display: block; white-space: normal; overflow-wrap: break-word; }
  .v:active, .x:active { filter: brightness(.85); }
  .v:focus-visible, .x:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .v ha-icon { --mdc-icon-size: 14px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .arrow { align-self: center; --mdc-icon-size: 20px; color: color-mix(in srgb, var(--secondary-text-color) 45%, transparent); }
  .extra { display: flex; flex-wrap: wrap; gap: 2px 12px; padding: 10px 0 0; }
  .extra:empty { display: none; }
  .opt:active, .side:active { filter: brightness(.92); }
  .opt:focus-visible, .side:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
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

class EnclosureFilterCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Filter", intake: {}, exhaust: {} };
  }

  static getConfigForm() {
    const side = (name, title) => ({
      type: "expandable", name, title, schema: [
        { name: "temperature", selector: { entity: { domain: "sensor" } } },
        { name: "humidity", selector: { entity: { domain: "sensor" } } },
        { name: "voc", selector: { entity: { domain: "sensor" } } },
        { name: "voc_manual", selector: { entity: { domain: "sensor" } } },
      ],
    });
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "vent", selector: { entity: { domain: ["select", "input_select"] } } },
        side("intake", "Intake"),
        side("exhaust", "Exhaust"),
        { name: "details", selector: { object: {} } },
      ],
      computeLabel: (s) =>
        ({ title: "Title", vent: "Vent position (select)", temperature: "Temperature", humidity: "Humidity", voc: "VOC index", voc_manual: "VOC index (manual calibration)", details: "Extra readings (optional)" })[s.name] ?? s.name,
      computeHelper: (s) => ({ details: "List of {entity, name}, shown as one small line." })[s.name],
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Missing configuration");
    this._config = { intake: {}, exhaust: {}, ...config };
    this._built = false;
    this._pending = {};
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  disconnectedCallback() {
    clearTimeout(this._pendTimer);
  }

  /* A vent move shown before Home Assistant confirms it (like the vacuum's floor switch): the
     pressed segment moves at once; the real state takes over once it matches, or after 45 s. */
  _pend(k, v) {
    this._pending[k] = { v, t: Date.now() };
  }
  _shown(k, actual) {
    const p = this._pending[k];
    if (!p) return actual;
    if (p.v === actual || Date.now() - p.t > PENDING_MS) {
      delete this._pending[k];
      return actual;
    }
    return p.v;
  }

  _options() {
    const s = this._hass.states[this._config.vent];
    return (s?.attributes?.options || []).filter((o) => isFinite(Number(o)));
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const opts = this._config.vent ? this._options() : [];
    const side = (k, title) => `<div class="side ${k}" role="button" tabindex="0"><div class="h">${esc(title)}</div><div class="vals"></div></div>`;
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="label"><div class="slot"><ha-icon icon="mdi:air-filter"></ha-icon></div>
        <div class="lt"><div class="t">${esc(this._config.title ?? "Filter")}</div><span class="s"></span></div></div>
      ${opts.length ? `<div class="vent"><span class="vl">Vent</span><div class="seg" role="group" aria-label="Vent">
        ${opts.map((o) => `<button class="opt" data-o="${esc(o)}" aria-pressed="false">${esc(optionLabel(o))}</button>`).join("")}</div></div>` : ""}
      <div class="io">${side("in", this._config.intake_name || "Intake")}<ha-icon class="arrow" icon="mdi:arrow-right-thick"></ha-icon>${side("out", this._config.exhaust_name || "Exhaust")}</div>
      <div class="extra"></div></ha-card>`;
    root.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => this._select(b.dataset.o)));
    // A value opens its own sensor; the rest of a side opens its VOC (or temperature).
    const sideMore = (el) => {
      const c = el.classList.contains("in") ? this._config.intake : this._config.exhaust;
      return c.voc || c.temperature;
    };
    const open = (e) => {
      const v = e.target.closest("[data-e]");
      const sd = e.target.closest(".side");
      this._more(v ? v.dataset.e : sd && sideMore(sd));
    };
    root.querySelector(".io").addEventListener("click", open);
    root.querySelector(".extra").addEventListener("click", open);
    root.querySelector(".io").addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("side")) {
        e.preventDefault();
        open(e);
      }
    });
    this._built = true;
  }

  _side(cfg) {
    const st = (id) => (id ? num(this._hass.states[id]?.state) : undefined);
    const t = st(cfg.temperature);
    const h = st(cfg.humidity);
    const v = st(cfg.voc);
    const vm = st(cfg.voc_manual);
    const parts = [];
    const btn = (id, style, icon, iconStyle, text) =>
      `<button class="v" data-e="${esc(id)}"${style ? ` style="${style}"` : ""}><ha-icon icon="${icon}"${iconStyle ? ` style="${iconStyle}"` : ""}></ha-icon>${text}</button>`;
    if (t !== undefined) parts.push(btn(cfg.temperature, "", "mdi:thermometer", "", t === null ? "–" : `${t.toFixed(1)}°`));
    if (h !== undefined) parts.push(btn(cfg.humidity, "", "mdi:water-percent", "", h === null ? "–" : `${Math.round(h)}%`));
    // A VOC tier colours a known reading only; an unknown one stays the quiet reading grey.
    const voc = (id, val, label) => {
      const [c, tc] = val === null ? ["", ""] : VOC[vocLevel(val)];
      parts.push(btn(id, tc ? `color:${tc}` : "", "mdi:spray", c ? `color:${c}` : "", `${label} ${fmt(val)}`));
    };
    if (v !== undefined) voc(cfg.voc, v, "VOC");
    if (vm !== undefined) voc(cfg.voc_manual, vm, "VOC (manual)");
    return { html: parts.join(""), voc: v };
  }

  _render() {
    inkSchedule(this, ".side, .lt");
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    // Only touch the DOM when something changed, so a tap is never lost mid-update.
    const set = (n, v) => {
      // Compared with what was last written: innerHTML never serialises back to the same string
      // (and ink alignment adds margins), which rewrote the readings on every update.
      if (n && n._h !== v) {
        n.innerHTML = v;
        n._h = v;
      }
    };
    const vent = this._shown("vent", this._hass.states[this._config.vent]?.state);
    if (!this._pending.vent) clearTimeout(this._pendTimer);
    root.querySelectorAll(".opt").forEach((b) => {
      const on = b.dataset.o === vent;
      b.classList.toggle("on", on);
      if (b.getAttribute("aria-pressed") !== String(on)) b.setAttribute("aria-pressed", String(on));
    });
    const a = this._side(this._config.intake);
    const b = this._side(this._config.exhaust);
    set(root.querySelector(".side.in .vals"), a.html);
    set(root.querySelector(".side.out .vals"), b.html);
    // The summary, under the title: each part whole, the line breaking only between parts.
    const sum = [
      vent && !isFinite(Number(vent)) ? `Vent: ${vent}` : "",
      a.voc != null && b.voc != null ? `VOC ${fmt(a.voc)} → ${fmt(b.voc)}` : "",
    ].filter(Boolean).map((p) => `<span class="p">${esc(p)}</span>`).join("&nbsp;· ");
    set(root.querySelector(".s"), sum);
    root.querySelector(".lt").classList.toggle("one", !sum);
    const extra = (this._config.details || [])
      .map((d) => (typeof d === "string" ? { entity: d } : d))
      .filter((d) => this._hass.states[d.entity])
      .map((d) => {
        const st = this._hass.states[d.entity];
        const n = num(st.state);
        const name = d.name || st.attributes.friendly_name || d.entity;
        const value = n === null
          ? (["unknown", "unavailable"].includes(st.state) ? "–" : st.state)
          : withUnit(fmt(n, Math.abs(n) < 100 && n % 1 ? 1 : 0), st.attributes.unit_of_measurement);
        return `<button class="x" data-e="${esc(d.entity)}">${esc(name)} <span class="p">${esc(value)}</span></button>`;
      })
      .join("");
    set(root.querySelector(".extra"), extra);
  }

  /* The pressed segment moves at once; it falls back at once if Home Assistant refuses, else
     when the 45 s are up without the vent's state agreeing. */
  async _select(option) {
    const id = this._config.vent;
    const [domain] = id.split(".");
    this._pend("vent", option);
    this._render();
    clearTimeout(this._pendTimer);
    this._pendTimer = setTimeout(() => this._render(), PENDING_MS + 50);
    try {
      await this._hass.callService(domain === "input_select" ? "input_select" : "select", "select_option", { entity_id: id, option });
    } catch (err) {
      delete this._pending.vent;
      this._render();
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || "Couldn't move the vent." }, bubbles: true, composed: true }));
    }
  }

  _more(entityId) {
    if (entityId) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }
}

async function registerEnclosureFilterCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(EFC_TAG)) return;
  registry.define(EFC_TAG, EnclosureFilterCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: EFC_TAG,
    name: "Enclosure filter",
    description: "Printer enclosure filter / vent: vent position, intake vs exhaust temperature, humidity and VOC.",
  });
  console.info(`%c ENCLOSURE-FILTER-CARD %c ${EFC_VERSION} `, "background:#009688;color:#fff", "");
}

registerEnclosureFilterCard();
})();

/* ===== energy-summary-card 1.4.1 ===== */
(() => {
/*
 * Energy summary card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * One compact row: power now, and energy used today, yesterday and this month
 * so far, each with what it costs. Tap a number for its sensor; tap anywhere else
 * for the full Energy dashboard.
 * Totals come from Home Assistant's long-term statistics, so they match the
 * Energy dashboard; today and the month also add what the meter has counted
 * since the latest 5-minute statistics, so they tick live instead of lagging.
 * The price comes from the Energy settings unless you set one.
 * See cards/energy-summary-card/README.md for every option.
 */

const ESC_VERSION = "1.4.1";
const ESC_TAG = "energy-summary-card";
const REFRESH_MS = 120000;

// Teal = you can tap this: the circle is the card's tap target (the user's reference teal).
const TEAL = "var(--teal-color, #009688)";
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
// Numbers with the user's digit grouping: 1,235 · 12.3 · 1,204.
const fmt = (n, d, locale) => n.toLocaleString(locale || "en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });

/* 616 W · 1,235 W · 12.3 kW */
function power(w, locale) {
  if (w === null) return ["–", "W"];
  return Math.abs(w) >= 10000 ? [fmt(w / 1000, 1, locale), "kW"] : [fmt(Math.round(w) || 0, 0, locale), "W"];
}

/* 7.99 · 86.6 · 1,204 kWh – about three significant figures. */
function energy(kwh, locale) {
  if (kwh === null) return ["–", "kWh"];
  const a = Math.abs(kwh);
  return [fmt(kwh, a < 10 ? 2 : a < 100 ? 1 : 0, locale), "kWh"];
}

/* The sensor's state in kWh, whatever energy unit it reports. */
function kwhState(s) {
  const v = num(s?.state);
  if (v === null) return null;
  const u = s.attributes?.unit_of_measurement;
  return u === "Wh" ? v / 1000 : u === "MWh" ? v * 1000 : v;
}

/*
 * What the meter has counted since the statistics stop (the end of the latest
 * 5-minute block, when it read `anchor`). A meter that has dropped by more than
 * 10% was reset – a daily meter at midnight – so everything it shows is new;
 * that is the same rule Home Assistant's statistics use.
 */
function sinceStats(live, anchor) {
  if (live === null || anchor === null) return 0;
  if (live < anchor * 0.9) return live;
  return Math.max(0, live - anchor);
}

function money(v, currency, locale) {
  if (v === null || !currency) return "";
  try {
    return new Intl.NumberFormat(locale || "en-GB", { style: "currency", currency }).format(v);
  } catch (e) {
    return `${v.toFixed(2)} ${currency}`;
  }
}

/* Costs (design rule): under a pound in pence – "7p", under a penny "0.5p" – and from a pound up
   as money, "£1.23"; the same for cents in euros and dollars. Other currencies always as money. */
const MINOR = { GBP: "p", EUR: "c", USD: "¢" };
function cost(v, currency, locale) {
  if (v === null || v === undefined || !Number.isFinite(v) || !currency) return "";
  const unit = MINOR[currency];
  // Rounded to the penny first, so 99.5p reads £1.00 (never "100p", nor £0.99 from 0.995).
  const q = Math.round(Math.abs(v) * 100);
  if (!unit || q >= 100) return money((v < 0 ? -q : q) / 100, currency, locale);
  const c = v * 100;
  return `${c > 0 && c < 0.95 ? c.toFixed(1) : Math.round(c)}${unit}`;
}

/* Running cost of the current draw, the same way: "15p/h", "0.2p/h", "£1.20/h". */
function perHour(v, currency, locale) {
  const c = cost(v, currency, locale);
  return c ? `${c}/h` : "";
}

/* The price per kWh: the card's own setting, else the grid source in the Energy settings. */
async function findPrice(hass, cfg) {
  if (typeof cfg.price === "string" && /^[a-z_]+\.\w+/.test(cfg.price)) return { entity: cfg.price };
  if (num(cfg.price) !== null) return { value: num(cfg.price) };
  try {
    const prefs = await hass.callWS({ type: "energy/get_prefs" });
    const flows = [];
    for (const src of prefs.energy_sources || []) {
      if (src.type !== "grid") continue;
      if (src.stat_energy_from) flows.push(src); // current format
      for (const f of src.flow_from || []) flows.push(f); // older format
    }
    const f = flows.find((x) => x.stat_energy_from === cfg.energy) || flows[0];
    if (!f) return null;
    if (f.entity_energy_price) return { entity: f.entity_energy_price };
    if (typeof f.number_energy_price === "number") return { value: f.number_energy_price };
  } catch (e) {
    /* Energy not set up, or no permission – costs are just left out. */
  }
  return null;
}

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  ha-card { container-type: inline-size; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  /* Spacing follows Mushroom: content starts 10px from the card edge, the first text at edge + 46
     (36px circle + 10px gap), on every screen. */
  .row { display: flex; align-items: center; gap: 10px; padding: 12px 10px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .shape ha-icon { --mdc-icon-size: 24px; } /* same as Mushroom / tile card icons */
  /* The numbers are never cut: equal widths while all four fit, a longer one takes what it needs,
     and only when a row can't hold them does one move to a second row. Each stat has a divider
     and 10px (--pl) before its text; the block is pulled left by that much, and the 1px clip on
     its left edge hides the divider of whichever stat starts a row – so the first text of every
     row lines up at edge + 46. */
  .stats { --pl: 10px; flex: 1; min-width: 0; display: flex; flex-wrap: wrap; row-gap: 8px;
    margin-left: calc(-1px - var(--pl)); clip-path: inset(-12px -12px -12px 1px); }
  .stat { box-sizing: border-box; flex: 1 1 0; min-width: max-content; padding: 0 6px 0 var(--pl);
    border-left: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  /* Captions under the numbers: 11px. */
  .k { font-size: 11px; line-height: 14px; font-weight: 500; letter-spacing: .02em; color: var(--secondary-text-color); }
  /* Text matches Mushroom / tile cards: values 14px medium in the primary colour (no colour on
     values), costs 12px regular in the secondary colour. The whole card is one tap target: it
     opens the Energy dashboard, which has every detail. */
  .v { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); white-space: nowrap; }
  .v small { font-size: 11px; font-weight: 400; color: var(--secondary-text-color); margin-left: 2px; }
  .c { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .c:empty::before { content: "\\00a0"; }
  ha-card:active { filter: brightness(.92); }
  ha-card:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Phone width: a little less air between the numbers, so all four still fit on one row more often. */
  @container (max-width: 400px) {
    .stats { --pl: 8px; }
    .stat { padding-right: 4px; }
  }
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

class EnergySummaryCard extends HTMLElement {
  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {});
    const by = (unit) => ids.find((id) => id.startsWith("sensor.") && hass.states[id].attributes?.unit_of_measurement === unit);
    return { power: by("W") || "", energy: by("kWh") || "", navigation_path: "/energy" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "power", required: true, selector: { entity: { domain: "sensor", device_class: "power" } } },
        { name: "energy", required: true, selector: { entity: { domain: "sensor", device_class: "energy" } } },
        { type: "grid", name: "", schema: [
          { name: "price", selector: { number: { min: 0, step: 0.0001, mode: "box" } } },
          { name: "icon", selector: { icon: {} } },
        ] },
        { name: "navigation_path", selector: { navigation: {} } },
      ],
      computeLabel: (s) =>
        ({ power: "Power now", energy: "Energy (kWh)", price: "Price per kWh (optional)", icon: "Icon", navigation_path: "Tap goes to" })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          energy: "Today, yesterday and this month come from this sensor's statistics, like the Energy dashboard.",
          price: "Leave empty to use the grid price from Settings → Energy.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.power && !config?.energy) throw new Error("Set power and/or energy");
    this._config = { ...config };
    this._built = false;
    this._totals = { today: null, yesterday: null, month: null, anchor: null };
    this._price = undefined;
    this._fetchedAt = 0;
    if (this._hass) {
      this._refresh();
      this._render();
    }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first || Date.now() - this._fetchedAt > REFRESH_MS) this._refresh();
    this._render();
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    this._timer = setInterval(() => this._hass && this._refresh(), REFRESH_MS);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  async _refresh() {
    this._fetchedAt = Date.now();
    const hass = this._hass;
    const id = this._config?.energy;
    if (!hass || !id) return;
    if (this._price === undefined) this._price = await findPrice(hass, this._config);
    const units = { energy: "kWh" };
    const change = async (calendar) => {
      try {
        const r = await hass.callWS({ type: "recorder/statistic_during_period", statistic_id: id, calendar, types: ["change"], units });
        return num(r?.change);
      } catch (e) {
        return null;
      }
    };
    // Where the statistics stop: the latest 5-minute block and what the meter read at its end.
    const tail = async () => {
      try {
        const r = await hass.callWS({
          type: "recorder/statistics_during_period",
          start_time: new Date(Date.now() - 3600000).toISOString(),
          statistic_ids: [id],
          period: "5minute",
          types: ["state"],
          units,
        });
        const rows = r?.[id] || [];
        const last = rows[rows.length - 1];
        return last && num(last.state) !== null ? { end: last.end, state: num(last.state) } : null;
      } catch (e) {
        return null;
      }
    };
    const before = await tail();
    let [today, yesterday, month] = await Promise.all([
      change({ period: "day" }),
      change({ period: "day", offset: -1 }),
      change({ period: "month" }),
    ]);
    const after = await tail();
    // A block landed mid-refresh: read today and the month again so they end where `after` does.
    if (before?.end !== after?.end) [today, month] = await Promise.all([change({ period: "day" }), change({ period: "month" })]);
    this._totals = { today, yesterday, month, anchor: after ? after.state : null };
    this._render();
  }

  _priceValue() {
    const p = this._price;
    if (!p) return null;
    if (p.entity) return num(this._hass.states[p.entity]?.state);
    return num(p.value);
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const stat = (key) => `<div class="stat ${key}"><div class="k"></div><div class="v"></div><div class="c"></div></div>`;
    root.innerHTML = `<style>${CSS}</style>
      <ha-card role="button" tabindex="0"><div class="row">
        <div class="shape" style="background:${tint(TEAL, 20)}"><ha-icon style="color:${TEAL}"></ha-icon></div>
        <div class="stats">${["now", "today", "yesterday", "month"].map(stat).join("")}</div>
      </div></ha-card>`;
    const card = root.querySelector("ha-card");
    // One tap target: anywhere on the card opens the Energy dashboard (or the power sensor).
    card.addEventListener("click", () => this._tap());
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._tap();
      }
    });
    this._built = true;
  }

  _render() {
    inkSchedule(this, ".stat");
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    const root = this.shadowRoot;
    const currency = hass.config?.currency;
    const locale = hass.locale?.language || hass.language;
    const price = this._priceValue();
    const costOf = (kwh) => (kwh === null || price === null ? "" : cost(kwh * price, currency, locale));
    const w = num(hass.states[this._config.power]?.state);
    const month = new Date().toLocaleDateString(locale || "en-GB", { month: "long" });
    // Today and the month run live: statistics up to the latest block, plus the meter since then.
    const extra = sinceStats(kwhState(hass.states[this._config.energy]), this._totals.anchor);
    const live = (v) => (v === null ? null : v + extra);
    const today = live(this._totals.today);
    const monthSoFar = live(this._totals.month);
    const rows = {
      now: ["Now", power(w, locale), w === null || price === null ? "" : perHour((w / 1000) * price, currency, locale)],
      today: ["Today", energy(today, locale), costOf(today)],
      yesterday: ["Yesterday", energy(this._totals.yesterday, locale), costOf(this._totals.yesterday)],
      month: [month.charAt(0).toUpperCase() + month.slice(1), energy(monthSoFar, locale), costOf(monthSoFar)],
    };
    root.querySelector(".shape ha-icon").setAttribute("icon", this._config.icon || "mdi:home-lightning-bolt");
    for (const [key, [label, [value, unit], money_]] of Object.entries(rows)) {
      const el = root.querySelector(`.stat.${key}`);
      el.style.display = key === "now" ? (this._config.power ? "" : "none") : this._config.energy ? "" : "none";
      // Only touch the DOM when something changed, so a tap is never lost mid-update.
      const v = `${esc(value)}<small>${esc(unit)}</small>`;
      const k = el.querySelector(".k");
      const vv = el.querySelector(".v");
      const c = el.querySelector(".c");
      if (k.textContent !== label) k.textContent = label;
      if (vv._h !== v) {
        vv.innerHTML = v;
        vv._h = v;
      }
      if (c.textContent !== money_) c.textContent = money_;
    }
  }

  _tap() {
    const path = this._config.navigation_path;
    if (path) {
      history.pushState(null, "", path);
      this._fire("location-changed", { replace: false });
    } else this._more(this._config.power || this._config.energy);
  }

  _more(entityId) {
    if (entityId) this._fire("hass-more-info", { entityId });
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

async function registerEnergySummaryCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(ESC_TAG)) return;
  registry.define(ESC_TAG, EnergySummaryCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: ESC_TAG,
    name: "Energy summary",
    description: "Power now plus today, yesterday and this month, with costs, in one compact row.",
  });
  console.info(`%c ENERGY-SUMMARY-CARD %c ${ESC_VERSION} `, "background:#009688;color:#fff", "");
}

registerEnergySummaryCard();
})();

/* ===== home-status-card 1.3.1 ===== */
(() => {
/*
 * Home status card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * One compact card for a remote home: who is there (or who was seen last, and
 * when), an alarm switch that asks before it changes, three status buttons
 * (door, TV, climate) and an ePaper message line. The status buttons stay grey
 * while things are normal and only take a colour when they need attention.
 * See cards/home-status-card/README.md for every option.
 */

const HSC_VERSION = "1.3.1";
const HSC_TAG = "home-status-card";

// One meaning per colour (design tokens → Colours): green = someone home, orange = the step
// before red (seen within the hour), red = a call for attention (empty, door open, armed,
// heating), amber = early warning, blue = cooling, grey = normal.
const C = {
  grey: "var(--grey-color, #9e9e9e)",
  green: "var(--green-color, #4caf50)",
  orange: "var(--orange-color, #ff9800)",
  amber: "var(--amber-color, #ffc107)",
  red: "var(--red-color, #f44336)",
  blue: "var(--blue-color, #2196f3)",
};
const RECENT_S = 3600;

const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
// Readable coloured text – mixed toward the text colour, never the raw colour on white.
const tx = (c, p = 70) => `color-mix(in srgb, ${c} ${p}%, var(--primary-text-color))`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
const unavailable = (s) => !s || s.state === "unavailable" || s.state === "unknown";

function when(date) {
  // Same wording as the old chip: "today at 16:09", "yesterday at 09:12", "on 03 Oct at 18:40".
  const now = new Date();
  const hm = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(date, now)) return `today at ${hm}`;
  if (sameDay(date, y)) return `yesterday at ${hm}`;
  return `on ${date.toLocaleDateString("en-GB", { month: "short", day: "2-digit" })} at ${hm}`;
}

function parseLocal(value) {
  // input_datetime state "YYYY-MM-DD HH:MM:SS" is local time.
  if (!value) return null;
  const d = new Date(String(value).replace(" ", "T"));
  return isNaN(d) ? null : d;
}

/* Everything the card shows, from hass + config, in one place. */
function model(hass, cfg) {
  const st = (id) => (id ? hass.states[id] : undefined);
  const p = cfg.presence || {};
  // The occupied / last-room texts are shown exactly as the helpers hold them.
  const occupied = (st(p.occupied)?.state || "").trim();
  const lastSeen = parseLocal(st(p.last_seen)?.state);
  const lastRoom = (st(p.last_room)?.state || "").trim();
  let presence;
  if (occupied && !unavailable(st(p.occupied)))
    presence = { color: C.green, label: "Occupied", detail: occupied, icon: "mdi:home-account" };
  else {
    // As before: orange if someone was seen within the hour, red otherwise.
    const recent = lastSeen && (Date.now() - lastSeen.getTime()) / 1000 < RECENT_S;
    const seen = lastSeen ? `${lastRoom ? `in the ${lastRoom} ` : ""}${when(lastSeen)}` : "";
    presence = {
      color: recent ? C.orange : C.red,
      label: "Empty",
      detail: seen ? `A person was last seen ${seen}` : "No one seen yet",
      icon: "mdi:home-outline",
    };
  }

  const alarmSt = st(cfg.alarm);
  const alarm = alarmSt ? { on: alarmSt.state === "on", unavailable: unavailable(alarmSt) } : null;

  const tiles = [];
  if (cfg.door) {
    const s = st(cfg.door);
    const open = s && /open|on/.test(s.state) && !/closed/.test(s.state);
    tiles.push({
      key: "door",
      icon: open ? "mdi:door-open" : "mdi:door-closed",
      // Each label names its object ("Door open", like "TV on"); unknown is "–".
      label: unavailable(s) ? "Door –" : open ? "Door open" : "Door closed",
      color: open ? C.red : null,
      action: { action: "more-info", entity: cfg.door },
      title: "Door",
    });
  }
  if (cfg.tv) {
    const tv = typeof cfg.tv === "string" ? { entity: cfg.tv } : cfg.tv;
    const s = st(tv.entity);
    const on = s && s.state === "on";
    tiles.push({
      key: "tv",
      icon: on ? "mdi:television" : "mdi:television-off",
      label: unavailable(s) ? "TV –" : on ? "TV on" : "TV off",
      color: on ? C.amber : null,
      action: tv.navigation_path ? { action: "navigate", path: tv.navigation_path } : { action: "more-info", entity: tv.entity },
      title: "TV",
    });
  }
  if (cfg.climate) {
    const cl = cfg.climate;
    const t = num(st(cl.temperature)?.state);
    const mode = (st(cl.state)?.state || "").trim();
    let color = null;
    let icon = "mdi:air-conditioner";
    if (/cool/i.test(mode)) {
      color = C.blue;
      icon = "mdi:snowflake";
    } else if (/heat/i.test(mode)) {
      color = C.red;
      icon = "mdi:fire";
    }
    // Short, so the three buttons share a row on a phone: "25.1° · Cool".
    const short = /off/i.test(mode) ? "Off" : /cool/i.test(mode) ? "Cool" : /heat/i.test(mode) ? "Heat"
      : mode.replace(/^AC\s*/i, "") || "–";
    tiles.push({
      key: "climate",
      icon,
      label: `${t === null ? "–" : t.toFixed(1)}° · ${short}`,
      color,
      action: cl.navigation_path ? { action: "navigate", path: cl.navigation_path } : { action: "more-info", entity: cl.temperature },
      title: "Climate",
    });
  }

  const msgSt = st(cfg.message);
  const message = msgSt && !unavailable(msgSt) ? msgSt.state.trim() : "";

  return { presence, alarm, tiles, message };
}

/* ------------------------------------------------------------------------ */
/* Confirmation dialog – same look as the other cards' dialogs              */
/* ------------------------------------------------------------------------ */

const DIALOG_CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); padding: 25px 18px 18px;
    border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .row { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; }
  /* The text sits under the title, starting on its line (8 + 42px glyph + 6px gap). No home
     name: the dialog opens from the home's own card. */
  .text { margin: 12px 0 0 56px; font-size: 15px; line-height: 21px; color: var(--secondary-text-color); }
  .buttons { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); display: grid; gap: 8px; }
  button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 56px; padding-left: 10px;
    border-radius: 28px; cursor: pointer; font-size: 16px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color); }
  button .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  button .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
  button.confirm { color: #fff; }
  button.confirm .glyph { background: rgba(255,255,255,.2); }
  button.confirm .glyph ha-icon { color: #fff; }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  button:active { filter: brightness(.92); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

function confirmDialog({ title, icon, color, text, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("hsc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(icon)}" style="color:${color}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        <div class="text">${esc(text)}</div>
        <div class="buttons">
          <button class="confirm" style="background:${color}"><span class="glyph"><ha-icon icon="${esc(icon)}"></ha-icon></span>${esc(confirmLabel)}</button>
          <button class="cancel"><span class="glyph"><ha-icon icon="mdi:close"></ha-icon></span>Cancel</button>
        </div></div>`;
    const done = (ok) => {
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      resolve(ok);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        done(false);
      }
    };
    root.querySelector(".backdrop").addEventListener("click", () => done(false));
    root.querySelector(".cancel").addEventListener("click", () => done(false));
    root.querySelector(".confirm").addEventListener("click", () => done(true));
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
    root.querySelector(".confirm").focus();
  });
}

/* ------------------------------------------------------------------------ */

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  /* Spacing follows Mushroom: content starts 10px from the card edge; a little more air vertically. */
  ha-card { container-type: inline-size; padding: 12px 10px; display: grid; gap: 10px; }
  /* Alignment rule: icon circle, text block (title + detail) and the alarm chip share one centre
     line, like every other card's row (measured, not eyeballed). */
  .head { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; column-gap: 10px; align-items: center; }
  .tb { min-width: 0; }
  .who { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .shape { width: 36px; height: 36px; border-radius: 50%; display: flex;
    align-items: center; justify-content: center; transition: background-color 180ms; }
  /* Same size as Mushroom / tile card icons: 36 px circle, 24 px icon. */
  .shape ha-icon { --mdc-icon-size: 24px; transition: color 180ms; }
  .shape.who:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Text matches Mushroom / tile cards: name 14px medium, detail 12px regular. Nothing is cut off:
     "Home · Occupied" breaks only before the state word (the dot stays with the name), and the
     detail line wraps in full. */
  .name { min-width: 0; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    overflow-wrap: break-word; }
  .name .state { font-weight: 400; color: var(--secondary-text-color); }
  .name .w { white-space: nowrap; }
  .detail { min-width: 0; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color);
    overflow-wrap: break-word; }
  /* Secondary pill (30px, like the status buttons below): a state chip, not the card's main action.
     Its word always shows: on a narrow card the text beside it wraps instead. */
  .alarm { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 5px; min-height: 30px;
    padding: 0 10px 0 7px; border-radius: 15px; cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--secondary-text-color);
    transition: background-color 180ms, color 180ms; -webkit-tap-highlight-color: transparent; }
  .alarm ha-icon { --mdc-icon-size: 16px; color: ${C.grey}; }
  /* Armed: the "on" pill of every card – red tint 18%, the word mixed 70% toward the text colour. */
  .alarm.on { background: ${tint(C.red, 18)}; color: ${tx(C.red, 70)}; }
  .alarm.on ha-icon { color: ${C.red}; }
  /* Press feedback without moving the button: a scale-down shrinks the target under the finger
     and taps near the edge would be lost. */
  .alarm:active, .tile:active, .msg:active, .shape.who:active { filter: brightness(.92); }
  .alarm:focus-visible, .tile:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Status buttons: one row, equal widths while every label fits; a longer label takes the width
     it needs, and only if the row can't hold them all does one wrap. Labels are never cut. */
  .tiles { display: flex; flex-wrap: wrap; gap: 8px; }
  .tile { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: max-content; display: flex; align-items: center; justify-content: center;
    gap: 6px; min-height: 30px; padding: 0 8px; border-radius: 15px; cursor: pointer; white-space: nowrap;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--primary-text-color);
    font-size: 12px; font-weight: 500; transition: background-color 180ms; -webkit-tap-highlight-color: transparent; }
  .tile ha-icon { --mdc-icon-size: 16px; flex: 0 0 auto; color: ${C.grey}; }
  .msg { all: unset; box-sizing: border-box; display: flex; align-items: flex-start; gap: 8px; min-height: 30px; padding: 7px 12px;
    border-radius: 15px; cursor: pointer; font-size: 12px; line-height: 16px; color: var(--primary-text-color);
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); -webkit-tap-highlight-color: transparent; }
  .msg ha-icon { --mdc-icon-size: 16px; color: var(--grey-color, #9e9e9e); flex: 0 0 auto; }
  /* Long ePaper messages wrap in full; nothing is cut off. */
  .msg span { min-width: 0; white-space: pre-line; overflow-wrap: anywhere; }
  .msg span.empty { color: var(--secondary-text-color); }
  .msg:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Wide cards: status buttons and the ePaper line share one row. */
  @container (min-width: 600px) {
    ha-card { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; }
    .head { grid-column: 1 / -1; }
  }
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

class HomeStatusCard extends HTMLElement {
  static getStubConfig() {
    return { name: "Home" };
  }

  // Visual editor (Home Assistant builds it from this schema). Nested options get their own
  // collapsible section; anything left empty is simply not shown on the card.
  static getConfigForm() {
    const entity = (domain) => ({ entity: domain ? { domain } : {} });
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "name", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ] },
        { type: "expandable", name: "presence", title: "Presence", icon: "mdi:home-account", expanded: true, schema: [
          { name: "occupied", selector: entity() },
          { name: "last_room", selector: entity() },
          { name: "last_seen", selector: entity(["input_datetime", "sensor"]) },
          { name: "navigation_path", selector: { navigation: {} } },
        ] },
        { name: "alarm", selector: entity(["input_boolean", "switch"]) },
        { name: "door", selector: entity() },
        { type: "expandable", name: "tv", title: "TV", icon: "mdi:television", schema: [
          { name: "entity", selector: entity() },
          { name: "navigation_path", selector: { navigation: {} } },
        ] },
        { type: "expandable", name: "climate", title: "Climate", icon: "mdi:air-conditioner", schema: [
          { name: "temperature", selector: entity("sensor") },
          { name: "state", selector: entity() },
          { name: "navigation_path", selector: { navigation: {} } },
        ] },
        { name: "message", selector: entity() },
      ],
      computeLabel: (s) =>
        ({
          name: "Name",
          icon: "Icon (optional)",
          occupied: "Occupied rooms (text)",
          last_room: "Last room (text)",
          last_seen: "Last seen (date and time)",
          navigation_path: "Tap goes to",
          alarm: "Alarm switch",
          door: "Door sensor",
          entity: "TV on/off entity",
          temperature: "Temperature sensor",
          state: "AC state (text)",
          message: "ePaper message",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          occupied: "Shown as it is stored. Empty means nobody is home.",
          state: "Text containing “cool” or “heat” colours the button; “off” shows Off.",
          alarm: "Arming and disarming always asks for confirmation.",
          door: "Any state containing “open” turns the button red.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config) throw new Error("Missing configuration");
    this._config = { ...config };
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    this._timer = setInterval(() => this._hass && this._render(), 60000); // turns the house red an hour after the last sighting
  }

  disconnectedCallback() {
    clearInterval(this._timer);
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style>
      <ha-card>
        <div class="head">
          <div class="shape who" role="button" tabindex="0"><ha-icon></ha-icon></div>
          <div class="tb"><div class="name who"></div><div class="detail who"></div></div>
          <button class="alarm" aria-pressed="false"><ha-icon></ha-icon><span class="txt"></span></button>
        </div>
        <div class="tiles"></div>
        <button class="msg"><ha-icon icon="mdi:message-text-outline"></ha-icon><span></span></button>
      </ha-card>`;
    const $ = (s) => root.querySelector(s);
    this._el = {
      who: [...root.querySelectorAll(".who")], shape: $(".shape"), icon: $(".shape ha-icon"), name: $(".name"), detail: $(".detail"),
      alarm: $(".alarm"), alarmIcon: $(".alarm ha-icon"), alarmTxt: $(".alarm .txt"), tiles: $(".tiles"),
      msg: $(".msg"), msgTxt: $(".msg span"),
    };
    const p = this._config.presence || {};
    const openPresence = () =>
      this._act(p.navigation_path ? { action: "navigate", path: p.navigation_path } : { action: "more-info", entity: p.occupied });
    this._el.who.forEach((el) => el.addEventListener("click", openPresence));
    // The presence circle is a button: Enter / Space too.
    this._el.shape.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      openPresence();
    });
    this._el.alarm.addEventListener("click", () => this._toggleAlarm());
    this._el.msg.addEventListener("click", () => this._act({ action: "more-info", entity: this._config.message }));
    this._built = true;
    this._tileKeys = "";
  }

  _render() {
    inkSchedule(this, ".tb");
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const m = model(this._hass, this._config);
    this._m = m;
    const e = this._el;

    e.icon.setAttribute("icon", this._config.icon || m.presence.icon);
    e.icon.style.color = m.presence.color;
    e.shape.style.backgroundColor = tint(m.presence.color, 20);
    // Only touch the DOM when something changed: replacing an element while a finger is on it
    // swallows the tap, and Home Assistant pushes state updates several times a second.
    // "Greece · Occupied": on a narrow card only the state word moves down, the dot staying with the name.
    const nameHtml = `${esc(this._config.name || "Home")}<span class="state">&nbsp;· <span class="w">${esc(m.presence.label)}</span></span>`;
    if (e.name._h !== nameHtml) {
      e.name.innerHTML = nameHtml;
      e.name._h = nameHtml;
    }
    if (e.detail.textContent !== m.presence.detail) e.detail.textContent = m.presence.detail;

    e.alarm.style.display = m.alarm ? "" : "none";
    if (m.alarm) {
      e.alarm.classList.toggle("on", m.alarm.on);
      e.alarm.setAttribute("aria-pressed", String(m.alarm.on));
      e.alarmIcon.setAttribute("icon", m.alarm.on ? "mdi:shield-lock" : "mdi:shield-off-outline");
      const word = m.alarm.unavailable ? "Alarm –" : m.alarm.on ? "Armed" : "Disarmed";
      if (e.alarmTxt.textContent !== word) e.alarmTxt.textContent = word;
    }

    const keys = m.tiles.map((t) => t.key).join();
    if (keys !== this._tileKeys) {
      e.tiles.innerHTML = m.tiles
        .map((t) => `<button class="tile" data-key="${t.key}"><ha-icon></ha-icon><span></span></button>`)
        .join("");
      e.tiles.querySelectorAll(".tile").forEach((b) =>
        b.addEventListener("click", () => this._act(this._m.tiles.find((t) => t.key === b.dataset.key).action)),
      );
      this._tileKeys = keys;
    }
    m.tiles.forEach((t, i) => {
      const b = e.tiles.children[i];
      // A button that needs attention is an "on" pill: tint 18%, label mixed 70% toward the text
      // colour, icon in full colour.
      b.querySelector("ha-icon").setAttribute("icon", t.icon);
      b.querySelector("ha-icon").style.color = t.color || "";
      b.style.backgroundColor = t.color ? tint(t.color, 18) : "";
      b.style.color = t.color ? tx(t.color, 70) : "";
      const span = b.querySelector("span");
      if (span.textContent !== t.label) span.textContent = t.label;
      b.title = t.label.startsWith(t.title) ? t.label : `${t.title}: ${t.label}`;
    });
    e.tiles.style.display = m.tiles.length ? "" : "none";

    // Always shown (it is the way into the ePaper's history); says so when the screen is blank.
    e.msg.style.display = this._config.message ? "" : "none";
    const msgText = m.message ? `“${m.message}”` : "ePaper screen is blank";
    if (e.msgTxt.textContent !== msgText) e.msgTxt.textContent = msgText;
    e.msgTxt.classList.toggle("empty", !m.message);
  }

  async _toggleAlarm() {
    const m = this._m;
    if (!m?.alarm) return;
    const arming = !m.alarm.on;
    // Red both ways – the Armed chip's colour (a confirmation takes its control's "on" colour).
    // The dialog opens from the home's own card, so it doesn't name the home again.
    const ok = await confirmDialog({
      title: arming ? "Arm alarm" : "Disarm alarm",
      icon: arming ? "mdi:shield-lock" : "mdi:shield-off-outline",
      color: C.red,
      text: arming
        ? "Your CCTV alarm system will send push notifications when it detects someone."
        : "Your CCTV alarm system stops sending push notifications until you arm it again.",
      confirmLabel: arming ? "Arm" : "Disarm",
    });
    if (!ok) return;
    const [domain] = this._config.alarm.split(".");
    try {
      await this._hass.callService(domain === "switch" ? "switch" : "input_boolean", arming ? "turn_on" : "turn_off", {
        entity_id: this._config.alarm,
      });
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || "Couldn't change the alarm." });
    }
  }

  _act(a) {
    if (!a) return;
    if (a.action === "navigate") {
      history.pushState(null, "", a.path);
      this._fire("location-changed", { replace: false });
    } else if (a.action === "more-info" && a.entity) {
      this._fire("hass-more-info", { entityId: a.entity });
    }
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

async function registerHomeStatusCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(HSC_TAG)) return;
  registry.define(HSC_TAG, HomeStatusCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: HSC_TAG,
    name: "Home status",
    description: "Presence, alarm, door, TV, climate and a message line for a home, in one compact card.",
  });
  console.info(`%c HOME-STATUS-CARD %c ${HSC_VERSION} `, "background:#009688;color:#fff", "");
}

registerHomeStatusCard();
})();

/* ===== mmu-lanes-card 1.2.1 ===== */
(() => {
/*
 * MMU lanes card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Every lane of a Happy Hare MMU (e.g. an EMU) at a glance: whether filament is
 * loaded (green: good, ready), the lane's humidity (coloured: dry / medium / wet) and
 * temperature, and a fan icon while the lane is drying. The summary under the title counts
 * the loaded lanes. Lane names are never cut: the grid takes as many columns as the measured
 * names allow (fewer on a phone). Tap a reading for its own more-info. Sensors are found
 * from the Moonraker prefix; lanes are counted automatically.
 * See cards/mmu-lanes-card/README.md for every option.
 */

const MLC_VERSION = "1.2.1";
const MLC_TAG = "mmu-lanes-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  green: "var(--green-color, #4caf50)",
  amber: "var(--amber-color, #ffc107)",
  orange: "var(--orange-color, #ff9800)",
};
const TEXT = {
  green: "color-mix(in srgb, var(--green-color, #4caf50) 75%, var(--primary-text-color))",
  amber: "color-mix(in srgb, var(--amber-color, #ffc107) 70%, var(--primary-text-color))",
  orange: "color-mix(in srgb, var(--orange-color, #ff9800) 80%, var(--primary-text-color))",
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));

/* Entity names Happy Hare / Moonraker use, per lane n. */
function ids(cfg, n) {
  const p = cfg.prefix;
  const u = cfg.unit ?? 0;
  return {
    entry: `binary_sensor.${p}_mmu_entry_${n}`,
    humidity: `sensor.${p}_unit${u}_env${n}_humidity`,
    temp: `sensor.${p}_unit${u}_env${n}_temp`,
    fan: `sensor.${p}_unit${u}_fan${n}`,
  };
}

function laneCount(hass, cfg) {
  if (cfg.lanes) return Number(cfg.lanes);
  let n = 0;
  while (n < 32 && (hass.states[ids(cfg, n).entry] || hass.states[ids(cfg, n).humidity])) n++;
  return n;
}

function lanes(hass, cfg) {
  const [dry, humid] = cfg.humidity_thresholds || [20, 40];
  const names = cfg.names || [];
  return Array.from({ length: laneCount(hass, cfg) }, (_, n) => {
    const e = ids(cfg, n);
    const entry = hass.states[e.entry];
    const h = num(hass.states[e.humidity]?.state);
    const t = num(hass.states[e.temp]?.state);
    const fan = num(hass.states[e.fan]?.state);
    const tone = h === null ? null : h < dry ? "green" : h < humid ? "amber" : "orange";
    return {
      n,
      name: names[n] || `Lane ${n}`,
      loaded: entry ? entry.state === "on" : null,
      h,
      t,
      drying: (fan || 0) > 0,
      fan,
      tone,
      ids: e,
      more: hass.states[e.humidity] ? e.humidity : entry ? e.entry : null,
    };
  });
}

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  ha-card { padding: 10px; container-type: inline-size; }
  /* Spacing follows Mushroom: everything inside the card starts 10px from its edge (card padding).
     Two-line label row, the same on every card: a 24px icon in a 36px slot (where the glyph of a
     Mushroom icon sits), the 14px / 500 title at edge + 46 and the 12px summary under it on the
     same vertical line (ink-aligned, free to wrap). The icon is decorative: grey, no circle. */
  .label { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 0 8px; }
  .slot { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
  .slot ha-icon { --mdc-icon-size: 24px; color: ${C.grey}; }
  .lt { flex: 1; min-width: 0; }
  .t { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .lt.one .t { position: relative; top: 1px; } /* alone, a 20px line reads ~1px high next to the icon */
  .s { display: block; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .s:empty { display: none; }
  /* Lanes: the columns are fitted to the measured names (_fitLanes) – as many as the columns option while
     every name fits on one line, fewer on a phone. Before that (and without a browser to measure
     in), four columns, two on a narrow card. */
  .lanes { display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 8px; }
  @container (max-width: 300px) { .lanes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .lane { box-sizing: border-box; min-width: 0; padding: 11px 10px; border-radius: 10px; cursor: pointer;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .04); -webkit-tap-highlight-color: transparent; }
  .lh { display: flex; align-items: center; gap: 4px; }
  /* The name keeps its natural width (so it can be measured) and pushes the icons to the end. */
  .ln { flex: 0 1 auto; min-width: 0; margin-right: auto; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px;
    color: var(--primary-text-color); white-space: nowrap; }
  /* Only a name wider than the whole card wraps. */
  .lanes.wrap .ln { white-space: normal; overflow-wrap: break-word; }
  .lane.empty .ln { color: var(--secondary-text-color); }
  .lh ha-icon { flex: none; --mdc-icon-size: 18px; }
  /* Loaded = good, ready: green. Empty: quiet. Unknown: grey. */
  .lh ha-icon.sp { color: ${C.green}; }
  .lane.empty .lh ha-icon.sp { color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .lane.unknown .lh ha-icon.sp { color: ${C.grey}; }
  /* Drying: heat, so orange. */
  .lh ha-icon.dry { --mdc-icon-size: 16px; color: ${C.orange}; }
  .lv { display: grid; gap: 1px; margin-top: 2px; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .v { all: unset; box-sizing: border-box; justify-self: start; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;
    cursor: pointer; border-radius: 4px; -webkit-tap-highlight-color: transparent; }
  .v:active { filter: brightness(.85); }
  .v:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .v ha-icon { --mdc-icon-size: 14px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 10px 0 0; font-size: 11px; line-height: 14px; letter-spacing: .4px;
    color: var(--secondary-text-color); }
  .legend span { display: inline-flex; align-items: center; gap: 4px; }
  .legend em { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .legend ha-icon { --mdc-icon-size: 14px; color: ${C.green}; }
  .lane:active { filter: brightness(.92); }
  .lane:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
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

class MmuLanesCard extends HTMLElement {
  static getStubConfig() {
    return { prefix: "printer" };
  }

  static getConfigForm() {
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "prefix", required: true, selector: { text: {} } },
          { name: "title", selector: { text: {} } },
          { name: "unit", selector: { number: { min: 0, max: 7, mode: "box" } } },
          { name: "lanes", selector: { number: { min: 1, max: 32, mode: "box" } } },
        ] },
        { name: "columns", selector: { number: { min: 1, max: 8, mode: "box" } } },
        { name: "legend", selector: { boolean: {} } },
      ],
      computeLabel: (s) =>
        ({ prefix: "Moonraker prefix (e.g. voron)", title: "Title", unit: "MMU unit", lanes: "Lanes (default: all found)", columns: "Columns", legend: "Show legend" })[s.name] ?? s.name,
    };
  }

  setConfig(config) {
    if (!config?.prefix) throw new Error("Set the Moonraker prefix (e.g. voron)");
    this._config = { legend: true, ...config };
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    if (this._built && this._ro && this._lanesEl) this._ro.observe(this._lanesEl);
  }

  disconnectedCallback() {
    this._ro?.disconnect();
  }

  /* The most lanes per row: the columns option (1–8), default 4. */
  _maxCols() {
    return Math.max(1, Math.min(8, Number(this._config.columns) || 4));
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const ls = lanes(this._hass, this._config);
    const [dry, humid] = this._config.humidity_thresholds || [20, 40];
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="label"><div class="slot"><ha-icon icon="mdi:tray-full"></ha-icon></div>
        <div class="lt"><div class="t">${esc(this._config.title ?? "MMU lanes")}</div><span class="s"></span></div></div>
      <div class="lanes" style="--cols:${this._maxCols()}">
        ${ls.map((l) => `<div class="lane" role="button" tabindex="0" data-n="${l.n}"><div class="lh"><span class="ln">${esc(l.name)}</span>
          <ha-icon class="dry" icon="mdi:fan" style="display:none"></ha-icon><ha-icon class="sp"></ha-icon></div><div class="lv"></div></div>`).join("")}
      </div>
      ${this._config.legend ? `<div class="legend"><span><ha-icon icon="mdi:circle-slice-8"></ha-icon>loaded</span>
        <span><ha-icon icon="mdi:circle-outline" style="color:${C.grey}"></ha-icon>empty</span>
        <span><em style="background:${C.green}"></em>&lt;${dry}% dry</span><span><em style="background:${C.amber}"></em>${dry}–${humid}% medium</span>
        <span><em style="background:${C.orange}"></em>&gt;${humid}% wet</span></div>` : ""}
    </ha-card>`;
    this._lanes = ls;
    // A reading opens its own sensor; the rest of the lane opens its humidity sensor.
    const open = (e) => {
      const v = e.target.closest("[data-e]");
      const lane = e.target.closest(".lane");
      const id = v ? v.dataset.e : lane && this._lanes[Number(lane.dataset.n)]?.more;
      if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
    };
    root.querySelector(".lanes").addEventListener("click", open);
    root.querySelector(".lanes").addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("lane")) {
        e.preventDefault();
        open(e);
      }
    });
    // Fit the columns to the names now, whenever the card resizes, and once the fonts have loaded.
    this._lanesEl = root.querySelector(".lanes");
    this._ro?.disconnect();
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this._fitLanes());
      this._ro.observe(this._lanesEl);
    }
    document.fonts?.ready?.then(() => this._fitLanes());
    this._built = true;
  }

  /* The lane grid's columns, so that every name stays whole on one line. A lane needs its name
     + 4px gap + 16px drying fan (reserved, so a fan starting never re-flows the grid) + 4px gap +
     18px status icon + 20px padding, or its widest reading + 20px. Even columns as wide as the
     widest lane: the columns option if they fit, else the most that fit (preferring a count that
     fills every row); if not even two fit, two columns each as wide as its own widest lane;
     else one, where only a name wider than the card wraps. Without layout (tests, a hidden tab)
     there is nothing to measure and the CSS default stands. */
  _fitLanes() {
    const box = this._lanesEl;
    if (!box || !box.isConnected) return;
    const W = box.clientWidth;
    const els = [...box.querySelectorAll(".lane")];
    if (!W || !els.length) return;
    box.classList.remove("wrap");
    const ws = els.map((el) => {
      const name = Math.ceil(el.querySelector(".ln").scrollWidth) + 62;
      const vals = Math.max(0, ...[...el.querySelectorAll(".lv .v")].map((v) => Math.ceil(v.scrollWidth))) + 20;
      return Math.max(name, vals);
    });
    const max = Math.max(...ws);
    const n = els.length;
    const most = this._maxCols();
    const fits = (c) => c * max + (c - 1) * 8 <= W;
    let c = fits(most) ? most : 0;
    for (let k = most - 1; !c && k >= 2; k--) if (fits(k) && n % k === 0) c = k;
    for (let k = most - 1; !c && k >= 2; k--) if (fits(k)) c = k;
    let cols;
    if (c >= 2) cols = `repeat(${c}, minmax(0, 1fr))`;
    else {
      const col = (k) => Math.max(0, ...ws.filter((_, i) => i % 2 === k));
      cols = n > 1 && most >= 2 && col(0) + col(1) + 8 <= W ? "repeat(2, minmax(max-content, 1fr))" : "minmax(0, 1fr)";
      box.classList.toggle("wrap", cols === "minmax(0, 1fr)" && max > W);
    }
    if (box.style.gridTemplateColumns !== cols) box.style.gridTemplateColumns = cols;
  }

  _render() {
    inkSchedule(this, ".lane, .lt");
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const ls = lanes(this._hass, this._config);
    this._lanes = ls;
    ls.forEach((l, i) => {
      const el = root.querySelectorAll(".lane")[i];
      if (!el) return;
      el.classList.toggle("empty", l.loaded === false);
      el.classList.toggle("unknown", l.loaded === null);
      const sp = el.querySelector(".sp");
      const icon = l.loaded === null ? "mdi:help-circle-outline" : l.loaded ? "mdi:circle-slice-8" : "mdi:circle-outline";
      if (sp.getAttribute("icon") !== icon) sp.setAttribute("icon", icon);
      el.querySelector(".dry").style.display = l.drying ? "" : "none";
      el.title = `${l.name}: ${l.loaded ? "loaded" : l.loaded === false ? "empty" : "?"}${l.drying ? `, drying (fan ${Math.round(l.fan)}%)` : ""}`;
      // Only touch the DOM when something changed, so a tap is never lost mid-update.
      const hum = l.h === null ? "–" : `${Math.round(l.h)}%`;
      const html =
        `<button class="v" data-e="${l.ids.humidity}"${l.tone ? ` style="color:${TEXT[l.tone]}"` : ""}><ha-icon icon="mdi:water-percent"${l.tone ? ` style="color:${C[l.tone]}"` : ""}></ha-icon>${hum}</button>` +
        `<button class="v" data-e="${l.ids.temp}"><ha-icon icon="mdi:thermometer"></ha-icon>${l.t === null ? "–" : `${l.t.toFixed(1)}°`}</button>`;
      // Compared with what was last written, not with innerHTML: the browser's serialisation (and
      // the ink alignment's margins on the icons) never matches the string, which rewrote the
      // readings on every update and lost taps mid-press.
      const lv = el.querySelector(".lv");
      if (lv.dataset.h !== html) {
        lv.innerHTML = html;
        lv.dataset.h = html;
      }
    });
    const loaded = ls.filter((l) => l.loaded).length;
    const sum = `${loaded} of ${ls.length} loaded`;
    const s = root.querySelector(".s");
    if (s.textContent !== sum) s.textContent = sum;
    root.querySelector(".lt").classList.toggle("one", !sum);
  }
}

async function registerMmuLanesCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(MLC_TAG)) return;
  registry.define(MLC_TAG, MmuLanesCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: MLC_TAG,
    name: "MMU lanes",
    description: "Happy Hare MMU lanes: filament loaded, humidity and temperature per lane, drying fans.",
  });
  console.info(`%c MMU-LANES-CARD %c ${MLC_VERSION} `, "background:#009688;color:#fff", "");
}

registerMmuLanesCard();
})();

/* ===== printer-status-card 1.7.3 ===== */
(() => {
/*
 * Printer status card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A Klipper / Moonraker printer at a glance: state and message, a power pill while
 * the plug is on (On and live watts – or just the watts, while an upstream plug that the
 * power sensor measures is on and the printer is off), the current job (thumbnail, progress, time left, finish time,
 * layer, filament, speed) or, when idle, today's energy and lifetime totals, your
 * camera card (only while the printer is reachable and the camera serves a picture), Power on
 * (plug off) or a safe Power off (idle), and an optional chamber light toggle (glows while
 * on; hold it for the light's more-info). Printer operations – homing, pause, resume,
 * cancel – are left to the printer itself on purpose. Power on, Power off and turning the
 * plug off always ask first (orange like the power pill; red only when cutting the plug would
 * end a print). Tap any value for its own more-info (the watts on the power pill too), or the
 * state circle for the printer's. Sensors are found from the Moonraker prefix (e.g. "voron").
 * Text is never cut off: names, file names and status lines wrap (status lines only between
 * their parts).
 * `layout: compact` is a one-row summary for an overview page (state, what matters now,
 * a progress bar while printing, live watts); a tap anywhere opens `navigation_path`.
 * See cards/printer-status-card/README.md for every option.
 */

const PSC_VERSION = "1.7.3";
const PSC_TAG = "printer-status-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  blue: "var(--blue-color, #2196f3)",
  amber: "var(--amber-color, #ffc107)",
  green: "var(--green-color, #4caf50)",
  red: "var(--red-color, #f44336)",
  orange: "var(--orange-color, #ff9800)",
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n, d = 0) => (n === null ? "–" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));

/* 1.383 h → "1 h 23 min", 0.75 h → "45 min", 3 h → "3 h" */
function dur(hours) {
  if (hours === null) return "–";
  const m = Math.max(0, Math.round(hours * 60));
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}
/* A clock time, en-GB: "15:42". */
const clock = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
/* A status line: each part stays whole (nowrap) and the line wraps only between parts, the dot
   staying with the part before it. A part is text, or {t, e} (opens entity e), or {t, free}
   (a file name, which may break anywhere). */
function line(list) {
  return list
    .map((p) => (typeof p === "string" ? { t: p } : p))
    .filter((p) => p && p.t)
    .map((p) => `<span class="${p.free ? "f" : "p"}"${p.e ? ` data-e="${esc(p.e)}"` : ""}>${esc(p.t)}</span>`)
    .join("&nbsp;· ");
}
/* "4825h 49m 38s" → 4826 */
function hoursFrom(text) {
  const t = String(text || "");
  const hh = t.match(/(\d+)\s*h/);
  const mm = t.match(/(\d+)\s*m/);
  if (!hh && !mm) return null; // "unavailable" while the printer boots or shuts down
  return Math.round(Number(hh?.[1] || 0) + Number(mm?.[1] || 0) / 60);
}

const STATES = {
  off: { word: "Off", color: C.grey, icon: "mdi:printer-3d-off" },
  ready: { word: "Ready", color: C.grey, icon: "mdi:printer-3d" },
  printing: { word: "Printing", color: C.blue, icon: "mdi:printer-3d-nozzle" },
  paused: { word: "Paused", color: C.amber, icon: "mdi:pause-circle-outline" },
  complete: { word: "Complete", color: C.green, icon: "mdi:check-circle-outline" },
  cancelled: { word: "Cancelled", color: C.grey, icon: "mdi:close-circle-outline" },
  error: { word: "Error", color: C.red, icon: "mdi:alert-circle-outline" },
  // Plug on but Klipper/Moonraker not answering: booting, or shutting down before the plug cuts.
  busy: { word: "Please wait", color: C.grey, icon: "mdi:timer-sand" },
};

/* Everything the card shows. */
function model(hass, cfg) {
  const p = cfg.prefix || "printer";
  const st = (id) => (id ? hass.states[id] : undefined);
  const s = (key) => st(`sensor.${p}_${key}`)?.state;
  const plug = st(cfg.power_switch);
  const plugOn = !plug || plug.state === "on";
  const job = String(s("current_print_state") || "").toLowerCase();
  const printer = String(s("printer_state") || "").toLowerCase();

  let key = "ready";
  if (!plugOn) key = "off";
  else if (["error", "shutdown"].includes(printer) || job === "error") key = "error";
  else if (["printing", "paused", "complete", "cancelled"].includes(job)) key = job;
  else if (!printer || printer === "unavailable" || printer === "unknown" || printer === "startup") key = "busy";
  // Why we are waiting: the safe power-off script is running, Klipper is starting, or no answer yet.
  const off = cfg.power_off_script && cfg.power_off_script.startsWith("script.") ? st(cfg.power_off_script) : undefined;
  const busyMsg = off?.state === "on" ? "Shutting down" : printer === "startup" ? "Klipper is starting" : "Waiting for the printer";

  const msg = [s("current_display_message"), s("printer_message")].find((x) => x && !["unknown", "unavailable"].includes(x)) || "";
  const watts = num(st(cfg.power_sensor)?.state);
  // The watts are live while the circuit the power sensor measures is on: normally the printer's
  // own plug, or an upstream plug (power_sensor_switch, e.g. a strip that also feeds a dryer and a
  // screen), whose reading is worth showing even while the printer itself is off.
  const meterOn = cfg.power_sensor_switch ? st(cfg.power_sensor_switch)?.state === "on" : plugOn;
  const eta = st(`sensor.${p}_print_eta`)?.state;
  const etaDate = eta && !["unknown", "unavailable"].includes(eta) ? new Date(eta) : null;
  return {
    key,
    state: STATES[key],
    // Off: the state word already says so ("Voron · Off"), so no line under it.
    message: !plugOn ? "" : key === "busy" ? busyMsg : msg,
    plug: plug ? { on: plugOn, watts, live: meterOn && watts !== null } : null,
    file: s("filename") && !["unknown", "unavailable"].includes(s("filename")) ? s("filename") : "",
    progress: num(s("progress")),
    left: num(s("print_time_left")),
    eta: etaDate && !isNaN(etaDate) ? clock(etaDate) : "",
    layer: num(s("current_layer")),
    layers: num(s("total_layer")),
    filament: num(s("filament_used")),
    speed: num(s("print_speed")),
    today: num(st(cfg.energy_today)?.state),
    jobs: num(s("totals_jobs")),
    hours: hoursFrom(s("totals_print_time")),
    km: num(s("totals_filament_used")) === null ? null : num(s("totals_filament_used")) / 1000,
    // The job's file in the address: the camera's token only rotates every 5 minutes and Safari
    // reuses a picture it has loaded for the same address, so a new job showed the last one's.
    thumb: (() => {
      const pic = st(cfg.thumbnail || `camera.${p}_thumbnail`)?.attributes?.entity_picture;
      const f = s("filename");
      if (!pic) return "";
      return f && !["unknown", "unavailable"].includes(f) ? `${pic}${pic.includes("?") ? "&" : "?"}v=${encodeURIComponent(f)}` : pic;
    })(),
    light: lightModel(st(cfg.light), cfg.light),
    // For the compact layout: when the last job ended, chamber temperature, MMU lanes loaded.
    ended: (() => {
      const t = st(`sensor.${p}_current_print_state`)?.last_changed;
      const d = t ? new Date(t) : null;
      return d && !isNaN(d) ? clock(d) : "";
    })(),
    chamber: num(st(cfg.chamber_sensor || `sensor.${p}_heater_chamber_temperature`)?.state),
    lanes: (() => {
      const entries = [];
      for (let n = 0; n < 32 && hass.states[`binary_sensor.${p}_mmu_entry_${n}`]; n++) entries.push(hass.states[`binary_sensor.${p}_mmu_entry_${n}`]);
      const known = entries.filter((e) => ["on", "off"].includes(e.state));
      return known.length ? { loaded: known.filter((e) => e.state === "on").length, total: entries.length } : null;
    })(),
  };
}

/* Compact layout: the state word, the line under it (status-line parts, see line()), and
   whether to show a progress bar. */
function compactText(m, cfg) {
  const file = { t: m.file.replace(/\.gcode$/i, ""), free: true };
  const pct = m.progress === null ? "" : ` ${Math.round(m.progress)}%`;
  const msg = { t: m.message, free: true };
  if (m.key === "printing" || m.key === "paused") {
    // The file gets its own line (it may wrap); the times stay together on the next one.
    return {
      word: `${m.state.word}${pct}`,
      line: [file],
      line2: [m.left === null ? "" : `${dur(m.left)} left`, m.eta ? `ends ${m.eta}` : ""],
      bar: true,
    };
  }
  if (m.key === "complete") return { word: m.state.word, line: [file, m.ended ? `finished ${m.ended}` : ""] };
  if (m.key === "cancelled") return { word: m.state.word, line: [file] };
  if (m.key === "off") return { word: m.state.word, line: [cfg.energy_today && m.today !== null ? `Today ${fmt(m.today, 2)} kWh` : ""] };
  if (m.key === "ready") {
    const bits = [m.chamber === null ? "" : `Chamber ${fmt(m.chamber)}°`, m.lanes ? `${m.lanes.loaded} of ${m.lanes.total} loaded` : ""].filter(Boolean);
    return { word: m.state.word, line: bits.length ? bits : [msg] };
  }
  return { word: m.state.word, line: [msg] };
}

/* Chamber light: a light / switch / input_boolean, or a 0–100 number (a Klipper output pin). */
function lightModel(s, id) {
  if (!s || ["unavailable", "unknown"].includes(s.state)) return null;
  const domain = String(id).split(".")[0];
  if (domain === "number" || domain === "input_number") {
    const v = num(s.state);
    const max = num(s.attributes?.max) || 100;
    return { on: (v || 0) > 0, level: v === null ? null : Math.round((v / max) * 100), value: v, max, numeric: true };
  }
  const b = num(s.attributes?.brightness);
  return { on: s.state === "on", level: s.state === "on" && b !== null ? Math.round((b / 255) * 100) : null, numeric: false };
}

/* Which power buttons fit the state: [key, label, icon]. Printer operations (home, pause,
   resume, cancel) are deliberately not here – they are done on the printer. Both power
   buttons are orange, like the power pill (orange means power). */
function actions(key) {
  if (key === "off") return [["poweron", "Power on", "mdi:power"]];
  if (["printing", "paused", "busy"].includes(key)) return [];
  return [["poweroff", "Power off", "mdi:power"]];
}

/* ------------------------------------------------------------------------ */
/* Confirmation dialog – same look as the other cards' dialogs              */
/* ------------------------------------------------------------------------ */

const DIALOG_CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); padding: 25px 18px 18px;
    border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .row { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; }
  /* The text sits under the title, starting on its line (8 + 42px glyph + 6px gap). No printer
     name: the dialog opens from the printer's own card. */
  .text { margin: 12px 0 0 56px; font-size: 15px; line-height: 21px; color: var(--secondary-text-color); }
  .buttons { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); display: grid; gap: 8px; }
  button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 56px; padding-left: 10px;
    border-radius: 28px; cursor: pointer; font-size: 16px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color); }
  button .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  button .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
  button.confirm { color: #fff; }
  button.confirm .glyph { background: rgba(255,255,255,.2); }
  button.confirm .glyph ha-icon { color: #fff; }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  button:active { filter: brightness(.92); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

function confirmDialog({ title, icon, color, text, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("psc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(icon)}" style="color:${color}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        <div class="text">${esc(text)}</div>
        <div class="buttons">
          <button class="confirm" style="background:${color}"><span class="glyph"><ha-icon icon="${esc(icon)}"></ha-icon></span>${esc(confirmLabel)}</button>
          <button class="cancel"><span class="glyph"><ha-icon icon="mdi:close"></ha-icon></span>Cancel</button>
        </div></div>`;
    const done = (ok) => {
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      resolve(ok);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        done(false);
      }
    };
    root.querySelector(".backdrop").addEventListener("click", () => done(false));
    root.querySelector(".cancel").addEventListener("click", () => done(false));
    root.querySelector(".confirm").addEventListener("click", () => done(true));
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
    root.querySelector(".confirm").focus();
  });
}

/* ------------------------------------------------------------------------ */

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  /* Compact layout (overview page): one row, icon and watts centred on the whole text block
     (which may wrap to two lines and carry a progress bar). The whole card is one tap target. */
  ha-card.compact { padding: 10px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  ha-card.compact:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
  .crow { display: flex; align-items: center; gap: 10px; }
  /* A job progress bar is 8px, here as on the full card. */
  .cbar { height: 8px; border-radius: 4px; margin-top: 6px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .08); overflow: hidden; }
  .cbar[hidden], .sc:empty { display: none; }
  .cbar i { display: block; height: 100%; border-radius: 4px; background: var(--c, ${C.blue}); transition: width 300ms; }
  .watts { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px 0 10px; border-radius: 18px;
    font-size: 13px; font-weight: 600; letter-spacing: .2px; white-space: nowrap;
    background: ${tint(C.orange, 18)}; color: color-mix(in srgb, ${C.orange} 70%, var(--primary-text-color)); }
  .watts[hidden] { display: none; }
  .watts ha-icon { --mdc-icon-size: 18px; color: ${C.orange}; }
  /* Printer off, upstream plug on: the reading stays, without the glow (glow means active). */
  .watts.off { background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--secondary-text-color); }
  .watts.off ha-icon { color: ${C.grey}; }
  /* Spacing follows Mushroom: content starts 10px from the card edge. */
  ha-card { padding: 10px; container-type: inline-size; }
  .head { display: flex; align-items: center; gap: 10px; padding: 0 0 10px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .shape ha-icon { --mdc-icon-size: 24px; }
  /* The state circle opens the printer's more-info, like the vacuum's (a tinted circle = tap target). */
  .head .shape { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .txt { flex: 1; min-width: 0; }
  /* Text is never cut off: a line too long for its box wraps instead. "Name · State" breaks only
     before the state word, the dot staying with the name. */
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .nm .st { font-weight: 400; color: var(--secondary-text-color); }
  .nm .w { white-space: nowrap; }
  /* Status lines wrap only between their parts ("1 h 23 min left" stays whole); a file name or a
     message may break anywhere. */
  .sc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  .p { white-space: nowrap; }
  .f { overflow-wrap: anywhere; }
  .pill { flex: none; display: inline-flex; align-items: stretch; height: 36px; border-radius: 18px;
    font-size: 13px; font-weight: 600; letter-spacing: .2px; white-space: nowrap;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--secondary-text-color); }
  .pill button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
    -webkit-tap-highlight-color: transparent; }
  .pill .tog { padding: 0 12px 0 10px; }
  .pill .w { padding: 0 14px 0 10px; border-left: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
  .pill[hidden], .pill button[hidden], .pill ha-icon[hidden] { display: none; }
  .pill .tog:has(+ .w[hidden]) { padding-right: 14px; }
  /* Watts only (printer off, upstream plug on): no toggle, so no divider; the plug glyph leads. */
  .pill .tog[hidden] + .w { border-left: none; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  .pill.on { background: ${tint(C.orange, 18)}; color: color-mix(in srgb, ${C.orange} 70%, var(--primary-text-color)); }
  .pill.on ha-icon { color: ${C.orange}; }
  [data-e] { cursor: pointer; }
  .jt [data-e], .txt [data-e] { border-radius: 4px; -webkit-tap-highlight-color: transparent; }
  /* The stats are split by straight 1px dividers (like the maintenance numbers): no radius on the
     cells, or their left borders curve. */
  .stats [data-e] { -webkit-tap-highlight-color: transparent; }
  [data-e]:active { filter: brightness(.85); }
  .job { display: flex; gap: 10px; margin: 0 0 10px; }
  .thumb { flex: 0 0 64px; height: 64px; border-radius: 10px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05);
    display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .thumb img { width: 100%; height: 100%; object-fit: contain; }
  .thumb ha-icon { --mdc-icon-size: 30px; color: ${C.grey}; }
  .jt { flex: 1; min-width: 0; }
  /* "62%" and the times beside it; on a narrow card the times move under it rather than being cut. */
  .pct { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 8px; font-size: 20px; line-height: 26px; font-weight: 600;
    color: var(--primary-text-color); }
  .pct .when { min-width: 0; font-size: 12px; line-height: 16px; font-weight: 400; letter-spacing: .4px; color: var(--secondary-text-color); }
  .pbar { height: 8px; border-radius: 4px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .08); margin: 4px 0 6px; overflow: hidden; }
  .pbar i { display: block; height: 100%; border-radius: 4px; transition: width 400ms; }
  .camera { margin: 0 0 10px; border-radius: 10px; overflow: hidden; }
  .camera:empty { display: none; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 0 10px; text-align: center; }
  .stats > button { all: unset; box-sizing: border-box; display: grid; min-width: 0; cursor: pointer; text-align: center;
    border-left: 1px solid var(--divider-color, rgba(0,0,0,.12)); -webkit-tap-highlight-color: transparent; }
  .stats > button:first-child { border-left: none; }
  .stats b { font-size: 14px; line-height: 20px; font-weight: 500; color: var(--primary-text-color); white-space: nowrap; }
  .stats span { font-size: 11px; line-height: 14px; letter-spacing: .4px; color: var(--secondary-text-color); overflow-wrap: break-word; padding: 0 4px; }
  /* Button row: equal widths while every label fits, a longer label takes what it needs, and only
     if the row can't hold them all does one wrap. */
  .acts { display: flex; flex-wrap: wrap; gap: 8px; }
  .acts:empty { display: none; }
  /* Primary pills: 36px, the height of the icon circle (one size for every main action). */
  .act { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: max-content; height: 36px; border-radius: 18px; padding: 0 14px 0 10px;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap;
    font-size: 13px; font-weight: 600; letter-spacing: .2px; color: var(--primary-text-color);
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); -webkit-tap-highlight-color: transparent; }
  .act ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  /* Power on and Power off: orange, like the power pill (orange means power). */
  .act.poweroff ha-icon, .act.poweron ha-icon { color: ${C.orange}; }
  /* Chamber light: glows while on, like a lit room on the lights card. */
  .act.light.on { background: ${tint(C.orange, 18)}; color: color-mix(in srgb, ${C.orange} 70%, var(--primary-text-color)); }
  .act.light.on ha-icon { color: ${C.orange}; }
  .act .lvl { font-weight: 400; opacity: .8; }
  .pill button:active, .act:active, .head .shape:active, .stats > button:active { filter: brightness(.92); }
  .pill button:focus-visible, .act:focus-visible, [data-e]:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
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

class PrinterStatusCard extends HTMLElement {
  static getStubConfig() {
    return { name: "Printer", prefix: "printer" };
  }

  static getConfigForm() {
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "name", selector: { text: {} } },
          { name: "prefix", required: true, selector: { text: {} } },
        ] },
        { type: "grid", name: "", schema: [
          { name: "layout", selector: { select: { mode: "dropdown", options: [
            { value: "full", label: "Full (job, camera, buttons)" }, { value: "compact", label: "Compact (one row for an overview)" }] } } },
          { name: "navigation_path", selector: { text: {} } },
        ] },
        { name: "power_switch", selector: { entity: { domain: ["switch", "input_boolean"] } } },
        { type: "grid", name: "", schema: [
          { name: "power_sensor", selector: { entity: { domain: "sensor", device_class: "power" } } },
          { name: "energy_today", selector: { entity: { domain: "sensor", device_class: "energy" } } },
        ] },
        { name: "power_sensor_switch", selector: { entity: { domain: ["switch", "input_boolean"] } } },
        { name: "power_off_script", selector: { entity: { domain: ["script", "button"] } } },
        { type: "grid", name: "", schema: [
          { name: "light", selector: { entity: { domain: ["light", "switch", "input_boolean", "number", "input_number"] } } },
          { name: "light_name", selector: { text: {} } },
        ] },
        { name: "camera_card", selector: { object: {} } },
        { name: "camera_entity", selector: { entity: { domain: "camera" } } },
      ],
      computeLabel: (s) =>
        ({
          name: "Name",
          prefix: "Moonraker prefix (e.g. voron)",
          layout: "Layout",
          navigation_path: "Compact: tap opens (e.g. /lovelace/voron)",
          power_switch: "Power plug",
          power_sensor: "Power (W)",
          power_sensor_switch: "Plug the power sensor measures (if upstream)",
          energy_today: "Energy today (kWh)",
          power_off_script: "Safe power-off script",
          camera_card: "Camera card (YAML)",
          camera_entity: "Camera to check (default: from the camera card)",
          light: "Chamber light",
          light_name: "Light button label",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          prefix: "Finds sensor.<prefix>_current_print_state, _printer_state, _progress, _filename …",
          camera_card: "Any card, shown inside this one, e.g. type: custom:frigate-card with your printer camera.",
          power_sensor_switch: "When the watts come from an upstream plug that also feeds other things (e.g. a strip), the watts show whenever it is on – even with the printer off. Default: the power plug.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.prefix) throw new Error("Set the Moonraker prefix (e.g. voron)");
    this._config = { ...config };
    this._built = false;
    this._cameraEl = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
    if (this._cameraEl) this._cameraEl.hass = hass;
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  _buildCompact() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><ha-card class="compact" role="button" tabindex="0">
      <div class="crow"><div class="shape"><ha-icon></ha-icon></div>
        <div class="txt"><div class="nm"></div><div class="sc"></div><div class="sc sc2"></div><div class="cbar" hidden><i></i></div></div>
        <span class="watts" hidden><ha-icon icon="mdi:power-plug"></ha-icon><span></span></span></div></ha-card>`;
    const card = root.querySelector("ha-card");
    const go = () => {
      const path = this._config.navigation_path;
      if (path) {
        history.pushState(null, "", path);
        this.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false }, bubbles: true, composed: true }));
      } else {
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: `sensor.${this._config.prefix}_current_print_state` }, bubbles: true, composed: true }));
      }
    };
    card.addEventListener("click", go);
    card.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go()));
    this._built = true;
  }

  _renderCompact(m) {
    const root = this.shadowRoot;
    const set = (sel, v, html = false) => {
      const n = root.querySelector(sel);
      if (n && (html ? n._h !== v : n.textContent !== v)) html ? ((n.innerHTML = v), (n._h = v)) : (n.textContent = v);
    };
    const shape = root.querySelector(".shape");
    shape.style.background = tint(m.state.color, 20);
    const ic = shape.querySelector("ha-icon");
    if (ic.getAttribute("icon") !== m.state.icon) ic.setAttribute("icon", m.state.icon);
    ic.style.color = m.state.color;
    const t = compactText(m, this._config);
    set(".nm", `${esc(this._config.name || "Printer")}<span class="st">&nbsp;· <span class="w">${esc(t.word)}</span></span>`, true);
    set(".sc:not(.sc2)", line(t.line), true);
    set(".sc2", line(t.line2 || []), true);
    const bar = root.querySelector(".cbar");
    bar.hidden = !t.bar;
    if (t.bar) {
      const w = `${Math.max(0, Math.min(100, m.progress || 0))}%`;
      if (bar.firstElementChild.style.width !== w) bar.firstElementChild.style.width = w;
      bar.style.setProperty("--c", m.state.color);
    }
    const watts = root.querySelector(".watts");
    const showW = !!m.plug?.live;
    watts.hidden = !showW;
    watts.classList.toggle("off", !m.plug?.on);
    if (showW) set(".watts span", `${fmt(m.plug.watts)} W`);
  }

  _build() {
    if (this._config.layout === "compact") return this._buildCompact();
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const stateId = `sensor.${esc(this._config.prefix)}_current_print_state`;
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="head"><div class="shape" data-e="${stateId}" role="button" tabindex="0" aria-label="Printer details"><ha-icon></ha-icon></div>
        <div class="txt" data-e="${stateId}" role="button" tabindex="0"><div class="nm"></div><div class="sc msg"></div></div>
        ${this._config.power_switch ? `<div class="pill"><button class="tog"><ha-icon icon="mdi:power-plug"></ha-icon><span></span></button><button class="w"${this._config.power_sensor ? ` data-e="${esc(this._config.power_sensor)}"` : ""}><ha-icon icon="mdi:power-plug" hidden></ha-icon><span></span></button></div>` : ""}</div>
      <div class="job"><div class="thumb" data-e="${esc(this._config.thumbnail || `camera.${this._config.prefix}_thumbnail`)}"><ha-icon icon="mdi:cube-outline"></ha-icon></div>
        <div class="jt"><div class="pct"></div><div class="pbar"><i></i></div><div class="sc l1"></div><div class="sc l2"></div></div></div>
      <div class="camera"></div>
      <div class="stats"></div>
      <div class="acts"></div></ha-card>`;
    root.querySelector(".pill .tog")?.addEventListener("click", () => this._togglePlug());
    // Any value opens its own entity.
    const card = root.querySelector("ha-card");
    const open = (e) => {
      const v = e.target.closest("[data-e]");
      if (v) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: v.dataset.e }, bubbles: true, composed: true }));
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".txt, .shape")) {
        e.preventDefault();
        open(e);
      }
    });
    this._built = true;
    this._actKeys = null;
    this._cameraEl = null;
  }

  /* The camera card is shown only while there is something to show: the printer is reachable
     (plug on and Moonraker's printer_state not unavailable) and the camera actually serves a
     picture. The camera entity's own state can't tell (it stays "idle" with the printer off),
     so the card asks Home Assistant for a still image: OK → show; error → hide. It re-checks
     every 15 s while hidden and every 60 s while shown. */
  _cameraEntity() {
    const c = this._config.camera_card || {};
    return this._config.camera_entity || c.camera_entity || c.entity || c.cameras?.[0]?.camera_entity || "";
  }

  _syncCamera(up) {
    if (!this._config.camera_card) return;
    if (!up) {
      this._feedOk = false;
      clearTimeout(this._probeTimer);
      this._probeTimer = null;
    } else if (!this._probeTimer && !this._probing) {
      this._probe();
    }
    const show = up && this._feedOk;
    if (show && !this._cameraEl && !this._cameraPending) this._mountCamera();
    if (!show && (this._cameraEl || this._cameraPending)) {
      this._cameraGen = (this._cameraGen || 0) + 1; // drop a mount still in flight
      this._cameraPending = false;
      this._cameraEl = null;
      this.shadowRoot.querySelector(".camera").replaceChildren();
    }
  }

  async _probe() {
    clearTimeout(this._probeTimer);
    this._probeTimer = null;
    this._probing = true;
    let ok = false;
    const id = this._cameraEntity();
    try {
      if (!id || typeof this._hass?.fetchWithAuth !== "function") ok = true; // nothing to test: trust the printer state
      else {
        const r = await this._hass.fetchWithAuth(`/api/camera_proxy/${id}?width=64&_=${Date.now()}`);
        ok = !!r && r.ok && String(r.headers?.get?.("content-type") || "image").startsWith("image");
      }
    } catch (e) {
      ok = false;
    }
    if (!this.isConnected || !this._printerUp) {
      this._probing = false;
      return;
    }
    this._feedOk = ok;
    // Schedule the next check before re-syncing, so the sync never starts a second probe.
    this._probeTimer = setTimeout(() => this._probe(), ok ? 60000 : 15000);
    this._probing = false;
    this._syncCamera(true);
  }

  disconnectedCallback() {
    clearTimeout(this._probeTimer);
    this._probeTimer = null;
  }

  async _mountCamera() {
    const cfg = this._config.camera_card;
    if (!cfg) return;
    const gen = (this._cameraGen = (this._cameraGen || 0) + 1);
    this._cameraPending = true;
    try {
      const helpers = await window.loadCardHelpers?.();
      if (!helpers || gen !== this._cameraGen) return;
      const el = helpers.createCardElement(cfg);
      el.hass = this._hass;
      this._cameraEl = el;
      this.shadowRoot.querySelector(".camera").replaceChildren(el);
    } catch (e) {
      /* camera card not available – the rest of the card works without it */
    } finally {
      if (gen === this._cameraGen) this._cameraPending = false;
    }
  }

  _render() {
    inkSchedule(this, ".txt, .jt");
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const m = model(this._hass, this._config);
    this._m = m;
    if (this._config.layout === "compact") return this._renderCompact(m);
    const set = (sel, v, html = false) => {
      const n = root.querySelector(sel);
      if (!n) return;
      if (html ? n._h !== v : n.textContent !== v) html ? ((n.innerHTML = v), (n._h = v)) : (n.textContent = v);
    };

    const shape = root.querySelector(".shape");
    shape.style.background = tint(m.state.color, 20);
    const ic = shape.querySelector("ha-icon");
    if (ic.getAttribute("icon") !== m.state.icon) ic.setAttribute("icon", m.state.icon);
    ic.style.color = m.state.color;
    // Name · state; on a narrow card the state word wraps whole, the dot staying with the name.
    set(".nm", `${esc(this._config.name || "Printer")}<span class="st">&nbsp;· <span class="w">${esc(m.state.word)}</span></span>`, true);
    const active = ["printing", "paused", "complete", "cancelled"].includes(m.key) && m.file;
    set(".msg", active ? m.file : m.message);

    const pill = root.querySelector(".pill");
    if (pill && m.plug) {
      // The toggle only while the plug is on (when it is off the Power on button below takes over);
      // the watts whenever they are live – with an upstream power_sensor_switch, also while the
      // printer is off, then on their own and without the glow.
      const tog = pill.querySelector(".tog");
      const w = pill.querySelector(".w");
      pill.hidden = !m.plug.on && !m.plug.live;
      pill.classList.toggle("on", m.plug.on);
      if (tog.hidden !== !m.plug.on) tog.hidden = !m.plug.on;
      if (w.hidden !== !m.plug.live) w.hidden = !m.plug.live;
      const wIcon = w.querySelector("ha-icon");
      if (wIcon.hidden !== m.plug.on) wIcon.hidden = m.plug.on;
      set(".pill .tog span", m.plug.on ? "On" : "Off");
      set(".pill .w span", m.plug.live ? `${fmt(m.plug.watts)} W` : "");
      tog.setAttribute("aria-pressed", String(m.plug.on));
    }

    // Current job (printing, paused, or the last one that finished).
    const job = root.querySelector(".job");
    job.style.display = active ? "" : "none";
    if (active) {
      const pct = m.progress === null ? 0 : Math.max(0, Math.min(100, m.progress));
      const p = this._config.prefix;
      const e = (key, t) => ({ t, e: `sensor.${p}_${key}` });
      // "1 h 23 min left · ends 15:42" while it runs ("ends", so a time is never read as done);
      // the state word once it has finished.
      const when =
        m.key === "complete" || m.key === "cancelled"
          ? [m.state.word]
          : [e("print_time_left", `${dur(m.left)} left`), m.eta ? e("print_eta", `ends ${m.eta}`) : ""];
      set(".pct", `${line([e("progress", `${fmt(pct)}%`)])}<span class="when">${line(when)}</span>`, true);
      const bar = root.querySelector(".pbar i");
      bar.style.width = `${pct}%`;
      bar.style.background = m.state.color;
      set(".l1", line([m.layers ? e("current_layer", `Layer ${fmt(m.layer)} / ${fmt(m.layers)}`) : "", m.filament !== null ? e("filament_used", `${fmt(m.filament, 1)} m filament`) : ""]), true);
      set(".l2", m.key === "printing" && m.speed !== null ? line([e("print_speed", `${fmt(m.speed)} mm/s`)]) : "", true);
      const thumb = root.querySelector(".thumb");
      if (m.thumb && thumb.dataset.src !== m.thumb) {
        thumb.dataset.src = m.thumb;
        thumb.innerHTML = `<img alt="" src="${esc(m.thumb)}">`;
        thumb.querySelector("img").addEventListener("error", () => (thumb.innerHTML = `<ha-icon icon="mdi:cube-outline"></ha-icon>`));
      }
    }

    // Idle: today's energy and lifetime totals.
    const stats = root.querySelector(".stats");
    stats.style.display = active ? "none" : "";
    if (!active) {
      const cells = [];
      const p = this._config.prefix;
      if (this._config.energy_today) cells.push([m.today === null ? "–" : `${fmt(m.today, 2)} kWh`, "Today", this._config.energy_today]);
      cells.push(
        [fmt(m.jobs), "Prints", `sensor.${p}_totals_jobs`],
        [m.hours === null ? "–" : `${fmt(m.hours)} h`, "Printed", `sensor.${p}_totals_print_time`],
        [m.km === null ? "–" : `${fmt(m.km, 1)} km`, "Filament", `sensor.${p}_totals_filament_used`],
      );
      stats.style.gridTemplateColumns = `repeat(${cells.length}, minmax(0, 1fr))`;
      set(".stats", cells.map(([b, s, id]) => `<button data-e="${esc(id)}"><b>${esc(b)}</b><span>${esc(s)}</span></button>`).join(""), true);
    }

    // Buttons for this state (rebuilt only when the set changes, so taps are never lost).
    // Printer reachable: plug on and Moonraker answering (printer_state not unavailable/unknown).
    const ps = String(this._hass.states[`sensor.${this._config.prefix}_printer_state`]?.state || "unavailable");
    this._printerUp = m.key !== "off" && !["unavailable", "unknown"].includes(ps);
    this._syncCamera(this._printerUp);
    const acts = actions(m.key).filter(([k]) => (k !== "poweroff" || this._config.power_off_script) && (k !== "poweron" || this._config.power_switch));
    if (m.light) acts.push(["light", "", ""]);
    const keys = acts.map((a) => a[0]).join();
    if (keys !== this._actKeys) {
      const box = root.querySelector(".acts");
      box.innerHTML = acts
        .map(([k, label, icon]) =>
          k === "light"
            ? `<button class="act light" data-k="light"><ha-icon></ha-icon><span class="lbl"></span></button>`
            : `<button class="act ${k}" data-k="${k}"><ha-icon icon="${icon}"></ha-icon>${esc(label)}</button>`,
        )
        .join("");
      box.querySelectorAll(".act").forEach((b) => (b.dataset.k === "light" ? this._bindLight(b) : b.addEventListener("click", () => this._action(b.dataset.k))));
      this._actKeys = keys;
    }

    // Chamber light: state, icon and label update in place.
    const lb = root.querySelector(".act.light");
    if (lb && m.light) {
      if (m.light.on && m.light.numeric && m.light.value > 0) this._lastLight = m.light.value;
      lb.classList.toggle("on", m.light.on);
      lb.setAttribute("aria-pressed", String(m.light.on));
      const icon = m.light.on ? "mdi:led-strip-variant" : "mdi:led-strip-variant-off";
      const ic = lb.querySelector("ha-icon");
      if (ic.getAttribute("icon") !== icon) ic.setAttribute("icon", icon);
      const name = esc(this._config.light_name || "Light");
      const lvl = m.light.on && m.light.level !== null && m.light.level < 100 ? ` <span class="lvl">${m.light.level}%</span>` : "";
      set(".act.light .lbl", `${name}${lvl}`, true);
    }
  }

  /* Tap toggles the light at once (no confirmation – it is harmless); hold opens its more-info. */
  _bindLight(b) {
    let timer = null;
    let held = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      held = false;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        held = true;
        this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: this._config.light }, bubbles: true, composed: true }));
      }, 500);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => b.addEventListener(t, cancel));
    b.addEventListener("contextmenu", (e) => e.preventDefault());
    b.addEventListener("touchend", (e) => held && e.preventDefault());
    b.addEventListener("click", () => {
      if (held) {
        held = false;
        return;
      }
      this._toggleLight();
    });
  }

  _toggleLight() {
    const id = this._config.light;
    const l = this._m?.light;
    if (!id || !l) return;
    const [domain] = id.split(".");
    const what = `turn ${l.on ? "off" : "on"} ${this._hass.states[id]?.attributes?.friendly_name || "the light"}`;
    if (l.numeric) {
      // A Klipper output pin: off is 0; on goes back to the last level seen, or light_on (default: full).
      const on = this._lastLight || num(this._config.light_on) || l.max;
      return this._call(domain, "set_value", { entity_id: id, value: l.on ? 0 : on }, what);
    }
    const svc = domain === "light" || domain === "switch" || domain === "input_boolean" ? domain : "homeassistant";
    return this._call(svc, l.on ? "turn_off" : "turn_on", { entity_id: id }, what);
  }

  /* Power on / Power off: orange both ways, like the power pill and the buttons. The dialog
     opens from the printer's own card, so it doesn't name the printer again. */
  async _action(k) {
    const name = this._config.name || "the printer";
    if (k === "poweron") {
      const ok = await confirmDialog({
        title: "Power on", icon: "mdi:power", color: C.orange,
        text: "The plug turns on and the printer starts up.", confirmLabel: "Power on",
      });
      if (!ok) return;
      const id = this._config.power_switch;
      const [domain] = id.split(".");
      return this._call(domain === "input_boolean" ? "input_boolean" : "switch", "turn_on", { entity_id: id }, `power on ${name}`);
    }
    if (k === "poweroff") {
      const ok = await confirmDialog({
        title: "Power off", icon: "mdi:power", color: C.orange,
        text: "The printer shuts down safely, then its plug turns off.", confirmLabel: "Power off",
      });
      if (ok) {
        const id = this._config.power_off_script;
        const [domain] = id.split(".");
        domain === "button"
          ? this._call("button", "press", { entity_id: id }, `power off ${name}`)
          : this._call("script", "turn_on", { entity_id: id }, `power off ${name}`);
      }
    }
  }

  /* Plug pill (shown only while on): off asks first – orange like the pill, red only while a
     print is running, because cutting the power would end it. */
  async _togglePlug() {
    const id = this._config.power_switch;
    const on = this._m?.plug?.on;
    const [domain] = id.split(".");
    if (!on) return this._action("poweron");
    const busy = ["printing", "paused"].includes(this._m.key);
    const ok = await confirmDialog({
      title: "Turn the plug off", icon: "mdi:power-plug-off", color: busy ? C.red : C.orange,
      text: busy
        ? "This ends the current print. The power goes at once, without a shutdown."
        : `The power goes at once, without a shutdown.${this._config.power_off_script ? " Power off shuts the printer down safely first." : ""}`,
      confirmLabel: "Turn off",
    });
    const plug = this._hass.states[id]?.attributes?.friendly_name || "the plug";
    if (ok) this._call(domain === "input_boolean" ? "input_boolean" : "switch", "turn_off", { entity_id: id }, `turn off ${plug}`);
  }

  /* HA's own message when it has one, else "Couldn't <what you tried>." – never an entity id. */
  async _call(domain, service, data, what = "do that") {
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || `Couldn't ${what}.` }, bubbles: true, composed: true }));
    }
  }
}

async function registerPrinterStatusCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(PSC_TAG)) return;
  registry.define(PSC_TAG, PrinterStatusCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: PSC_TAG,
    name: "Printer status",
    description: "Klipper / Moonraker printer: state, power, current job or totals, camera and controls.",
  });
  console.info(`%c PRINTER-STATUS-CARD %c ${PSC_VERSION} `, "background:#2196f3;color:#fff", "");
}

registerPrinterStatusCard();
})();

/* ===== printer-temps-card 1.2.1 ===== */
(() => {
/*
 * Printer temperatures card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Heaters (temperature, target, heater power – the tile glows while heating), other
 * temperature readings, and the fans (blue while running), for a Klipper / Moonraker
 * printer. The summary ("Heating", "At temperature", "All heaters off") sits under the
 * title. Sensors are found from the Moonraker prefix; every list can be overridden. Tap
 * any value (temperature, target, power, fan) for its own more-info. Names wrap, never cut.
 * See cards/printer-temps-card/README.md for every option.
 */

const PTC_VERSION = "1.2.1";
const PTC_TAG = "printer-temps-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  orange: "var(--orange-color, #ff9800)",
  blue: "var(--blue-color, #2196f3)",
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));

/* Moonraker names: sensor.<p>_<heater>_temperature, number.<p>_<heater>_target, sensor.<p>_<heater>_power. */
const DEFAULT_HEATERS = [
  { name: "Nozzle", heater: "extruder", icon: "mdi:printer-3d-nozzle-heat" },
  { name: "Bed", heater: "bed", icon: "mdi:radiator" },
  { name: "Chamber", heater: "heater_chamber", icon: "mdi:heat-wave" },
];
const DEFAULT_READINGS = [
  { name: "Build plate", sensor: "buildplate_temp", icon: "mdi:layers-outline" },
  { name: "Stepper body", sensor: "stepper_body_temp", icon: "mdi:engine-outline" },
  { name: "Toolhead board", sensor: "toolhead_board_temp", icon: "mdi:chip" },
];
const DEFAULT_FANS = [
  { name: "Part", entity: "number.{p}_fan_speed", icon: "mdi:fan" },
  { name: "Hotend", entity: "sensor.{p}_hotend_fan", icon: "mdi:fan" },
  { name: "Exhaust", entity: "sensor.{p}_exhaust_fan", icon: "mdi:fan-chevron-up" },
];

function heaters(hass, cfg) {
  const p = cfg.prefix;
  return (cfg.heaters || DEFAULT_HEATERS).map((h) => {
    const temp = h.temperature || `sensor.${p}_${h.heater}_temperature`;
    const target = h.target || `number.${p}_${h.heater}_target`;
    const power = h.power || `sensor.${p}_${h.heater}_power`;
    const t = num(hass.states[temp]?.state);
    const tg = num(hass.states[target]?.state);
    const pw = num(hass.states[power]?.state);
    const on = tg !== null && tg > 0;
    return { kind: "heater", name: h.name, icon: h.icon || "mdi:thermometer", entity: temp, target, power, t, tg, pw, on, missing: !hass.states[temp] };
  });
}

function readings(hass, cfg) {
  return (cfg.readings || DEFAULT_READINGS)
    .map((r) => {
      const id = r.entity || `sensor.${cfg.prefix}_${r.sensor}`;
      return { kind: "reading", name: r.name, icon: r.icon || "mdi:thermometer", entity: id, t: num(hass.states[id]?.state), missing: !hass.states[id] };
    })
    .filter((r) => !r.missing);
}

function fans(hass, cfg) {
  return (cfg.fans || DEFAULT_FANS)
    .map((f) => {
      const id = String(f.entity).replace("{p}", cfg.prefix);
      return { name: f.name, icon: f.icon || "mdi:fan", entity: id, v: num(hass.states[id]?.state), missing: !hass.states[id] };
    })
    .filter((f) => !f.missing);
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
     Mushroom icon sits), the 14px / 500 title at edge + 46 and the 12px summary under it on the
     same vertical line (ink-aligned, free to wrap). The icon is decorative, so no circle; it is
     grey, and orange while a heater is on (it shows that state). */
  .label { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 0 8px; }
  .slot { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
  .slot ha-icon { --mdc-icon-size: 24px; color: ${C.grey}; }
  .label.on .slot ha-icon { color: ${C.orange}; }
  .lt { flex: 1; min-width: 0; }
  .t { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .lt.one .t { position: relative; top: 1px; } /* alone, a 20px line reads ~1px high next to the icon */
  .s { display: block; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .s:empty { display: none; }
  .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 8px; }
  .tile { box-sizing: border-box; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px;
    padding: 11px 10px; border-radius: 10px; cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
    -webkit-tap-highlight-color: transparent; transition: background-color 180ms; }
  /* A heater that is on glows, like a lit room on the lights card. */
  .tile.on { background: ${tint(C.orange, 10)}; }
  .hh { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: ${tint(C.grey, 20)}; }
  .shape ha-icon { --mdc-icon-size: 24px; color: ${C.grey}; }
  .tile.on .shape { background: ${tint(C.orange, 20)}; }
  .tile.on .shape ha-icon { color: ${C.orange}; }
  .txt { flex: 1; min-width: 0; }
  /* A name too long for its tile wraps (tiles in a row stay level: grid-auto-rows 1fr). */
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  /* Wraps rather than overflowing on a narrow tile. */
  .val { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 4px; font-size: 12px; line-height: 16px; letter-spacing: .4px;
    color: var(--secondary-text-color); white-space: nowrap; }
  .val b { font-size: 14px; font-weight: 500; color: var(--primary-text-color); }
  .val [data-e], .pw { all: unset; cursor: pointer; border-radius: 4px; -webkit-tap-highlight-color: transparent; }
  .val [data-e]:active, .pw:active { filter: brightness(.85); }
  .val [data-e]:focus-visible, .pw:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Heater power sits at the end of its bar. */
  .br { display: flex; align-items: center; gap: 6px; }
  .br .bar { flex: 1; min-width: 0; }
  .pw { min-width: 30px; text-align: right; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; }
  .pw:empty { display: none; }
  .bar { height: 4px; border-radius: 2px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .08); overflow: hidden; }
  .bar i { display: block; height: 100%; background: ${C.orange}; border-radius: 2px; transition: width 400ms; }
  .fans { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 10px 0 0; font-size: 12px; line-height: 16px; letter-spacing: .4px;
    color: var(--secondary-text-color); }
  .fan { all: unset; display: inline-flex; align-items: center; gap: 3px; cursor: pointer; white-space: nowrap; border-radius: 4px; }
  .fan ha-icon { --mdc-icon-size: 16px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  /* A running fan is blue (something running). */
  .fan.on ha-icon { color: ${C.blue}; }
  .tile:active, .fan:active { filter: brightness(.92); }
  .tile:focus-visible, .fan:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

const deg = (v, d = 1) => (v === null ? "–" : `${v.toFixed(d)}°`);

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

class PrinterTempsCard extends HTMLElement {
  static getStubConfig() {
    return { prefix: "printer" };
  }

  static getConfigForm() {
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "prefix", required: true, selector: { text: {} } },
          { name: "title", selector: { text: {} } },
        ] },
        { name: "heaters", selector: { object: {} } },
        { name: "readings", selector: { object: {} } },
        { name: "fans", selector: { object: {} } },
      ],
      computeLabel: (s) =>
        ({ prefix: "Moonraker prefix (e.g. voron)", title: "Title", heaters: "Heaters (optional)", readings: "Other temperatures (optional)", fans: "Fans (optional)" })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          heaters: "Default: Nozzle (extruder), Bed (bed), Chamber (heater_chamber). List of {name, heater, icon} or {name, temperature, target, power}.",
          readings: "Default: Build plate, Stepper body, Toolhead board. List of {name, sensor} or {name, entity}.",
          fans: "Default: Part, Hotend, Exhaust. List of {name, entity}.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.prefix) throw new Error("Set the Moonraker prefix (e.g. voron)");
    this._config = { ...config };
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const items = [...heaters(this._hass, this._config).filter((h) => !h.missing), ...readings(this._hass, this._config)];
    const fl = fans(this._hass, this._config);
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="label"><div class="slot"><ha-icon icon="mdi:thermometer"></ha-icon></div>
        <div class="lt"><div class="t">${esc(this._config.title ?? "Temperatures")}</div><span class="s"></span></div></div>
      <div class="tiles">${items
        .map((it, i) => `<div class="tile ${it.kind}" role="button" tabindex="0" data-i="${i}"><div class="hh"><span class="shape"><ha-icon icon="${esc(it.icon)}"></ha-icon></span>
          <span class="txt"><div class="nm">${esc(it.name)}</div><div class="val"></div></span></div>${it.kind === "heater" ? `<div class="br"><div class="bar"><i></i></div><button class="pw" data-e="${esc(it.power)}"></button></div>` : ""}</div>`)
        .join("")}</div>
      <div class="fans">${fl.map((f, i) => `<button class="fan" data-i="${i}"><ha-icon icon="${esc(f.icon)}"></ha-icon><span></span></button>`).join("")}</div>
    </ha-card>`;
    this._items = items.map((it) => it.entity);
    this._fans = fl.map((f) => f.entity);
    // A value opens its own entity (temperature, target, power); the rest of the tile its temperature.
    const tiles = root.querySelector(".tiles");
    const open = (e) => {
      const v = e.target.closest("[data-e]");
      const tile = e.target.closest(".tile");
      this._more(v ? v.dataset.e : tile && this._items[Number(tile.dataset.i)]);
    };
    tiles.addEventListener("click", open);
    tiles.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("tile")) {
        e.preventDefault();
        open(e);
      }
    });
    root.querySelectorAll(".fan").forEach((b) => b.addEventListener("click", () => this._more(this._fans[Number(b.dataset.i)])));
    if (!fl.length) root.querySelector(".fans").style.display = "none";
    this._built = true;
  }

  _render() {
    inkSchedule(this, ".txt, .lt");
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const items = [...heaters(this._hass, this._config).filter((h) => !h.missing), ...readings(this._hass, this._config)];
    // Only touch the DOM when something changed, so a tap is never lost mid-update.
    const set = (n, v) => {
      // Compared with what was last written: innerHTML never serialises back to the same string
      // (and ink alignment adds margins), which rewrote the values on every update.
      if (n._h !== v) {
        n.innerHTML = v;
        n._h = v;
      }
    };
    root.querySelectorAll(".tile").forEach((el, i) => {
      const it = items[i];
      if (!it) return;
      el.classList.toggle("on", !!it.on);
      if (it.kind === "heater") {
        const tg = `<button data-e="${esc(it.target)}">${it.on ? `→ ${deg(it.tg, 0)}` : "Off"}</button>`;
        set(el.querySelector(".val"), `<button data-e="${esc(it.entity)}"><b>${deg(it.t)}</b></button>${tg}`);
        const pw = el.querySelector(".pw");
        const pwText = it.on && it.pw !== null ? `${Math.round(it.pw)}%` : "";
        if (pw.textContent !== pwText) pw.textContent = pwText;
        el.querySelector(".bar i").style.width = `${it.on && it.pw !== null ? Math.max(0, Math.min(100, it.pw)) : 0}%`;
      } else {
        set(el.querySelector(".val"), `<button data-e="${esc(it.entity)}"><b>${deg(it.t)}</b></button>`);
      }
    });
    fans(this._hass, this._config).forEach((f, i) => {
      const el = root.querySelectorAll(".fan")[i];
      if (!el) return;
      el.classList.toggle("on", (f.v || 0) > 0);
      const text = `${f.name} ${f.v === null ? "–" : Math.round(f.v)}%`;
      const sp = el.querySelector("span");
      if (sp.textContent !== text) sp.textContent = text;
    });
    const hs = items.filter((it) => it.kind === "heater");
    const on = hs.filter((h) => h.on);
    const sum = !on.length ? "All heaters off" : on.every((h) => h.t !== null && Math.abs(h.t - h.tg) <= 2) ? "At temperature" : "Heating";
    const sumEl = root.querySelector(".s");
    if (sumEl.textContent !== sum) sumEl.textContent = sum;
    root.querySelector(".lt").classList.toggle("one", !sum);
    // The label icon shows state only while a heater is on (orange); otherwise it is decoration (grey).
    root.querySelector(".label").classList.toggle("on", on.length > 0);
  }

  _more(entityId) {
    if (entityId) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }
}

async function registerPrinterTempsCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(PTC_TAG)) return;
  registry.define(PTC_TAG, PrinterTempsCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: PTC_TAG,
    name: "Printer temperatures",
    description: "Klipper / Moonraker heaters (temperature, target, power), other temperatures and fans.",
  });
  console.info(`%c PRINTER-TEMPS-CARD %c ${PTC_VERSION} `, "background:#ff9800;color:#fff", "");
}

registerPrinterTempsCard();
})();

/* ===== robot-vacuum-card 2.7.4 ===== */
(() => {
/*
 * Robot vacuum card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A Roborock (or similar) robot vacuum. The default layout: state and battery, what needs you
 * (dock tanks, errors), the job while it runs, a floor switch and the floor map (cropped to
 * the rooms, live while cleaning; a switch shows at once), the rooms in an even grid to build
 * a clean, a Cleaning mode tile, and the buttons for the state – Clean entire floor / Clean N rooms,
 * Pause, Resume, Dock – plus an optional Auto clean pill, and while the robot is docked the
 * dock's own jobs: Empty, Wash mop, Dry mop (glowing while they run). Every button asks first
 * except Pause.
 *
 * The Cleaning mode tile shows the current mode ("Vac & mop · Turbo · Intense mop") and opens
 * a sheet laid out like the Roborock app: Vac & mop / Mop / Vacuum tabs, then suction power,
 * scrub intensity & water flow, cleaning count and route as select buttons, offering only what
 * applies in that mode. The count is sent with the clean. `layout: mode` shows the same panel
 * as a card of its own.
 *
 * Everything is found from the vacuum entity's device (and its dock device), so the config
 * is one entity id. Rooms and their segment ids come from roborock.get_maps; a room clean is
 * vacuum.send_command app_segment_clean on the map that is loaded. Nothing blocks a clean
 * except the vacuum being offline. Tap any value for its own more-info.
 * See cards/robot-vacuum-card/README.md for every option.
 */

const RVC_VERSION = "2.7.4";
const RVC_TAG = "robot-vacuum-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  blue: "var(--blue-color, #2196f3)",
  teal: "var(--teal-color, #009688)",
  amber: "var(--amber-color, #ffc107)",
  green: "var(--green-color, #4caf50)",
  red: "var(--red-color, #f44336)",
  orange: "var(--orange-color, #ff9800)",
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const tx = (c, p = 70) => `color-mix(in srgb, ${c} ${p}%, var(--primary-text-color))`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n, d = 0) => (n === null ? "–" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));
const DEAD = ["unavailable", "unknown"];
// "main_brush_jammed" → "Main brush jammed"
const human = (s) => {
  const t = String(s || "").replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
};
// 1650 s → "28 min", 4300 s → "1 h 12 min"
function mins(sec) {
  if (sec === null) return "–";
  const m = Math.max(0, Math.round(sec / 60));
  // "45 min", "3 h", "1 h 5 min" – the same format on every card (design tokens → Text and formats).
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
}
// A past moment as "today 10:00", "yesterday 10:00", "Sat 10:00" or "10 Oct".
function when(iso, now = new Date()) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return "";
  const t = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  if (days <= 0) return `today ${t}`;
  if (days === 1) return `yesterday ${t}`;
  if (days < 7) return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${t}`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
// A duration sensor's value in seconds, whatever its unit.
function seconds(s) {
  const v = num(s?.state);
  if (v === null) return null;
  const u = String(s.attributes?.unit_of_measurement || "s");
  return v * ({ s: 1, min: 60, h: 3600, d: 86400 }[u] || 1);
}

/* ------------------------------------------------------------------------ */
/* Finding the entities: the vacuum's device, plus its dock device          */
/* ------------------------------------------------------------------------ */

// Per key: domain, translation keys (stable), device class, entity id suffixes (fallback).
const KEYS = {
  battery: { domain: "sensor", dc: "battery", main: true },
  charging: { domain: "binary_sensor", dc: "battery_charging", main: true },
  status: { domain: "sensor", tk: ["status"], sfx: ["_status"] },
  error: { domain: "sensor", tk: ["vacuum_error"], sfx: ["_vacuum_error"] },
  dock_error: { domain: "sensor", tk: ["dock_error"], sfx: ["_dock_error"] },
  dirty_box: { domain: "binary_sensor", tk: ["dirty_box_full", "dock_dirty_water_box"], sfx: ["_dirty_water_box"] },
  clean_box: { domain: "binary_sensor", tk: ["clean_box_empty", "dock_clean_water_box"], sfx: ["_clean_water_box"] },
  water_shortage: { domain: "binary_sensor", tk: ["water_shortage"], sfx: ["_water_shortage"] },
  mop_attached: { domain: "binary_sensor", tk: ["mop_attached"], sfx: ["_mop_attached"] },
  area: { domain: "sensor", tk: ["cleaning_area"], sfx: ["_cleaning_area"] },
  time: { domain: "sensor", tk: ["cleaning_time"], sfx: ["_cleaning_time"] },
  progress: { domain: "sensor", tk: ["clean_percent", "cleaning_progress"], sfx: ["_cleaning_progress"] },
  room: { domain: "sensor", tk: ["current_room"], sfx: ["_current_room"] },
  last_start: { domain: "sensor", tk: ["last_clean_start"], sfx: ["_last_clean_begin", "_last_clean_start"] },
  map_select: { domain: "select", tk: ["selected_map"], sfx: ["_selected_map"] },
  mode: { domain: "select", tk: ["cleaning_mode"], sfx: ["_cleaning_mode"] },
  mop_water: { domain: "select", tk: ["mop_intensity"], sfx: ["_mop_intensity"] },
  mop_route: { domain: "select", tk: ["mop_mode"], sfx: ["_mop_mode"] },
  drying: { domain: "sensor", tk: ["mop_drying_remaining_time"], sfx: ["_mop_drying_remaining_time"] },
  // The dock's own jobs, as switches that are on while each runs.
  empty_sw: { domain: "switch", tk: ["dust_emptying", "dock_dust_emptying"], sfx: ["_dust_emptying"] },
  wash_sw: { domain: "switch", tk: ["mop_washing", "dock_mop_washing"], sfx: ["_mop_washing"] },
  dry_sw: { domain: "switch", tk: ["mop_drying", "dock_mop_drying"], sfx: ["_mop_drying"] },
};

function deviceEntityIds(hass, vacuumId) {
  const reg = hass.entities || {};
  const devId = reg[vacuumId]?.device_id;
  if (!devId) {
    // No registry (old frontend): everything whose object id contains the vacuum's.
    const base = String(vacuumId).split(".")[1] || "";
    return { devId: null, ids: Object.keys(hass.states).filter((id) => base && id.split(".")[1].includes(base)) };
  }
  const devs = hass.devices || {};
  const dev = devs[devId] || {};
  const own = (dev.identifiers || []).map(([d, i]) => `${d}|${i}_dock`);
  const dockIds = Object.values(devs)
    .filter((d) => d.id !== devId && ((d.identifiers || []).some(([x, i]) => own.includes(`${x}|${i}`)) || (dev.name && d.name === `${dev.name} Dock`)))
    .map((d) => d.id);
  const ids = Object.values(reg)
    .filter((e) => e.device_id === devId || dockIds.includes(e.device_id))
    .map((e) => e.entity_id);
  return { devId, ids };
}

function discover(hass, cfg) {
  const reg = hass.entities || {};
  const { devId, ids } = deviceEntityIds(hass, cfg.entity);
  const found = {};
  for (const [k, spec] of Object.entries(KEYS)) {
    const own = cfg.entities?.[k];
    if (own) {
      found[k] = own;
      continue;
    }
    const cands = ids.filter((id) => id.startsWith(`${spec.domain}.`) && hass.states[id]);
    let hit = spec.tk ? cands.filter((id) => spec.tk.includes(reg[id]?.translation_key)) : [];
    if (!hit.length && spec.dc)
      hit = cands.filter((id) => hass.states[id].attributes?.device_class === spec.dc && (!spec.main || !devId || reg[id]?.device_id === devId));
    if (!hit.length && spec.sfx) hit = cands.filter((id) => spec.sfx.some((s) => id.endsWith(s)));
    // Shortest wins: _cleaning_time over _total_cleaning_time.
    if (hit.length) found[k] = hit.sort((a, b) => a.length - b.length)[0];
  }
  found.images = ids.filter((id) => id.startsWith("image.") && hass.states[id]);
  return found;
}

const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/* An image entity's picture with its version (the entity's state, when the picture last
   changed) in the address. The access token in entity_picture only rotates every 5 minutes, and
   Safari – the iOS app – hands back the picture it already has for an address it has loaded, so
   without the version a live map stood still until the page was reloaded. */
function pictureUrl(s) {
  const pic = s?.attributes?.entity_picture;
  if (!pic) return "";
  return `${pic}${pic.includes("?") ? "&" : "?"}v=${encodeURIComponent(s.state)}`;
}

function imageFor(hass, images, mapName) {
  if (!mapName) return images.length === 1 ? images[0] : null;
  const n = String(mapName).toLowerCase();
  return (
    images.find((id) => String(hass.states[id]?.attributes?.friendly_name || "").toLowerCase().endsWith(n)) ||
    images.find((id) => id.endsWith(`_${slug(mapName)}`)) ||
    null
  );
}

/* What a failed call says. Home Assistant's own message, except the integration's generic
   "Error while calling load_multi_map" (Roborock's command_failed), which names an internal
   command: it says what you tried instead. */
function errorText(err, what) {
  if (err?.translation_key === "command_failed") return `Couldn't ${what}: the robot didn't accept it.`;
  return err?.message || `Couldn't ${what}.`;
}

/* Room icons: your own (rooms: in the config), else the Home Assistant area with that name
   (or whose name is inside the room's, e.g. "Corridor" in "Upstairs Corridor"), else a guess. */
const ROOM_GUESS = [
  [/en.?suite|shower/i, "mdi:shower"],
  [/toilet|\bwc\b|cloak/i, "mdi:toilet"],
  [/bath/i, "mdi:bathtub"],
  [/kitchen/i, "mdi:countertop"],
  [/living|lounge|sitting/i, "mdi:sofa"],
  [/dining/i, "mdi:silverware-fork-knife"],
  [/study|office/i, "mdi:chair-rolling"],
  [/corridor|hall|landing|stair/i, "mdi:stairs"],
  [/bed/i, "mdi:bed"],
  [/utility|laundry/i, "mdi:washing-machine"],
];
function roomIcon(hass, cfg, name) {
  const own = cfg.rooms?.[name]?.icon;
  if (own) return own;
  const n = String(name).toLowerCase();
  const areas = Object.values(hass.areas || {}).filter((a) => a?.name && a.icon);
  const exact = areas.find((a) => a.name.toLowerCase() === n);
  if (exact) return exact.icon;
  const inside = areas.filter((a) => n.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(n)).sort((a, b) => b.name.length - a.name.length)[0];
  if (inside) return inside.icon;
  return (ROOM_GUESS.find(([re]) => re.test(name)) || [, "mdi:floor-plan"])[1];
}

/* ------------------------------------------------------------------------ */
/* State                                                                    */
/* ------------------------------------------------------------------------ */

const STATES = {
  docked: { word: "Docked", color: C.grey, icon: "mdi:robot-vacuum" },
  cleaning: { word: "Cleaning", color: C.blue, icon: "mdi:robot-vacuum" },
  returning: { word: "Returning", color: C.blue, icon: "mdi:robot-vacuum" },
  paused: { word: "Paused", color: C.amber, icon: "mdi:robot-vacuum" },
  idle: { word: "Idle", color: C.grey, icon: "mdi:robot-vacuum" },
  error: { word: "Error", color: C.red, icon: "mdi:robot-vacuum-alert" },
  needs: { word: "Needs you", color: C.red, icon: "mdi:robot-vacuum-alert" },
  offline: { word: "Offline", color: C.grey, icon: "mdi:robot-vacuum-off" },
};
const BUSY = ["cleaning", "returning", "paused"];
/* The robot busy with the dock: it refuses to change maps until it has finished. */
const DOCK_BUSY = ["emptying_the_bin", "washing_the_mop", "going_to_wash_the_mop", "back_to_dock_washing_duster", "returning_home",
  "docking", "attaching_the_mop", "detaching_the_mop"];
const STATUS_LINE = {
  washing_the_mop: "Washing the mop",
  going_to_wash_the_mop: "Going to wash the mop",
  emptying_the_bin: "Emptying the bin",
  returning_home: "Returning to the dock",
  docking: "Returning to the dock",
  back_to_dock_washing_duster: "Returning to wash the mop",
  mapping: "Mapping",
  attaching_the_mop: "Attaching the mop",
  detaching_the_mop: "Detaching the mop",
  going_to_target: "Going to the spot",
  air_drying_stopping: "Drying the mop",
};
const DOCK_TEXT = {
  water_empty: "Dock: refill the clean water tank",
  waste_water_tank_full: "Dock: empty the dirty water tank",
  cleaning_tank_full_or_blocked: "Dock: the cleaning tray is full or blocked",
  dirty_tank_latch_open: "Dock: close the dirty water tank latch",
  no_dustbin: "Dock: the dust bag is missing",
  no_dustbin_or_filter: "Dock: the dust bag or filter is missing",
  duct_blockage: "Dock: the dust duct is blocked",
  maintenance_brush_jammed: "Dock: the maintenance brush is jammed",
};

function model(hass, cfg, found, maps, shownMap) {
  const v = hass.states[cfg.entity];
  const st = (k) => (found[k] ? hass.states[found[k]] : undefined);
  const s = (k) => st(k)?.state;
  const raw = v ? v.state : "unavailable";
  let key = DEAD.includes(raw) ? "offline" : STATES[raw] ? raw : "idle";

  // What needs you: errors and the dock's tanks. None of it blocks a clean.
  const msgs = [];
  if (key !== "offline") {
    const err = s("error");
    if (err && !["none", "ok", ...DEAD].includes(err)) msgs.push({ text: `Robot: ${human(err).toLowerCase()}`, e: found.error, c: C.red });
    const dock = s("dock_error");
    if (dock && !["ok", "none", ...DEAD].includes(dock)) msgs.push({ text: DOCK_TEXT[dock] || `Dock: ${human(dock).toLowerCase()}`, e: found.dock_error, c: C.red });
    if (s("dirty_box") === "on" && dock !== "waste_water_tank_full") msgs.push({ text: DOCK_TEXT.waste_water_tank_full, e: found.dirty_box, c: C.red });
    if (s("clean_box") === "on" && dock !== "water_empty") msgs.push({ text: DOCK_TEXT.water_empty, e: found.clean_box, c: C.red });
    if (s("water_shortage") === "on") msgs.push({ text: "Robot: the water tank is low", e: found.water_shortage, c: C.red });
    const mode = s("mode");
    if (s("mop_attached") === "off" && mode && mode !== "vacuum" && !DEAD.includes(mode))
      msgs.push({ text: "The mop isn't attached, so it will only vacuum", e: found.mop_attached, c: C.amber });
  }
  if (msgs.some((m) => m.c === C.red) && ["docked", "idle"].includes(key)) key = "needs";

  const battery = num(s("battery") ?? v?.attributes?.battery_level);
  const charging = s("charging") === "on" || String(s("status")) === "charging";
  const status = String(s("status") || "");
  const room = DEAD.includes(s("room")) ? "" : s("room") || "";

  // The line under the name.
  let line = [];
  if (key === "offline") line = [{ t: "Can't reach the vacuum" }];
  else if (key === "cleaning")
    line = [{ t: STATUS_LINE[status] || (room ? `Cleaning ${room}` : "Cleaning"), e: STATUS_LINE[status] ? found.status : found.room }];
  else if (key === "returning") line = [{ t: "Returning to the dock", e: found.status }];
  else if (key === "paused") line = [{ t: room ? `Paused in ${room}` : "Paused", e: found.room }];
  else if (key === "error") line = msgs.length ? [] : [{ t: human(status) || "Error", e: found.status }];
  else {
    const dry = seconds(st("drying"));
    if (dry) line = [{ t: `Drying the mop · ${mins(dry)} left`, e: found.drying }];
    else {
      const last = when(s("last_start"));
      if (last) {
        line.push({ t: `Last clean ${last}`, e: found.last_start });
        const a = num(s("area"));
        if (a !== null) line.push({ t: `${fmt(a, 1)} m²`, e: found.area });
        const tm = seconds(st("time"));
        if (tm !== null) line.push({ t: mins(tm), e: found.time });
      } else if (key === "idle") line = [{ t: "Away from the dock", e: found.status }];
    }
  }

  const mapNames = st("map_select")?.attributes?.options || (maps || []).map((m) => m.name);
  // The floor shown: the robot's loaded map, or the one just picked until the robot confirms it.
  const selMap = shownMap ?? s("map_select");
  const mapName = selMap && !DEAD.includes(selMap) ? selMap : maps?.length === 1 ? maps[0].name : "";
  const map = (maps || []).find((m) => m.name === mapName) || (maps?.length === 1 ? maps[0] : null);
  const img = imageFor(hass, found.images || [], mapName);
  const imgState = img ? hass.states[img] : null;

  return {
    key,
    state: STATES[key],
    name: cfg.name || v?.attributes?.friendly_name || "Vacuum",
    msgs,
    line,
    battery,
    charging,
    progress: num(s("progress")),
    area: num(s("area")),
    time: seconds(st("time")),
    room,
    floors: mapNames.length > 1 ? mapNames : [],
    dockBusy: DOCK_BUSY.includes(status) || ["empty_sw", "wash_sw"].some((k) => s(k) === "on"),
    mapName,
    rooms: map ? map.rooms.filter((r) => !cfg.rooms?.[r.name]?.hide) : [],
    image: pictureUrl(imgState) ? { id: img, url: pictureUrl(imgState) } : null,
    mode: s("mode"),
    fan: v?.attributes?.fan_speed,
    water: s("mop_water"),
    route: s("mop_route"),
    auto: cfg.auto_clean ? hass.states[cfg.auto_clean] : null,
  };
}

/* ------------------------------------------------------------------------ */
/* Cleaning mode: laid out like the Roborock app (without Customize)        */
/* ------------------------------------------------------------------------ */

const OPT_LABEL = { vac_and_mop: "Vac & mop", max_plus: "Max+", deep_plus: "Deep+", smart_mode: "Smart" };
const optLabel = (o) => OPT_LABEL[o] || human(o);
// Tabs in the app's order.
const MODES = ["vac_and_mop", "mop", "vacuum"];
const ORDER = {
  fan: ["off", "quiet", "gentle", "balanced", "standard", "turbo", "strong", "max", "max_plus", "custom"],
  water: ["off", "low", "mild", "moderate", "medium", "standard", "high", "intense", "custom"],
  route: ["fast", "standard", "deep", "deep_plus", "custom"],
};
const FAN_ICON = { quiet: "mdi:weather-night", balanced: "mdi:fan-speed-1", turbo: "mdi:fan-speed-2", max: "mdi:fan-speed-3", max_plus: "mdi:weather-tornado" };
const WATER_ICON = { mild: "mdi:water-outline", standard: "mdi:water", intense: "mdi:water-plus" };
function offer(options, current, order) {
  const hide = ["custom", "off", "smart_mode"];
  const list = (options || []).filter((o) => !hide.includes(o) || o === current);
  return list.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
}
/* Route glyphs like the app's: a rounded square with the path the robot takes – an S for
   Fast, then three, four and five passes for Standard, Deep and Deep+. */
function routeSvg(k) {
  const passes = { standard: 3, deep: 4, deep_plus: 5 }[k];
  if (k !== "fast" && !passes) return "";
  let d;
  if (k === "fast") d = "M8 8.2h2.4c1.4 0 1.9.9 2.2 2.3l.8 3c.3 1.4.8 2.3 2.2 2.3H16";
  else {
    const x0 = 8, s = 8 / (passes - 1), r = s / 2, top = 8, bot = 16;
    d = `M${x0} ${bot}`;
    for (let i = 0; i < passes - 1; i++) {
      const nx = +(x0 + (i + 1) * s).toFixed(2);
      d += i % 2 === 0 ? ` V${+(top + r).toFixed(2)} A${+r.toFixed(2)} ${+r.toFixed(2)} 0 0 1 ${nx} ${+(top + r).toFixed(2)}` : ` V${+(bot - r).toFixed(2)} A${+r.toFixed(2)} ${+r.toFixed(2)} 0 0 0 ${nx} ${+(bot - r).toFixed(2)}`;
    }
    d += (passes - 1) % 2 === 0 ? ` V${bot}` : ` V${top}`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="${d}"/></svg>`;
}

/* Cleaning count (×1 / ×2) has no entity: the card keeps it per vacuum, shared by the mode
   panel and the Clean button (and remembered in this browser), and sends it with the clean. */
const COUNT = new Map();
const COUNT_CARDS = new Set();
function getCount(id) {
  if (!COUNT.has(id)) {
    let v = 1;
    try {
      v = Number(window.localStorage?.getItem(`robot-vacuum-card:count:${id}`)) || 1;
    } catch (e) {
      /* storage blocked: start at ×1 */
    }
    COUNT.set(id, v === 2 ? 2 : 1);
  }
  return COUNT.get(id);
}
function setCount(id, v) {
  COUNT.set(id, v);
  try {
    window.localStorage?.setItem(`robot-vacuum-card:count:${id}`, String(v));
  } catch (e) {
    /* fine: it still applies for this page */
  }
  for (const c of COUNT_CARDS) if (c._config?.entity === id) c._render();
}

/* ------------------------------------------------------------------------ */
/* Confirmation dialog – same look as the other cards' dialogs              */
/* ------------------------------------------------------------------------ */

const DIALOG_CSS = `
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); padding: 25px 18px 18px;
    border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .row { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; }
  /* The text sits under the title, starting on its line (8 + 42px glyph + 6px gap). No device
     name: the dialog opens from the vacuum's own card. */
  .text { margin: 12px 0 0 56px; font-size: 15px; line-height: 21px; color: var(--secondary-text-color); }
  .buttons { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); display: grid; gap: 8px; }
  button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 56px; padding-left: 10px;
    border-radius: 28px; cursor: pointer; font-size: 16px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color); }
  button .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  button .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
  button.confirm { color: #fff; }
  button.confirm .glyph { background: rgba(255,255,255,.2); }
  button.confirm .glyph ha-icon { color: #fff; }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  button:active { filter: brightness(.92); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

function confirmDialog({ title, icon, color, text, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("rvc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(icon)}" style="color:${color}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        <div class="text">${esc(text)}</div>
        <div class="buttons">
          <button class="confirm" style="background:${color}"><span class="glyph"><ha-icon icon="${esc(icon)}"></ha-icon></span>${esc(confirmLabel)}</button>
          <button class="cancel"><span class="glyph"><ha-icon icon="mdi:close"></ha-icon></span>Cancel</button>
        </div></div>`;
    const done = (ok) => {
      document.removeEventListener("keydown", onKey, true);
      host.remove();
      resolve(ok);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        done(false);
      }
    };
    root.querySelector(".backdrop").addEventListener("click", () => done(false));
    root.querySelector(".cancel").addEventListener("click", () => done(false));
    root.querySelector(".confirm").addEventListener("click", () => done(true));
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
    root.querySelector(".confirm").focus();
  });
}

/* Segmented selector (32px segments in a 38px track) and the mode rows' label + value line. */
const SEG_CSS = `
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); }
  .seg button { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: 0; min-height: 32px; padding: 0 6px; border-radius: 9px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; text-align: center; font-size: 12px; line-height: 16px; font-weight: 500;
    color: var(--secondary-text-color); overflow-wrap: break-word; -webkit-tap-highlight-color: transparent; }
  .seg button[aria-pressed="true"] { background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
  .seg button[disabled] { opacity: .45; cursor: default; }
  .seg button:active { filter: brightness(.92); }
  .seg button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .seg button ha-icon { --mdc-icon-size: 20px; }
  .seg button svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .seg[hidden] { display: none; }
  .set { display: grid; gap: 6px; }
  .k { font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color); }
  .k b { font-weight: 500; margin-left: 6px; color: ${tx(C.teal, 75)}; }
`;

/* The Cleaning mode sheet (Bubble look), holding the same panel as layout: mode. */
const MODE_SHEET_CSS = `
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
    padding: 25px 18px 18px; border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .row { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; }
  .tabs { margin-top: 18px; }
  .sets { margin-top: 14px; display: grid; gap: 12px; }
  .seg button { font-size: 13px; }
  .actions { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  .done { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 56px; width: 100%; padding-left: 10px;
    border-radius: 28px; cursor: pointer; font-size: 16px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color); }
  .done .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  .done .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
  .done:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .done:active { filter: brightness(.92); }
  ${SEG_CSS}
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

/* The dock's jobs: only while the robot is docked; each asks before it starts and before it
   stops (the user's choice). */
const JOBS = [
  ["empty_sw", "mdi:delete-empty-outline", "Empty", "Emptying"],
  ["wash_sw", "mdi:water-sync", "Wash mop", "Washing"],
  ["dry_sw", "mdi:fan", "Dry mop", "Drying"],
];
const DOCK_CONFIRM = {
  empty_sw: {
    start: { title: "Empty the bin", label: "Empty", text: "The dock empties the robot's dust bin into its bag now. It's loud for about half a minute." },
    stop: { title: "Stop emptying", label: "Stop emptying", text: "The dock stops now, so the robot's bin may not be fully empty." },
  },
  wash_sw: {
    start: { title: "Wash the mop", label: "Wash mop", text: "The dock washes the mop now, with clean water from its tank. The dirty water goes to the dirty tank." },
    stop: { title: "Stop washing", label: "Stop washing", text: "The dock stops now, so the mop may not be fully clean." },
  },
  dry_sw: {
    start: { title: "Dry the mop", label: "Dry mop", text: "The dock dries the mop now, for the drying time set in the Roborock app." },
    stop: { title: "Stop drying", label: "Stop drying", text: "The dock stops now, so the mop may stay damp." },
  },
};

/* ------------------------------------------------------------------------ */

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  /* Spacing follows Mushroom: content starts 10px from the card edge. */
  ha-card { padding: 10px; container-type: inline-size; }
  .body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .body > * { min-width: 0; }
  [hidden] { display: none !important; }
  .head { display: flex; align-items: center; gap: 10px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .shape ha-icon { --mdc-icon-size: 24px; }
  .txt { flex: 1; min-width: 0; cursor: pointer; }
  /* Text is never clipped: a line too long for its box wraps (between its parts) instead. */
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .nm .st { font-weight: 400; color: var(--secondary-text-color); }
  .nm .w { white-space: nowrap; }
  /* The line under the name may wrap, but only between its parts ("28 min" stays whole). */
  .sc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .sc:empty { display: none; }
  .sc .p { white-space: nowrap; }
  [data-e] { cursor: pointer; border-radius: 4px; -webkit-tap-highlight-color: transparent; }
  .sc [data-e]:active, .jt [data-e]:active { filter: brightness(.85); }
  /* Primary pills: 36px, the icon circle's height. */
  .pill { all: unset; box-sizing: border-box; flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; border-radius: 18px; padding: 0 14px 0 10px; font-size: 13px; font-weight: 600; letter-spacing: .2px; white-space: nowrap;
    cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--primary-text-color);
    -webkit-tap-highlight-color: transparent; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  .pill.batt { color: var(--secondary-text-color); }
  .pill.low { background: ${tint(C.red, 18)}; color: ${tx(C.red, 85)}; }
  .pill.on { background: ${tint(C.teal, 18)}; color: ${tx(C.teal)}; }
  .pill.on ha-icon { color: ${C.teal}; }
  .pill[disabled] { opacity: .45; cursor: default; }
  .msg { display: flex; align-items: center; gap: 8px; min-height: 30px; box-sizing: border-box; padding: 6px 10px; border-radius: 10px;
    font-size: 12px; line-height: 16px; letter-spacing: .3px; cursor: pointer; }
  .msg ha-icon { --mdc-icon-size: 16px; flex: none; }
  .msgs { display: grid; gap: 6px; }
  .msgs:empty { display: none; }
  .jt { min-width: 0; }
  .pct { font-size: 20px; line-height: 26px; font-weight: 600; color: var(--primary-text-color); white-space: nowrap; }
  .pct .when { font-size: 12px; font-weight: 400; letter-spacing: .4px; color: var(--secondary-text-color); margin-left: 8px; }
  .pbar { height: 8px; border-radius: 4px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .08); margin-top: 4px; overflow: hidden; }
  .pbar i { display: block; height: 100%; border-radius: 4px; transition: width 400ms; }
  ${SEG_CSS}
  .map { position: relative; border-radius: 10px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04); height: clamp(200px, 64cqw, 340px);
    display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: pointer; }
  .map canvas { display: block; }
  .map .loading { position: absolute; right: 8px; bottom: 8px; padding: 3px 8px; border-radius: 10px; font-size: 11px; line-height: 14px;
    letter-spacing: .4px; color: var(--secondary-text-color); background: var(--card-background-color, #fff); }
  /* Rooms: an even grid of secondary pills (30px). Every name stays whole on one line – the
     columns are set from the measured names (_fitRooms): even columns as wide as the longest
     name's pill; if only one would fit, two columns each as wide as its own longest name; else
     one. Only a name wider than the whole card wraps. */
  .rooms { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .rooms:empty { display: none; }
  .chip { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 6px; min-height: 30px; border-radius: 15px; padding: 0 12px 0 8px;
    font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .2px; white-space: nowrap; cursor: pointer; min-width: 0;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--primary-text-color); -webkit-tap-highlight-color: transparent; }
  .rooms.wrap .chip { white-space: normal; padding-top: 7px; padding-bottom: 7px; }
  .chip ha-icon { --mdc-icon-size: 16px; color: ${C.grey}; flex: none; }
  .chip.sel { background: ${tint(C.teal, 18)}; color: ${tx(C.teal)}; }
  .chip.sel ha-icon { color: ${C.teal}; }
  .chip.now { box-shadow: inset 0 0 0 1.5px ${tint(C.blue, 60)}; }
  .chip[aria-disabled="true"] { cursor: default; }
  .chip[disabled] { opacity: .45; cursor: default; }
  /* The card's main buttons (Clean, Auto clean, Pause, Dock…) are call-to-action pills: 44px,
     the biggest control on the card after the mode tile. Equal widths while every label fits; a
     longer label takes the width it needs, and only if a row can't hold them all does one wrap. */
  .acts { display: flex; flex-wrap: wrap; gap: 8px; }
  .acts .pill { flex: 1 1 0; min-width: max-content; height: 44px; border-radius: 22px; padding: 0 10px; gap: 8px; font-size: 14px; }
  .acts .pill ha-icon { --mdc-icon-size: 20px; }
  /* The one that sets the robot going (Clean / Resume) is filled blue: the card's main action at
     a glance, and unlike a state tint (Auto clean on, a running dock job) it never means "on". */
  .acts .pill.go { background: ${C.blue}; color: var(--text-primary-color, #fff); }
  .acts .pill.go ha-icon { color: var(--text-primary-color, #fff); }
  /* The dock's jobs are secondary: the card's footer – a full-width rule, then three quiet text
     buttons (grey 12px, no fill) split by short dividers. There while docked, never competing
     with Clean. The one that runs is tinted blue. */
  .jobs { display: flex; flex-wrap: wrap; margin: 0 -10px -10px; padding: 4px 6px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  .jobs:empty { display: none; }
  .jobs button { all: unset; box-sizing: border-box; position: relative; flex: 1 1 0; min-width: max-content; display: inline-flex; align-items: center; justify-content: center;
    gap: 6px; height: 36px; padding: 0 10px; border-radius: 8px; cursor: pointer; white-space: nowrap;
    font-size: 12px; font-weight: 500; letter-spacing: .2px; color: var(--secondary-text-color); -webkit-tap-highlight-color: transparent; }
  .jobs button + button::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 1px; background: var(--divider-color, rgba(0,0,0,.12)); }
  .jobs button.run::before, .jobs button.run + button::before { display: none; }
  .jobs ha-icon { --mdc-icon-size: 16px; color: ${C.grey}; }
  .jobs button.run { background: ${tint(C.blue, 18)}; color: ${tx(C.blue)}; }
  .jobs button.run ha-icon { color: ${C.blue}; }
  .jobs button[disabled] { opacity: .45; cursor: default; }
  .jobs button:active { background: rgba(var(--rgb-primary-text-color, 33,33,33), .06); }
  @media (hover: hover) { .jobs button:not([disabled]):hover { background: rgba(var(--rgb-primary-text-color, 33,33,33), .04); } }
  .jobs button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .acts:empty { display: none; }
  .pill.run { background: ${tint(C.blue, 18)}; color: ${tx(C.blue)}; }
  .pill.run ha-icon { color: ${C.blue}; }
  /* Mode panel: label row, tabs, then a label + value line over each selector (as in the app). */
  .label { display: flex; align-items: center; gap: 10px; min-height: 40px; }
  .slot { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
  .slot ha-icon { --mdc-icon-size: 24px; color: ${C.grey}; }
  .t { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); position: relative; top: 1px; }
  /* Cleaning mode tile: taller than the room pills, a tappable blue circle, two lines and a
     chevron – so it reads as "settings" and never as one more room. */
  .modetile { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 11px 10px; border-radius: 10px;
    cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04); -webkit-tap-highlight-color: transparent; }
  .modetile .shape { background: ${tint(C.teal, 20)}; }
  .modetile .shape ha-icon { color: ${C.teal}; }
  .modetile .chev { --mdc-icon-size: 20px; color: ${C.grey}; flex: none; }
  .modetile[disabled] { opacity: .45; cursor: default; }
  .modetile:active { filter: brightness(.92); }
  .modetile:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .pill:active, .chip:active, .shape:active { filter: brightness(.92); }
  .pill:focus-visible, .chip:focus-visible, .seg button:focus-visible, .shape:focus-visible, [data-e]:focus-visible, .msg:focus-visible, .map:focus-visible {
    outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

/* Ink alignment (design rule): every line of a text block starts on the title's vertical line,
   measured on ink rather than boxes (a leading "1" or an icon has its own side bearing). */
const INK = { ctx: undefined };
const inkCtx = () => {
  if (INK.ctx === undefined)
    INK.ctx = /jsdom/i.test(navigator.userAgent) ? null : document.createElement("canvas").getContext("2d");
  return INK.ctx;
};
const inkVisible = (el) => !el.hidden && getComputedStyle(el).display !== "none";
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
function inkText(node) {
  const ctx = inkCtx();
  if (!ctx) return null;
  const cs = getComputedStyle(node.parentElement);
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return -ctx.measureText(node.textContent.trim()[0]).actualBoundingBoxLeft;
}
const inkSet = (el, px) => {
  const v = Math.abs(px) > 0.2 ? `${px.toFixed(2)}px` : "";
  if (el.style.marginLeft !== v) el.style.marginLeft = v;
};
function inkAlign(blocks) {
  for (const b of blocks) {
    const lines = [...b.children].filter(inkVisible);
    const t = lines.length > 1 ? inkLead(lines[0]) : null;
    if (!t || !t.text) continue;
    const ref = inkText(t.text);
    if (ref === null) return;
    for (const line of lines.slice(1)) {
      const lead = inkLead(line);
      if (lead && lead.text) inkSet(line, ref - inkText(lead.text));
    }
  }
}
function inkSchedule(host, selector) {
  if (host._inkQueued) return;
  host._inkQueued = true;
  requestAnimationFrame(() => {
    host._inkQueued = false;
    if (host.shadowRoot) inkAlign(host.shadowRoot.querySelectorAll(selector));
  });
}

/* The floor map: the image entity's picture, cropped to what is drawn (Roborock maps come
   with wide transparent margins) and fitted into the box. Every floor's picture is loaded
   ahead, so switching floors repaints at once; a new picture replaces the old one only once
   it has loaded, so a live map never flickers. */
function cropBox(img) {
  const full = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  try {
    const s = Math.min(1, 320 / Math.max(full.w, full.h));
    const w = Math.max(1, Math.round(full.w * s));
    const h = Math.max(1, Math.round(full.h * s));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx) return full;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (d[(y * w + x) * 4 + 3] > 16) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) return full;
    const m = 3; // a little air around the rooms
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
    return { x: x0 / s, y: y0 / s, w: (x1 - x0 + 1) / s, h: (y1 - y0 + 1) / s };
  } catch (e) {
    return full; // a picture from another origin can't be read: show it whole
  }
}

const PENDING_MS = 45000; // how long a floor or setting change shows before the robot confirms it

class RobotVacuumCard extends HTMLElement {
  static getStubConfig(hass) {
    const v = Object.keys(hass?.states || {}).find((id) => id.startsWith("vacuum."));
    return { entity: v || "vacuum.robot" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "vacuum" } } },
        { type: "grid", name: "", schema: [
          { name: "layout", selector: { select: { mode: "dropdown", options: [
            { value: "full", label: "Vacuum (state, map, rooms, buttons)" }, { value: "mode", label: "Cleaning mode (like the Roborock app)" }] } } },
          { name: "name", selector: { text: {} } },
        ] },
        { name: "auto_clean", selector: { entity: { domain: ["automation", "input_boolean", "switch"] } } },
        { type: "grid", name: "", schema: [
          { name: "hide_map", selector: { boolean: {} } },
          { name: "hide_rooms", selector: { boolean: {} } },
          { name: "hide_mode", selector: { boolean: {} } },
          { name: "hide_dock_actions", selector: { boolean: {} } },
        ] },
        { name: "rooms", selector: { object: {} } },
      ],
      computeLabel: (s) =>
        ({
          entity: "Vacuum",
          layout: "Layout",
          name: "Name",
          auto_clean: "Auto clean (automation or switch)",
          hide_map: "Hide the map",
          hide_rooms: "Hide the rooms",
          hide_mode: "Hide the Cleaning mode tile",
          hide_dock_actions: "Hide Empty / Wash mop / Dry mop",
          rooms: "Rooms (YAML)",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          layout: "Cleaning mode shows the mode panel (also in the vacuum card's Cleaning mode sheet) as a card of its own.",
          auto_clean: "Shows an Auto clean pill that turns this on and off, glowing while it is on.",
          rooms: "Per room, by the robot's room name: icon, name and hide. E.g. En-suite Bathroom: { icon: mdi:shower }",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.entity || !String(config.entity).startsWith("vacuum.")) throw new Error("Set entity to your vacuum (vacuum.…)");
    this._config = { ...config };
    this._built = false;
    this._found = null;
    this._sel = new Set();
    this._pending = {};
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return this._config?.layout === "mode" ? 5 : 9;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    COUNT_CARDS.add(this);
    if (this._built && this._ro && this._mapEl) {
      this._ro.observe(this._mapEl);
      this._ro.observe(this._roomsEl);
    }
  }

  disconnectedCallback() {
    COUNT_CARDS.delete(this);
    this._ro?.disconnect();
    this._closeMode();
  }

  _more(id) {
    if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
  }

  /* A change shown before the robot confirms it: the floor, or a setting. */
  _pend(k, v) {
    this._pending[k] = { v, t: Date.now() };
  }
  _shown(k, actual) {
    const p = this._pending[k];
    if (!p) return actual;
    if (p.v === actual || Date.now() - p.t > PENDING_MS) {
      delete this._pending[k];
      return actual;
    }
    return p.v;
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    if (this._config.layout === "mode") {
      root.innerHTML = `<style>${CSS}</style><ha-card><div class="body">
        <div class="label"><div class="slot"><ha-icon icon="mdi:tune-variant"></ha-icon></div><span class="t">${esc(this._config.title || "Cleaning mode")}</span></div>
        <div class="seg tabs"></div><div class="sets body"></div></div></ha-card>`;
      root.querySelector("ha-card").addEventListener("click", (e) => this._clickMode(e));
      this._built = true;
      this._keys = {};
      return;
    }
    root.innerHTML = `<style>${CSS}</style><ha-card><div class="body">
      <div class="head"><div class="shape" role="button" tabindex="0" aria-label="Vacuum details"><ha-icon></ha-icon></div>
        <div class="txt" data-e="${esc(this._config.entity)}" role="button" tabindex="0"><div class="nm"></div><div class="sc line"></div></div>
        <button class="pill batt"><ha-icon></ha-icon><span></span></button></div>
      <div class="msgs"></div>
      <div class="jt" hidden><div class="pct"></div><div class="pbar"><i></i></div></div>
      <div class="seg floors" hidden></div>
      <div class="map" role="button" tabindex="0" aria-label="Map" hidden><canvas></canvas><span class="loading" hidden>Loading map…</span></div>
      <div class="rooms"></div>
      <button class="modetile" hidden aria-haspopup="dialog"><div class="shape"><ha-icon icon="mdi:tune-variant"></ha-icon></div>
        <div class="txt"><div class="nm">Cleaning mode</div><div class="sc mode-line"></div></div><ha-icon class="chev" icon="mdi:chevron-right"></ha-icon></button>
      <div class="acts"></div>
      <div class="jobs"></div></div></ha-card>`;
    const card = root.querySelector("ha-card");
    card.addEventListener("click", (e) => this._click(e));
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".txt, .shape, .map, .msg")) {
        e.preventDefault();
        this._click(e);
      }
    });
    this._mapEl = root.querySelector(".map");
    this._mapKey = null;
    this._imgs = {};
    this._roomsEl = root.querySelector(".rooms");
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver((es) => {
        for (const e of es) e.target === this._mapEl ? this._paintMap() : this._fitRooms();
      });
      this._ro.observe(this._mapEl);
      this._ro.observe(this._roomsEl);
    }
    document.fonts?.ready?.then(() => this._fitRooms());
    this._bindHold(root.querySelector(".acts"));
    this._built = true;
    this._keys = {};
  }

  _click(e) {
    const t = e.target;
    const tile = t.closest(".modetile");
    if (tile) {
      if (!tile.disabled) this._openMode();
      return;
    }
    if (t.closest(".shape")) return this._more(this._config.entity);
    const room = t.closest("[data-room]");
    if (room) {
      if (room.getAttribute("aria-disabled") === "true" || room.disabled) return;
      const id = Number(room.dataset.room);
      this._sel.has(id) ? this._sel.delete(id) : this._sel.add(id);
      return this._render();
    }
    const floor = t.closest("[data-floor]");
    if (floor) {
      if (floor.disabled || floor.getAttribute("aria-pressed") === "true") return;
      return this._switchFloor(floor.dataset.floor);
    }
    const job = t.closest("[data-job]");
    if (job) {
      if (!job.disabled) this._job(job.dataset.job);
      return;
    }
    const act = t.closest(".acts .pill");
    if (act) {
      if (act.disabled || this._held) {
        this._held = false;
        return;
      }
      return this._action(act.dataset.k);
    }
    if (t.closest(".map")) return this._more(this._m?.image?.id);
    if (t.closest(".batt")) return this._more(this._found.battery);
    const v = t.closest("[data-e]");
    if (v) this._more(v.dataset.e);
  }

  /* Hold the Auto clean pill for its more-info (a tap asks, then toggles it). */
  _bindHold(box) {
    let timer = null;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    box.addEventListener("pointerdown", (e) => {
      const b = e.target.closest(".pill[data-k='auto']");
      if (!b || (e.button !== undefined && e.button !== 0)) return;
      this._held = false;
      cancel();
      timer = setTimeout(() => {
        timer = null;
        this._held = true;
        this._more(this._config.auto_clean);
      }, 500);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => box.addEventListener(t, cancel));
    box.addEventListener("contextmenu", (e) => e.target.closest(".pill[data-k='auto']") && e.preventDefault());
    box.addEventListener("touchend", (e) => this._held && e.preventDefault());
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    if (!this._found || this._regRef !== hass.entities || !this._found.battery) {
      this._found = discover(hass, this._config);
      this._regRef = hass.entities;
    }
    if (this._config.layout === "mode") return this._paintMode(this.shadowRoot, this._keys);
    inkSchedule(this, ".txt");
    this._loadMaps();
    const selected = this._found.map_select ? hass.states[this._found.map_select]?.state : null;
    const shownMap = this._shown("floor", selected);
    const m = model(hass, this._config, this._found, this._maps, shownMap);
    this._m = m;
    const root = this.shadowRoot;
    const set = (sel, v, html = false) => {
      const n = root.querySelector(sel);
      if (n && (html ? n._h !== v : n.textContent !== v)) html ? ((n.innerHTML = v), (n._h = v)) : (n.textContent = v);
    };
    const offline = m.key === "offline";
    const busy = BUSY.includes(m.key);

    // Head: state circle, name · state, the line, battery.
    const shape = root.querySelector(".shape");
    shape.style.background = tint(m.state.color, 20);
    const ic = shape.querySelector("ha-icon");
    if (ic.getAttribute("icon") !== m.state.icon) ic.setAttribute("icon", m.state.icon);
    ic.style.color = m.state.color;
    // Name · state; on a narrow card the state wraps whole, the dot staying with the name.
    set(".nm", `${esc(m.name)}<span class="st">&nbsp;· <span class="w">${esc(m.state.word)}</span></span>`, true);
    // Each part stays whole ("28 min" never splits); the line breaks only between parts.
    set(".line", m.line.map((p) => `<span class="p"${p.e ? ` data-e="${esc(p.e)}"` : ""}>${esc(p.t)}</span>`).join("&nbsp;· "), true);
    const batt = root.querySelector(".batt");
    batt.hidden = m.battery === null;
    if (m.battery !== null) {
      const b = m.battery;
      const lvl = Math.max(10, Math.min(100, Math.round(b / 10) * 10));
      const icon = m.charging ? `mdi:battery-charging-${lvl === 100 ? 100 : lvl}` : lvl === 100 ? "mdi:battery" : `mdi:battery-${lvl}`;
      const bi = batt.querySelector("ha-icon");
      if (bi.getAttribute("icon") !== icon) bi.setAttribute("icon", icon);
      bi.style.color = b <= 15 ? C.red : b <= 30 ? C.amber : C.green;
      batt.classList.toggle("low", b <= 15 && !m.charging);
      set(".batt span", `${fmt(b)}%`);
    }

    // What needs you.
    const msgKey = m.msgs.map((x) => x.text + x.c).join("|");
    if (msgKey !== this._keys.msgs) {
      set(".msgs", m.msgs
        .map((x) => `<div class="msg" role="button" tabindex="0" data-e="${esc(x.e || "")}" style="background:${tint(x.c, 10)};color:${tx(x.c, 85)}">
          <ha-icon icon="mdi:alert-circle-outline" style="color:${x.c}"></ha-icon><span>${esc(x.text)}</span></div>`).join(""), true);
      this._keys.msgs = msgKey;
    }

    // The job: progress, time and area while cleaning or paused.
    const jt = root.querySelector(".jt");
    const showJob = (m.key === "cleaning" || m.key === "paused") && m.progress !== null;
    jt.hidden = !showJob;
    if (showJob) {
      const p = Math.max(0, Math.min(100, m.progress));
      const f = this._found;
      const e = (id, t) => (id ? `<span data-e="${esc(id)}">${esc(t)}</span>` : esc(t));
      const bits = [m.time !== null ? e(f.time, mins(m.time)) : "", m.area !== null ? e(f.area, `${fmt(m.area, 1)} m²`) : ""].filter(Boolean).join(" · ");
      set(".pct", `${e(f.progress, `${fmt(p)}%`)}<span class="when">${bits}</span>`, true);
      const bar = root.querySelector(".pbar i");
      bar.style.width = `${p}%`;
      bar.style.background = m.state.color;
    }

    // Floors (the robot's loaded map): only while it isn't on a job, at the dock included. A switch shows at once.
    const floors = root.querySelector(".floors");
    floors.hidden = !m.floors.length || busy || m.dockBusy || !this._found.map_select;
    if (!floors.hidden) {
      const fk = m.floors.join("|");
      if (fk !== this._keys.floors) {
        floors.innerHTML = m.floors.map((f) => `<button data-floor="${esc(f)}">${esc(f)}</button>`).join("");
        this._keys.floors = fk;
      }
      floors.querySelectorAll("button").forEach((b) => {
        const on = String(b.dataset.floor === m.mapName);
        if (b.getAttribute("aria-pressed") !== on) b.setAttribute("aria-pressed", on);
        b.disabled = offline;
      });
    }
    if (m.mapName !== this._lastMap) {
      this._sel.clear();
      this._lastMap = m.mapName;
    }

    // Map, with every floor's picture loaded ahead.
    this._preload();
    const map = root.querySelector(".map");
    map.hidden = !!this._config.hide_map || !m.image;
    if (!map.hidden) this._syncMap(m.image);
    map.querySelector(".loading").hidden = !this._pending.floor;

    // Rooms: tap to add to a clean. While a job runs they show where the robot is.
    const rooms = root.querySelector(".rooms");
    rooms.hidden = !!this._config.hide_rooms;
    if (!rooms.hidden) {
      const rk = m.rooms.map((r) => `${r.id}:${r.name}`).join("|");
      if (rk !== this._keys.rooms) {
        rooms.innerHTML = m.rooms
          .map((r) => `<button class="chip" data-room="${r.id}"><ha-icon></ha-icon><span>${esc(this._config.rooms?.[r.name]?.name || r.name)}</span></button>`)
          .join("");
        this._keys.rooms = rk;
        this._fitRooms();
      }
      for (const id of [...this._sel]) if (!m.rooms.some((r) => r.id === id)) this._sel.delete(id);
      rooms.querySelectorAll(".chip").forEach((b) => {
        const r = m.rooms.find((x) => String(x.id) === b.dataset.room);
        const on = this._sel.has(r.id) && !busy;
        b.classList.toggle("sel", on);
        b.classList.toggle("now", busy && !!m.room && r.name === m.room);
        b.setAttribute("aria-pressed", String(on));
        b.setAttribute("aria-disabled", String(busy));
        b.disabled = offline;
        const icon = on ? "mdi:check" : roomIcon(this._hass, this._config, r.name);
        const ri = b.querySelector("ha-icon");
        if (ri.getAttribute("icon") !== icon) ri.setAttribute("icon", icon);
      });
    }

    // Cleaning mode tile: what the next clean will use; a tap opens the app-style sheet.
    const tileEl = root.querySelector(".modetile");
    tileEl.hidden = !!this._config.hide_mode || (!this._found.mode && !hass.states[this._config.entity]?.attributes?.fan_speed_list);
    if (!tileEl.hidden) {
      set(".mode-line", this._modeParts().map((p) => `<span class="p">${esc(p)}</span>`).join("&nbsp;· "), true);
      tileEl.disabled = offline;
    }
    if (this._sheet) this._paintMode(this._sheet.root, this._sheet.keys);

    // Buttons for the state, rebuilt only when the set changes (taps are never lost).
    const n = this._sel.size;
    const acts = [];
    if (m.key === "cleaning") acts.push(["pause", "Pause", "mdi:pause", C.amber], ["dock", "Dock", "mdi:home-import-outline", C.grey]);
    else if (m.key === "paused") acts.push(["resume", "Resume", "mdi:play", C.blue], ["dock", "Dock", "mdi:home-import-outline", C.grey]);
    else if (m.key === "returning") acts.push(["pause", "Pause", "mdi:pause", C.amber]);
    else {
      acts.push(["clean", n ? `Clean ${n} room${n > 1 ? "s" : ""}` : "Clean entire floor", "mdi:play", C.blue]);
      // One control per job: Dock only while the robot is away from the dock.
      if (hass.states[this._config.entity]?.state !== "docked") acts.push(["dock", "Dock", "mdi:home-import-outline", C.grey]);
    }
    if (this._config.auto_clean) acts.push(["auto", this._config.auto_clean_name || "Auto clean", "mdi:account-arrow-right", null]);
    const ak = acts.map((a) => a[0]).join();
    const box = root.querySelector(".acts");
    if (ak !== this._keys.acts) {
      box.style.setProperty("--n", String(acts.length));
      box.innerHTML = acts
        .map(([k, , icon, color]) => {
          const go = k === "clean" || k === "resume";
          return `<button class="pill${go ? " go" : ""}" data-k="${k}"><ha-icon icon="${icon}"${color && !go ? ` style="color:${color}"` : ""}></ha-icon><span></span></button>`;
        })
        .join("");
      this._keys.acts = ak;
    }
    for (const [k, label] of acts) {
      const b = box.querySelector(`[data-k="${k}"]`);
      const sp = b.querySelector("span");
      if (sp.textContent !== label) sp.textContent = label;
      if (b.disabled !== offline) b.disabled = offline;
      if (k === "auto") {
        const on = m.auto?.state === "on";
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
        b.disabled = !m.auto || DEAD.includes(m.auto.state);
      }
    }

    // The dock's jobs, only while the robot is docked: Empty, Wash mop, Dry mop. Each glows while it
    // runs (e.g. after stopping a clean early with Dock).
    const jobsBox = root.querySelector(".jobs");
    const docked = hass.states[this._config.entity]?.state === "docked";
    const jobs = docked && !this._config.hide_dock_actions ? JOBS.filter(([k]) => this._found[k] && hass.states[this._found[k]]) : [];
    const jk = jobs.map((j) => j[0]).join();
    if (jk !== this._keys.jobs) {
      jobsBox.style.setProperty("--n", String(jobs.length || 1));
      jobsBox.innerHTML = jobs.map(([k, icon]) => `<button data-job="${k}"><ha-icon icon="${icon}"></ha-icon><span></span></button>`).join("");
      this._keys.jobs = jk;
    }
    for (const [k, , idle, running] of jobs) {
      const b = jobsBox.querySelector(`[data-job="${k}"]`);
      const s = hass.states[this._found[k]]?.state;
      const on = s === "on";
      const sp = b.querySelector("span");
      const label = on ? running : idle;
      if (sp.textContent !== label) sp.textContent = label;
      b.classList.toggle("run", on);
      b.setAttribute("aria-pressed", String(on));
      b.disabled = DEAD.includes(s);
    }
  }

  /* The room grid's columns, so that every name fits on one line. A pill is its text + 8px +
     16px icon + 6px gap + 12px. Even columns (at least 150px) as wide as the longest pill while
     two or more fit; else two columns each as wide as its own longest pill (the rest shared
     out evenly); else one column – where only a name wider than the card wraps. */
  _fitRooms() {
    const rooms = this._roomsEl;
    if (!rooms || rooms.hidden) return;
    const W = rooms.clientWidth;
    const spans = [...rooms.querySelectorAll(".chip span")];
    if (!W || !spans.length) return;
    rooms.classList.remove("wrap");
    const ws = spans.map((s) => Math.ceil(s.scrollWidth) + 43);
    const max = Math.max(150, ...ws);
    let cols;
    if (2 * max + 8 <= W) cols = `repeat(auto-fill, minmax(${max}px, 1fr))`;
    else {
      const col = (k) => Math.max(0, ...ws.filter((_, i) => i % 2 === k));
      cols = ws.length > 1 && col(0) + col(1) + 8 <= W ? "repeat(2, minmax(max-content, 1fr))" : "minmax(0, 1fr)";
      rooms.classList.toggle("wrap", cols === "minmax(0, 1fr)" && max > W);
    }
    if (rooms.style.gridTemplateColumns !== cols) rooms.style.gridTemplateColumns = cols;
  }

  async _job(k) {
    const id = this._found[k];
    const on = this._hass.states[id]?.state === "on";
    const c = DOCK_CONFIRM[k]?.[on ? "stop" : "start"];
    const icon = JOBS.find((j) => j[0] === k)?.[1] || "mdi:robot-vacuum";
    // The dialog takes the colour of the button you tapped (a job glows blue while it runs).
    if (c && !(await this._ask(c.title, on ? "mdi:stop-circle-outline" : icon, C.blue, c.text, c.label))) return;
    return this._call("switch", on ? "turn_off" : "turn_on", { entity_id: id }, `${on ? "stop" : "start"} the dock`);
  }

  /* ---- Cleaning mode panel (layout: mode) ---- */

  _modeRows() {
    const hass = this._hass;
    const f = this._found;
    const st = (id) => (id ? hass.states[id] : undefined);
    const v = st(this._config.entity);
    const live = (k, x) => this._shown(k, DEAD.includes(x) ? null : x ?? null);
    const mode = live("mode", st(f.mode)?.state);
    const fan = live("fan", v?.attributes?.fan_speed);
    const water = live("water", st(f.mop_water)?.state);
    const route = live("route", st(f.mop_route)?.state);
    const rows = [];
    // Suction for Vacuum and Vac & mop (Max+ only in Vacuum); scrub & water for Mop and Vac & mop;
    // Fast and Standard routes always, Deep and Deep+ only in Mop – as in the Roborock app.
    if (v?.attributes?.fan_speed_list && mode !== "mop")
      rows.push({ k: "fan", label: "Suction power", cur: fan, icons: FAN_ICON,
        opts: offer(v.attributes.fan_speed_list, fan, ORDER.fan).filter((o) => o !== "max_plus" || mode === "vacuum" || o === fan) });
    if (st(f.mop_water) && mode !== "vacuum")
      rows.push({ k: "water", label: "Scrub intensity & water flow", cur: water, icons: WATER_ICON, opts: offer(st(f.mop_water).attributes?.options, water, ORDER.water) });
    rows.push({ k: "count", label: "Cleaning count", cur: String(getCount(this._config.entity)), opts: ["1", "2"], text: (o) => `×${o}`,
      value: (o) => `${o} time${o === "1" ? "" : "s"}` });
    if (st(f.mop_route))
      rows.push({ k: "route", label: "Route", cur: route, svg: true,
        opts: offer(st(f.mop_route).attributes?.options, route, ORDER.route).filter((o) => !["deep", "deep_plus"].includes(o) || mode === "mop" || o === route) });
    return { mode, rows };
  }

  _paintMode(root, keys) {
    const hass = this._hass;
    const f = this._found;
    const v = hass.states[this._config.entity];
    const offline = !v || DEAD.includes(v.state);
    const modeEnt = f.mode ? hass.states[f.mode] : null;
    const { mode, rows } = this._modeRows();

    const tabs = root.querySelector(".tabs");
    const modes = MODES.filter((x) => (modeEnt?.attributes?.options || []).includes(x));
    tabs.hidden = !modes.length;
    const tk = modes.join();
    if (tk !== keys.tabs) {
      tabs.innerHTML = modes.map((x) => `<button data-set="mode" data-v="${x}">${esc(optLabel(x))}</button>`).join("");
      keys.tabs = tk;
    }
    tabs.querySelectorAll("button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.v === mode));
      b.disabled = offline;
    });

    const box = root.querySelector(".sets");
    const rk = rows.map((r) => `${r.k}:${r.opts.join(",")}`).join("|");
    if (rk !== keys.rows) {
      box.innerHTML = rows
        .map((r) => `<div class="set" data-k="${r.k}"><div class="k">${esc(r.label)}<b></b></div><div class="seg">${r.opts
          .map((o) => {
            const label = r.text ? r.text(o) : optLabel(o);
            const inner = r.icons?.[o] ? `<ha-icon icon="${r.icons[o]}"></ha-icon>` : r.svg && routeSvg(o) ? routeSvg(o) : esc(label);
            return `<button data-set="${r.k}" data-v="${esc(o)}" title="${esc(label)}" aria-label="${esc(label)}">${inner}</button>`;
          }).join("")}</div></div>`)
        .join("");
      keys.rows = rk;
    }
    for (const r of rows) {
      const sect = box.querySelector(`[data-k="${r.k}"]`);
      const val = r.cur === null || r.cur === undefined ? "" : r.value ? r.value(r.cur) : optLabel(r.cur);
      const b = sect.querySelector(".k b");
      if (b.textContent !== val) b.textContent = val;
      sect.querySelectorAll("button").forEach((x) => {
        x.setAttribute("aria-pressed", String(x.dataset.v === r.cur));
        x.disabled = offline && r.k !== "count";
      });
    }
  }

  /* "Vac & mop · Turbo · Intense mop", plus "· ×2" – what the tile says. */
  _modeSummary() {
    return this._modeParts().join(" · ");
  }

  _modeParts() {
    const { mode, rows } = this._modeRows();
    const cur = (k) => rows.find((r) => r.k === k)?.cur;
    const fan = cur("fan");
    const water = cur("water");
    const parts = [
      mode ? optLabel(mode) : "",
      fan && !["off"].includes(fan) ? optLabel(fan) : "",
      water && water !== "off" ? `${optLabel(water)} mop` : "",
      getCount(this._config.entity) === 2 ? "×2" : "",
    ].filter(Boolean);
    return parts.length ? parts : ["Set the mode"];
  }

  _openMode() {
    if (this._sheet) return;
    const host = document.createElement("rvc-mode-sheet");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${MODE_SHEET_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Cleaning mode">
        <div class="row"><div class="glyph" style="background:${tint(C.teal, 20)}"><ha-icon icon="mdi:tune-variant" style="color:${C.teal}"></ha-icon></div>
          <div class="title">Cleaning mode</div></div>
        <div class="seg tabs"></div><div class="sets"></div>
        <div class="actions"><button class="done"><span class="glyph"><ha-icon icon="mdi:check"></ha-icon></span>Done</button></div></div>`;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this._closeMode();
      }
    };
    root.querySelector(".backdrop").addEventListener("click", () => this._closeMode());
    root.querySelector(".done").addEventListener("click", () => this._closeMode());
    root.querySelector(".dialog").addEventListener("click", (e) => this._clickMode(e));
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
    this._sheet = { host, root, onKey, keys: {} };
    this._paintMode(root, this._sheet.keys);
    root.querySelector(".done").focus();
  }

  _closeMode() {
    const sh = this._sheet;
    if (!sh) return;
    document.removeEventListener("keydown", sh.onKey, true);
    sh.host.remove();
    this._sheet = null;
  }

  async _clickMode(e) {
    const b = e.target.closest("button[data-set]");
    if (!b || b.disabled || b.getAttribute("aria-pressed") === "true") return;
    const k = b.dataset.set;
    const v = b.dataset.v;
    const f = this._found;
    const id = this._config.entity;
    if (k === "count") return setCount(id, Number(v));
    // Show the choice at once; the robot's answer confirms it (or it falls back after a while,
    // or at once if the robot refuses it).
    this._pend(k, v);
    this._render();
    const ent = { mode: f.mode, water: f.mop_water, route: f.mop_route }[k];
    const done = k === "fan"
      ? this._call("vacuum", "set_fan_speed", { entity_id: id, fan_speed: v }, "change the suction power")
      : ent ? this._call("select", "select_option", { entity_id: ent, option: v }, "change the cleaning mode") : null;
    if (done && !(await done) && this._pending[k]?.v === v) {
      delete this._pending[k];
      this._render();
    }
  }

  /* Rooms and segment ids per map, from roborock.get_maps (or the maps: option). */
  _loadMaps() {
    if (this._config.maps) {
      if (!this._maps)
        this._maps = this._config.maps.map((x) => ({ name: x.name, rooms: Object.entries(x.rooms || {}).map(([id, name]) => ({ id: Number(id), name })) }));
      return;
    }
    const opts = (this._hass.states[this._found?.map_select]?.attributes?.options || []).join("|");
    const stale = this._maps && this._mapsFor !== opts;
    const retry = !this._maps && this._mapsTried && Date.now() - this._mapsTried > 60000;
    if (this._mapsLoading || (this._maps && !stale) || (this._mapsTried && !retry && !stale)) return;
    if (typeof this._hass.callWS !== "function") return;
    this._mapsLoading = true;
    this._mapsTried = Date.now();
    const id = this._config.entity;
    this._hass
      .callWS({ type: "call_service", domain: "roborock", service: "get_maps", target: { entity_id: id }, return_response: true })
      .then((r) => {
        const maps = r?.response?.[id]?.maps;
        if (Array.isArray(maps)) {
          this._maps = maps.map((x) => ({ name: x.name, rooms: Object.entries(x.rooms || {}).map(([sid, name]) => ({ id: Number(sid), name })) }));
          this._mapsFor = opts;
        }
      })
      .catch(() => {})
      .finally(() => {
        this._mapsLoading = false;
        this._render();
      });
  }

  /* Every floor's picture, loaded once per version of the map (the URL's token rotates, the
     picture doesn't), so a floor switch paints from memory. A picture that fails to load is
     tried again on a later update, at most every 10 s. */
  _preload() {
    if (typeof Image === "undefined" || this._config.hide_map) return;
    for (const id of this._found.images || []) {
      const s = this._hass.states[id];
      const src = pictureUrl(s);
      if (!src) continue;
      const key = `${id}|${s.state}`;
      const had = this._imgs[key];
      if (had && !(had.failed && Date.now() - had.failed > 10000)) continue;
      const img = new Image();
      img.decoding = "async";
      const entry = { img, crop: null, ready: false, failed: 0 };
      this._imgs[key] = entry;
      img.onerror = () => {
        if (this._imgs[key] === entry) entry.failed = Date.now();
      };
      img.onload = () => {
        entry.crop = cropBox(img);
        entry.ready = true;
        // Older versions of this floor's picture are no longer needed.
        for (const k of Object.keys(this._imgs)) if (k.startsWith(`${id}|`) && k !== key && this._imgs[k].ready) delete this._imgs[k];
        if (this._mapKey === key || this._nextKey === key) this._paintMap();
      };
      img.src = src;
    }
  }

  _syncMap(image) {
    const s = this._hass.states[image.id];
    const key = `${image.id}|${s?.state}`;
    if (key === this._mapKey) return;
    // Keep showing the current picture until the next one is ready, unless the floor changed.
    const entry = this._imgs[key];
    if (entry?.ready || !this._mapKey || !this._mapKey.startsWith(`${image.id}|`)) {
      this._mapKey = key;
      this._paintMap();
    } else this._nextKey = key;
  }

  _paintMap() {
    if (this._nextKey && this._imgs[this._nextKey]?.ready) {
      this._mapKey = this._nextKey;
      this._nextKey = null;
    }
    const entry = this._imgs?.[this._mapKey];
    const box = this._mapEl;
    const cv = box?.querySelector("canvas");
    if (!cv || box.hidden) return;
    if (!entry?.ready) {
      cv.width = 0;
      return;
    }
    const pad = 8;
    const W = box.clientWidth - pad * 2;
    const H = box.clientHeight - pad * 2;
    const c = entry.crop;
    if (W <= 0 || H <= 0 || !c?.w || !c?.h) return;
    const sc = Math.min(W / c.w, H / c.h);
    const w = Math.round(c.w * sc);
    const h = Math.round(c.h * sc);
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(entry.img, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  }

  /* What a clean will use, for the confirmation: "Vac & mop · Turbo · Standard mop". */
  _settingsText() {
    const hass = this._hass;
    const f = this._found;
    const mode = hass.states[f.mode]?.state;
    const fan = hass.states[this._config.entity]?.attributes?.fan_speed;
    const water = hass.states[f.mop_water]?.state;
    return [
      mode && !DEAD.includes(mode) ? optLabel(mode) : "",
      fan && mode !== "mop" ? optLabel(fan) : "",
      water && !DEAD.includes(water) && water !== "off" && mode !== "vacuum" ? `${optLabel(water)} mop` : "",
    ].filter(Boolean).join(" · ");
  }

  _ask(title, icon, color, text, confirmLabel) {
    return confirmDialog({ title, icon, color, text, confirmLabel });
  }

  async _switchFloor(name) {
    const ok = await this._ask(`Switch to ${name}`, "mdi:layers-outline", C.teal, `Place the robot on the ${name}, then confirm.`, "Confirm");
    if (!ok) return;
    // The robot may have started a job while the dialog was open; it would refuse the new map.
    if (BUSY.includes(this._m?.key) || this._m?.dockBusy)
      return this._notify(`Couldn't switch to the ${name}: the robot is busy. Try again once it has finished.`);
    this._sel.clear();
    this._pend("floor", name);
    this._render();
    if (!(await this._call("select", "select_option", { entity_id: this._found.map_select, option: name }, `switch to the ${name}`))) {
      // Back to the floor the robot is really on, at once.
      delete this._pending.floor;
      this._render();
    }
  }

  /* Every button asks first except Pause (the user's choice). */
  async _action(k) {
    const id = this._config.entity;
    const m = this._m;
    const how = this._settingsText();
    if (k === "clean") {
      const segs = [...this._sel];
      const twice = getCount(id) === 2;
      // ×2 with no rooms picked: every room on the floor, twice.
      const all = !segs.length && twice ? m.rooms.map((r) => r.id) : [];
      const names = segs.map((s) => m.rooms.find((r) => r.id === s)?.name).filter(Boolean);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
      const times = twice ? ", twice" : "";
      const ok = await this._ask(
        segs.length ? `Clean ${segs.length} room${segs.length > 1 ? "s" : ""}` : "Clean entire floor",
        "mdi:play", C.blue,
        segs.length ? `${list}${times}${how ? `, ${how}` : ""}.` : `Every room${m.mapName ? ` on the ${m.mapName}` : ""}${times}${how ? `, ${how}` : ""}.`,
        "Clean",
      );
      if (!ok) return;
      this._sel.clear();
      this._render();
      const target = segs.length ? segs : all;
      if (target.length) return this._call("vacuum", "send_command", { entity_id: id, command: "app_segment_clean", params: [{ segments: target, repeat: twice ? 2 : 1 }] }, "start the clean");
      return this._call("vacuum", "start", { entity_id: id }, "start the clean");
    }
    if (k === "pause") return this._call("vacuum", "pause", { entity_id: id }, "pause the robot");
    if (k === "resume") {
      if (await this._ask("Resume", "mdi:play", C.blue, "The robot carries on with the paused clean.", "Resume")) this._call("vacuum", "start", { entity_id: id }, "resume the clean");
      return;
    }
    if (k === "dock") {
      const ends = ["cleaning", "paused"].includes(m.key);
      // Blue like every robot action; the warning is in the words (orange means lights / heat).
      const ok = await this._ask("Return to the dock", "mdi:home-import-outline", C.blue,
        ends ? "This ends the current clean. The robot goes back to the dock." : "The robot goes back to the dock.", "Dock");
      if (ok) this._call("vacuum", "return_to_base", { entity_id: id }, "send the robot to the dock");
      return;
    }
    if (k === "auto") {
      const a = this._config.auto_clean;
      const on = this._hass.states[a]?.state === "on";
      const label = this._config.auto_clean_name || "Auto clean";
      // Teal both ways, like the pill: turning an automation off is not a warning.
      const ok = await this._ask(on ? `Turn off ${label}` : `Turn on ${label}`, "mdi:account-arrow-right", C.teal,
        on ? `${label} stops until you turn it back on.` : `${label} runs again.`, on ? "Turn off" : "Turn on");
      if (!ok) return;
      const [domain] = a.split(".");
      const svc = ["automation", "input_boolean", "switch"].includes(domain) ? domain : "homeassistant";
      return this._call(svc, on ? "turn_off" : "turn_on", { entity_id: a }, `turn ${on ? "off" : "on"} ${label}`);
    }
  }

  /* A service call; true when it went through, else the error is shown (once: Home Assistant's
     own toast is off) and it is false. */
  async _call(domain, service, data, what = "do that") {
    try {
      await this._hass.callService(domain, service, data, undefined, false);
      return true;
    } catch (err) {
      this._notify(errorText(err, what));
      return false;
    }
  }

  _notify(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true }));
  }
}

async function registerRobotVacuumCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(RVC_TAG)) return;
  registry.define(RVC_TAG, RobotVacuumCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: RVC_TAG,
    name: "Robot vacuum",
    description: "Robot vacuum: state, battery, map with floors, room cleaning and buttons – or (layout: mode) the cleaning mode, like the Roborock app.",
  });
  console.info(`%c ROBOT-VACUUM-CARD %c ${RVC_VERSION} `, "background:#2196f3;color:#fff", "");
}

registerRobotVacuumCard();
})();

/* ===== room-lights-card 1.5.2 ===== */
(() => {
/*
 * Room lights card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Every room's lights in one card: an "All lights" switch in the header and a
 * tile per room underneath with its temperature, humidity and light level.
 * Tap a tile to switch the room, tap its icon to open the room's dashboard,
 * long-press for the room's individual lamps. Nothing asks first – lights are
 * cheap to switch back. Names are never cut: the grid takes as many columns as
 * the longest room name (with its presence) allows.
 * See cards/room-lights-card/README.md for every option.
 */

const RLC_VERSION = "1.5.2";
const RLC_TAG = "room-lights-card";

// One meaning per colour (design tokens → Colours): orange = lights, green = someone here,
// amber = early warning, red = a call for attention, grey = off.
const C = {
  grey: "var(--grey-color, #9e9e9e)",
  orange: "var(--orange-color, #ff9800)",
  red: "var(--red-color, #f44336)",
  blue: "var(--blue-color, #2196f3)",
  amber: "var(--amber-color, #ffc107)",
  green: "var(--green-color, #4caf50)",
};
const HOLD_MS = 500;
const HISTORY_DAYS = 3;
const MOVE_PX = 10;
// A tile around its text: 10px padding + 36px icon + 10px gap … 10px padding.

const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
// Readable coloured text – mixed toward the text colour, never the raw colour on white.
const tx = (c, p = 70) => `color-mix(in srgb, ${c} ${p}%, var(--primary-text-color))`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const list = (v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v.filter(Boolean) : [v]);
const isOn = (s) => !!s && s.state === "on";

/* "21.1/21.8°", "49/49%", "30 lx" – the unit once, each sensor's value in order. */
function reading(hass, ids, digits, unit, space) {
  const vals = list(ids).map((id) => {
    const s = hass.states[id];
    const n = s ? Number(s.state) : NaN;
    return s && s.state !== "" && isFinite(n)
      ? n.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : "–";
  });
  if (!vals.length) return null;
  return `${vals.join("/")}${space ? " " : ""}${unit}`;
}

/* Lamp label without the room's name: "Front living room lamp" in Living Room → "Front lamp". */
function lampName(friendly, room) {
  let n = String(friendly || "");
  if (room) {
    const re = new RegExp(room.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    const stripped = n.replace(re, " ").replace(/\s+/g, " ").trim();
    if (stripped) n = stripped;
  }
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/* "12m", "3h", "2d" – compact, so it fits beside the room name (the one place that keeps the
   short form; design tokens → Formats). */
function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

/*
 * Who is in the room: occupied → green motion sensor (someone home); empty → how long since
 * someone was there. Lights on in a room that has been empty for a while → amber (an early
 * warning), so lights left on stand out.
 */
function presenceModel(hass, room, lastSeen, warnMin, lightsOn) {
  const id = room.occupancy;
  if (!id) return null;
  const s = hass.states[id];
  if (!s || s.state === "unavailable" || s.state === "unknown") return { kind: "unknown", text: "" };
  if (s.state === "on") return { kind: "here", text: "" };
  const since = lastSeen ?? null;
  if (since === null) return { kind: "empty", text: "" };
  const ms = Date.now() - since;
  const warn = lightsOn && ms >= warnMin * 60000;
  return { kind: warn ? "warn" : "empty", text: ms > HISTORY_DAYS * 86400000 ? `${HISTORY_DAYS}d+` : ago(ms) };
}

function roomModel(hass, room) {
  const s = hass.states[room.entity];
  const on = isOn(s);
  const name = room.name || s?.attributes?.friendly_name || room.entity;
  return {
    name,
    on,
    missing: !s,
    icon: room.icon || s?.attributes?.icon || "mdi:lightbulb-group",
    window: list(room.window).some((id) => isOn(hass.states[id])),
    temp: reading(hass, room.temperature, 1, "°", false),
    hum: reading(hass, room.humidity, 0, "%", false),
    lux: reading(hass, room.illuminance, 0, "lx", true),
  };
}

/* The lamps behind a room switch (light groups and old-style groups both list them). */
function lamps(hass, room, viewIcons = {}) {
  const s = hass.states[room.entity];
  // Configured lamps, else the group's members, else the room's single light itself.
  const ids = list(room.lamps).length ? list(room.lamps) : list(s?.attributes?.entity_id).length ? list(s.attributes.entity_id) : [room.entity];
  return ids.map((id) => {
    const ls = hass.states[id];
    const on = isOn(ls);
    return {
      id,
      on,
      missing: !ls,
      name: lampName(ls?.attributes?.friendly_name || id, room.name),
      // Same icon as on the room's own dashboard view, else the entity's own icon.
      icon: viewIcons[id] || ls?.attributes?.icon || hass.entities?.[id]?.icon || (on ? "mdi:lightbulb" : "mdi:lightbulb-outline"),
    };
  });
}

/* Icons the room's own view uses for each entity ({ "light.tv": "mdi:television", … }). */
function iconsInView(view) {
  const map = {};
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    if (typeof node.entity === "string" && typeof node.icon === "string" && !node.icon.includes("{") && !map[node.entity])
      map[node.entity] = node.icon;
    Object.values(node).forEach(walk);
  };
  walk(view);
  return map;
}

/* "/lovelace/living-room" → that view's config (null when it cannot be read). */
async function loadView(hass, path) {
  const [dash, view] = String(path || "").split("?")[0].split("/").filter(Boolean);
  if (!dash) return null;
  try {
    const cfg = await hass.callWS({ type: "lovelace/config", url_path: dash === "lovelace" ? null : dash });
    const views = cfg?.views || [];
    return views.find((v) => v.path === view) || (/^\d+$/.test(view || "0") ? views[Number(view || 0)] : null) || null;
  } catch (e) {
    return null;
  }
}

/* ------------------------------------------------------------------------ */
/* Lamps sheet – same look as the other cards' dialogs                       */
/* ------------------------------------------------------------------------ */

// Same look as the other pop-ups on the dashboard (Boost heating, alarm): 20px title, 56px
// pill rows with a 36px icon on the left and 16px semibold text, 20px between blocks.
const SHEET_CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); max-height: calc(100vh - 48px);
    overflow: auto; padding: 25px 18px 18px; border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .head { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  /* Text is never cut: a long room or lamp name wraps (the row grows past 56px) instead. */
  .title { font-size: 20px; line-height: 26px; font-weight: 600; min-width: 0; overflow-wrap: break-word; }
  .list, .buttons { margin-top: 20px; display: grid; gap: 8px; }
  /* The actions are set apart from the lamp list by a divider and extra space. */
  .buttons { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  button { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 10px; min-height: 56px;
    padding: 6px 12px 6px 10px; border-radius: 28px; cursor: pointer; font-size: 16px; line-height: 24px; font-weight: 600;
    letter-spacing: .1px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color);
    -webkit-tap-highlight-color: transparent; }
  button .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  button .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
  /* Call to action, filled like "Boost heating": the lights colour with white text and icon. */
  button.open { background: ${C.orange}; color: #fff; }
  button.open .glyph { background: rgba(255,255,255,.2); }
  button.open .glyph ha-icon { color: #fff; }
  button.open .nm, .lamp .nm { flex: 1; min-width: 0; overflow-wrap: break-word; }
  .sw { flex: 0 0 auto; width: 44px; height: 26px; border-radius: 13px; position: relative; background: var(--disabled-color, #bdbdbd);
    transition: background-color 160ms; }
  .sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .lamp.on .sw { background: ${C.orange}; }
  .lamp.on .sw::after { transform: translateX(18px); }
  .lamp.missing { opacity: .5; }
  button:active { filter: brightness(.92); }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  /* No lamps: a line under the title, on the title's line (8 + 42px glyph + 6px gap), like the
     text of every other dialog. */
  .list.none { margin-top: 12px; }
  .empty { margin-left: 56px; font-size: 15px; line-height: 21px; color: var(--secondary-text-color); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

// A plain controller around an undefined custom tag (attachShadow works on it), so nothing has to
// be registered in Home Assistant's scoped element registry.
class RoomLampsSheet {
  open(card, room) {
    this._card = card;
    this._room = room;
    this.host = document.createElement("rlc-lamps-sheet");
    const root = this.host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${SHEET_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true">
        <div class="head"><div class="glyph"><ha-icon></ha-icon></div><div class="title"></div></div>
        <div class="list"></div>
        <div class="buttons">
          ${room.navigation_path ? `<button class="open"><span class="glyph"><ha-icon></ha-icon></span><span class="nm"></span></button>` : ""}
          <button class="close"><span class="glyph"><ha-icon icon="mdi:close"></ha-icon></span>Close</button>
        </div>
      </div>`;
    // The sheet opens under the finger that is still holding the tile. When that finger lifts,
    // the browser sends a click to whatever is now under it – the backdrop – which would close
    // the sheet at once (or flip a lamp). Ignore taps until shortly after that finger is up.
    this._guard = true;
    this._release = () => {
      ["pointerup", "pointercancel", "touchend"].forEach((t) => document.removeEventListener(t, this._release, true));
      setTimeout(() => (this._guard = false), 350);
    };
    ["pointerup", "pointercancel", "touchend"].forEach((t) => document.addEventListener(t, this._release, true));
    root.addEventListener(
      "click",
      (e) => {
        if (!this._guard) return;
        e.stopPropagation();
        e.preventDefault();
      },
      true,
    );
    this._onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      }
    };
    root.querySelector(".backdrop").addEventListener("click", () => this.close());
    root.querySelector(".close").addEventListener("click", () => this.close());
    root.querySelector(".open")?.addEventListener("click", () => {
      this.close();
      card._navigate(room.navigation_path);
    });
    document.addEventListener("keydown", this._onKey, true);
    document.body.appendChild(this.host);
    this.update(card._hass);
    root.querySelector(".close").focus();
  }

  update(hass) {
    const root = this.host?.shadowRoot;
    if (!root || !hass) return;
    const m = roomModel(hass, this._room);
    const color = m.on ? C.orange : C.grey;
    const g = root.querySelector(".head .glyph");
    g.style.background = tint(color, 20);
    g.querySelector("ha-icon").setAttribute("icon", m.icon);
    g.querySelector("ha-icon").style.color = color;
    const title = root.querySelector(".title");
    if (title.textContent !== m.name) title.textContent = m.name;
    const open = root.querySelector(".open");
    if (open) {
      open.querySelector("ha-icon").setAttribute("icon", m.icon);
      // The title already names the room; the button doesn't repeat it.
      const label = "Open room";
      if (open.querySelector(".nm").textContent !== label) open.querySelector(".nm").textContent = label;
    }
    root.querySelector(".dialog").setAttribute("aria-label", m.name);

    const items = lamps(hass, this._room, this._card._viewIcons?.[this._room.navigation_path]?.map || {});
    const box = root.querySelector(".list");
    const keys = items.map((l) => l.id).join();
    if (box.dataset.keys !== keys) {
      box.dataset.keys = keys;
      box.classList.toggle("none", !items.length);
      box.innerHTML = items.length
        ? items
            .map((l) => `<button class="lamp" role="switch" data-id="${esc(l.id)}"><span class="glyph"><ha-icon></ha-icon></span>
              <span class="nm"></span><span class="sw"></span></button>`)
            .join("")
        : `<div class="empty">No separate lamps in this room.</div>`;
      box.querySelectorAll(".lamp").forEach((b) => b.addEventListener("click", () => this._card._toggle(b.dataset.id)));
    }
    items.forEach((l, i) => {
      const b = box.children[i];
      const c = l.on ? C.orange : C.grey;
      b.classList.toggle("on", l.on);
      b.classList.toggle("missing", l.missing);
      b.setAttribute("aria-checked", String(l.on));
      const gl = b.querySelector(".glyph");
      gl.style.background = tint(c, 20);
      gl.querySelector("ha-icon").setAttribute("icon", l.icon);
      gl.querySelector("ha-icon").style.color = c;
      const nm = b.querySelector(".nm");
      if (nm.textContent !== l.name) nm.textContent = l.name;
    });
  }

  close() {
    document.removeEventListener("keydown", this._onKey, true);
    this._release?.();
    this.host?.remove();
    if (this._card?._sheet === this) this._card._sheet = null;
  }
}

/* ------------------------------------------------------------------------ */

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  /* Spacing follows Mushroom: everything inside starts 10px from the card edge. */
  ha-card { padding: 10px; }
  /* The All lights switch is the card's label row – same height, title and switch as the label row
     of every other card (40px row, 14px / 500 title, 40×24 switch), and the whole row toggles.
     Its icon is tappable, so it sits in a filled 36px circle like every other tappable icon. */
  .all { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 0 8px;
    cursor: pointer; -webkit-tap-highlight-color: transparent; border-radius: 10px; }
  .all .hi { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    --mdc-icon-size: 24px; color: ${C.grey}; background: ${tint(C.grey, 20)}; transition: color 180ms, background-color 180ms; }
  .all.on .hi { color: ${C.orange}; background: ${tint(C.orange, 20)}; }
  .shape { position: relative; flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center;
    justify-content: center; transition: background-color 180ms; }
  /* Same size as Mushroom / tile card icons: 36 px circle, 24 px icon. */
  .shape ha-icon { --mdc-icon-size: 24px; transition: color 180ms; }
  /* Text matches Mushroom / tile cards: names 14px medium, readings 12px regular, same colour.
     Nothing is cut off: a label too long for its box wraps instead. */
  .all .nm { position: relative; top: 1px; flex: 1; min-width: 0; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    overflow-wrap: break-word; }
  .all .sw { flex: 0 0 auto; width: 40px; height: 24px; border-radius: 12px; position: relative; background: var(--disabled-color, #bdbdbd);
    transition: background-color 160ms; }
  .all .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .all.on .sw { background: ${C.orange}; }
  .all.on .sw::after { transform: translateX(16px); }
  /* Rooms: \`columns\` even columns (two by default). */
  .rooms { display: grid; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 8px; }
  .room { position: relative; min-width: 0; border-radius: 10px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
    container-type: inline-size; cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none;
    -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
  .tile { display: flex; align-items: center; gap: 10px; height: 100%; box-sizing: border-box; padding: 11px 10px; min-height: 58px; }
  .room .shape { cursor: pointer; }
  /* With a room view, the icon is its own button (it opens the room): keyboard and focus too. */
  .room .shape[role="button"]:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .badge { position: absolute; top: -3px; right: -3px; width: 16px; height: 16px; border-radius: 50%; display: none;
    align-items: center; justify-content: center; background: ${C.red}; }
  .badge ha-icon { --mdc-icon-size: 11px; color: #fff; }
  .badge.on { display: flex; }
  .txt { flex: 1; min-width: 0; }
  /* Presence sits on the name's own line, at its end, so it always lines up with the room title
     (as it always has). A name too long for the space left wraps onto a second line – it is
     never cut, and the presence stays beside its first line. */
  .top { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
  .room .nm { flex: 1; min-width: 0; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    overflow-wrap: break-word; }
  .pres { flex: 0 0 auto; display: none; align-items: center; gap: 2px; height: 20px; font-size: 12px; line-height: 20px;
    font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color); white-space: nowrap; }
  .pres.show { display: inline-flex; }
  .pres ha-icon { --mdc-icon-size: 16px; }
  /* Someone here: green, like a person at home in Home Assistant. Lights on and nobody here for
     a while: amber, an early warning (the icon in full colour, the time readable). */
  .pres.here { color: ${C.green}; }
  .pres.warn { color: ${tx(C.amber, 70)}; }
  .pres.warn ha-icon { color: ${C.amber}; }
  /* Readings wrap only between their parts ("21.1/21.8°" stays whole). */
  .m { display: flex; flex-wrap: wrap; column-gap: 9px; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .g { display: flex; flex-wrap: wrap; column-gap: 9px; min-width: 0; }
  .g:empty { display: none; }
  .v { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
  .v ha-icon { --mdc-icon-size: 14px; }
  /* The lights are the point of the card: readings are secondary. Their numbers use the quiet
     secondary grey; temperature and humidity icons keep their literal colours, faded towards
     grey, and the light level's sun is the quiet reading-icon grey (amber means a warning).
     Rooms with lights on get a faint warm tint, so a lit room stands out on its own. */
  .v.t ha-icon { color: color-mix(in srgb, ${C.orange} 55%, ${C.grey}); }
  .v.h ha-icon { color: color-mix(in srgb, ${C.blue} 55%, ${C.grey}); }
  .v.l ha-icon { color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .room.lit { background: color-mix(in srgb, ${C.orange} 10%, transparent); }
  .room.missing .nm { color: var(--secondary-text-color); }
  /* Press feedback without moving anything: a scale-down shrinks the target under the
     finger and taps near the edge would be lost. */
  .all:active, .room:active { filter: brightness(.92); }
  .all:focus-visible, .room:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* While the card measures (one frame, never painted): names, presence and readings on one line
     at their natural width. */
  .measure .m, .measure .g { flex-wrap: nowrap; }
  /* When any room's readings do not fit on one line (the card measures this), every tile
     switches together: temperature on one line, humidity + light level on the next. All tiles
     keep the same height (grid-auto-rows: 1fr) even if one room has more sensors. */
  .stack .m { flex-direction: column; }
  .stack .g { column-gap: 7px; }
  .stack .tile { padding: 11px 8px; gap: 8px; }
  /* When a room's name and its presence don't fit on one line (measured), every tile takes the
     phone spacing – 6px sides and a 6px gap – so the name stays on one line and the tiles keep
     their height ("Second Bedroom · 18m" on a 440px phone). Text sizes never change. */
  .tight .tile { padding: 11px 6px; gap: 6px; }
  /* A phone-width tile (~170px) keeps more room for the name and its presence: 6px sides and a
     6px gap, as before, two-line readings or not. Text sizes don't change. */
  @container (max-width: 175px) { .tile, .stack .tile { padding: 11px 6px; gap: 6px; } }
`;

class RoomLightsCard extends HTMLElement {
  static getStubConfig(hass) {
    const lights = Object.keys(hass?.states || {}).filter((id) => id.startsWith("light.")).slice(0, 2);
    return { entity: "", rooms: lights.map((id) => ({ entity: id })) };
  }

  // Visual editor: a custom element, because Home Assistant's built-in list editor drops
  // fields that take several entities (the temperature / humidity / light sensors).
  static getConfigElement() {
    return document.createElement(RLC_EDITOR_TAG);
  }

  setConfig(config) {
    if (!config) throw new Error("Missing configuration");
    if (config.rooms !== undefined && !Array.isArray(config.rooms)) throw new Error("rooms must be a list");
    this._config = { ...config, rooms: (config.rooms || []).filter((r) => r && r.entity) };
    this._presenceSig = undefined;
    this._built = false;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._config) this._trackPresence();
    this._render();
    this._sheet?.update(hass);
  }

  getCardSize() {
    return 1 + Math.ceil((this._config?.rooms?.length || 0) / 2) * 1.5;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  disconnectedCallback() {
    this._sheet?.close();
    this._ro?.disconnect();
    clearInterval(this._tick);
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const rooms = this._config.rooms;
    const header = this._config.entity
      ? `<button class="all" role="switch"><ha-icon class="hi" icon="mdi:home-lightbulb"></ha-icon>
          <span class="nm"></span><span class="sw"></span></button>`
      : "";
    root.innerHTML = `<style>${CSS}</style><ha-card>${header}
      <div class="rooms" style="--cols:${this._cols()}">
        ${rooms
          .map(
            (r, i) => `<div class="room" role="button" tabindex="0" data-i="${i}"><div class="tile">
              <div class="shape"${r.navigation_path ? ` role="button" tabindex="0"` : ""}><ha-icon></ha-icon><span class="badge"><ha-icon icon="mdi:window-open-variant"></ha-icon></span></div>
              <div class="txt"><div class="top"><div class="nm"></div><span class="pres"></span></div>
                <div class="m"><span class="g"></span><span class="g"></span></div></div>
            </div></div>`,
          )
          .join("")}
      </div></ha-card>`;
    if (!rooms.length) root.querySelector(".rooms").style.display = "none";
    root.querySelector(".all")?.addEventListener("click", () => this._toggleAll());
    root.querySelectorAll(".room").forEach((el) => this._bindRoom(el, rooms[Number(el.dataset.i)]));
    this._el = {
      all: root.querySelector(".all"),
      grid: root.querySelector(".rooms"),
      rooms: [...root.querySelectorAll(".room")],
    };
    this._built = true;
    this._colsKey = undefined;
    // Names are measured in the dashboard's font: fit again once it has loaded.
    document.fonts?.ready?.then(() => this._fit());
    if (this.isConnected) this.connectedCallback();
  }

  /* Tap = switch the room; tap on the icon = open the room; hold = lamps sheet. The same from the
     keyboard: Enter / Space on the tile switches it, on its icon opens the room. */
  _bindRoom(el, room) {
    let timer = null;
    let start = null;
    let held = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = null;
    };
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      held = false;
      start = [e.clientX, e.clientY];
      cancel();
      timer = setTimeout(() => {
        timer = null;
        held = true;
        this._haptic("medium");
        this._openSheet(room);
      }, HOLD_MS);
    });
    el.addEventListener("pointermove", (e) => {
      if (timer && start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > MOVE_PX) cancel();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => el.addEventListener(t, cancel));
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("click", (e) => {
      if (held) {
        held = false;
        return;
      }
      if (e.composedPath().some((n) => n.classList?.contains("shape")) && room.navigation_path) {
        this._navigate(room.navigation_path);
        return;
      }
      this._toggle(room.entity, this._roomName(room));
    });
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (room.navigation_path && e.target.classList?.contains("shape")) return this._navigate(room.navigation_path);
      this._toggle(room.entity, this._roomName(room));
    });
  }

  // For messages: the room's name, never an entity id.
  _roomName(room) {
    return room.name || this._hass?.states[room.entity]?.attributes?.friendly_name || "the room";
  }

  _render() {
    inkSchedule(this, ".tile .txt");
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    // Only touch the DOM when something changed: Home Assistant pushes state several times a
    // second, and replacing text under a finger can swallow the tap.
    const set = (node, text) => {
      if (node.textContent === text) return false;
      node.textContent = text;
      return true;
    };
    // Anything that changes a tile's width needs (name, presence, readings) → fit again.
    let changed = false;

    if (this._el.all) {
      const s = hass.states[this._config.entity];
      const on = isOn(s);
      this._el.all.classList.toggle("on", on);
      this._el.all.setAttribute("aria-checked", String(on));
      set(this._el.all.querySelector(".nm"), this._config.name || "All lights");
    }

    this._config.rooms.forEach((room, i) => {
      const el = this._el.rooms[i];
      const m = roomModel(hass, room);
      const color = m.on ? C.orange : C.grey;
      el.classList.toggle("missing", m.missing);
      el.classList.toggle("lit", m.on);
      const shape = el.querySelector(".shape");
      shape.style.backgroundColor = tint(color, 20);
      const icon = shape.querySelector(":scope > ha-icon");
      if (icon.getAttribute("icon") !== m.icon) icon.setAttribute("icon", m.icon);
      icon.style.color = color;
      el.querySelector(".badge").classList.toggle("on", m.window);
      if (room.navigation_path && shape.getAttribute("aria-label") !== `Open ${m.name}`) shape.setAttribute("aria-label", `Open ${m.name}`);
      if (set(el.querySelector(".nm"), m.name)) changed = true;
      const pr = presenceModel(hass, room, this._lastSeen?.[room.occupancy], this._warnMin(), m.on);
      const pel = el.querySelector(".pres");
      const phtml = !pr || pr.kind === "unknown" ? ""
        : pr.kind === "here" ? `<ha-icon icon="mdi:motion-sensor"></ha-icon>`
        : `${pr.kind === "warn" ? `<ha-icon icon="mdi:motion-sensor-off"></ha-icon>` : ""}${esc(pr.text)}`;
      if (pel.dataset.h !== phtml) {
        pel.innerHTML = phtml;
        pel.dataset.h = phtml;
        changed = true;
      }
      pel.className = `pres${phtml ? " show" : ""}${pr ? ` ${pr.kind}` : ""}`;
      pel.title = !pr ? "" : pr.kind === "here" ? "Someone is here"
        : pr.kind === "warn" ? `Lights on, nobody here for ${pr.text}` : pr.text ? `Last seen ${pr.text} ago` : "";
      el.setAttribute("aria-label", `${m.name}: ${m.missing ? "not found" : m.on ? "on" : "off"}`);
      const [g1, g2] = el.querySelectorAll(".g");
      const html1 = m.temp ? this._v("t", "mdi:thermometer", m.temp) : "";
      const html2 = (m.hum ? this._v("h", "mdi:water-percent", m.hum) : "") + (m.lux ? this._v("l", "mdi:white-balance-sunny", m.lux) : "");
      if (g1.dataset.h !== html1) {
        g1.innerHTML = html1;
        g1.dataset.h = html1;
        changed = true;
      }
      if (g2.dataset.h !== html2) {
        g2.innerHTML = html2;
        g2.dataset.h = html2;
        changed = true;
      }
    });
    if (changed) this._fit();
  }

  /* Once per frame after a change: one line of readings per tile if every room's fit, otherwise
     two lines for all of them; then, if a room's name and presence still don't fit on one line,
     the tighter phone spacing for every tile, so the name stays on one line. Measured in one go
     (never painted in between). Without layout (tests) nothing is measured and the CSS default
     stays: \`columns\` even columns, readings wrapping between their parts. A name that doesn't fit
     even then wraps – it is never cut and never shrunk. */
  _fit() {
    if (this._fitQueued) return;
    this._fitQueued = true;
    requestAnimationFrame(() => {
      this._fitQueued = false;
      const card = this.shadowRoot?.querySelector("ha-card");
      if (!card || !card.isConnected) return;
      const over = (el) => el.scrollWidth > el.clientWidth + 1;
      card.classList.remove("stack", "tight");
      card.classList.add("measure");
      const stack = [...card.querySelectorAll(".m, .g")].some(over);
      card.classList.remove("measure");
      card.classList.toggle("stack", stack);
      // Names: read where they actually land (a name 0.4px too wide still wraps; rounded widths
      // miss it). Tighter spacing stays only if it puts a wrapped name back on one line.
      const wrapped = () => [...card.querySelectorAll(".room .nm")].filter((n) => n.getBoundingClientRect().height > 30).length;
      const before = wrapped();
      if (before) {
        card.classList.add("tight");
        if (wrapped() >= before) card.classList.remove("tight");
      }
    });
  }


  _cols() {
    return Math.max(1, Math.min(4, Number(this._config.columns) || 2));
  }

  connectedCallback() {
    // Keeps the "12m" counters moving.
    clearInterval(this._tick);
    if (this._config?.rooms?.some((r) => r.occupancy)) this._tick = setInterval(() => this._hass && this._render(), 60000);
    if (typeof ResizeObserver === "undefined") return;
    // Only width matters; the height changes this causes must not trigger another pass.
    this._ro =
      this._ro ||
      new ResizeObserver((entries) => {
        const w = Math.round(entries[entries.length - 1].contentRect.width);
        if (w === this._fitWidth) return;
        this._fitWidth = w;
        this._fit();
      });
    const card = this.shadowRoot?.querySelector("ha-card");
    if (card) this._ro.observe(card);
  }

  _warnMin() {
    const n = Number(this._config.empty_warning);
    // Short by default: automations often switch empty rooms off within minutes, and a few
    // minutes is still long enough to ride out a presence sensor's brief drop-outs.
    return isFinite(n) && n >= 0 && this._config.empty_warning !== "" && this._config.empty_warning != null ? n : 2;
  }

  /*
   * When did each room last have someone in it? A live switch to "off" gives it directly; after a
   * restart the sensor's last change is the restart, so the answer comes from the history instead
   * (the end of the last "on" period in the past few days).
   */
  _trackPresence() {
    const ids = [...new Set(this._config.rooms.map((r) => r.occupancy).filter(Boolean))];
    if (!ids.length || !this._hass) return;
    this._lastSeen = this._lastSeen || {};
    const sig = ids.map((id) => `${id}:${this._hass.states[id]?.state}`).join();
    if (sig === this._presenceSig) return;
    const first = this._presenceSig === undefined;
    const prev = this._presenceStates || {};
    this._presenceSig = sig;
    this._presenceStates = Object.fromEntries(ids.map((id) => [id, this._hass.states[id]?.state]));
    if (!first) {
      // Someone just left a room: that moment is the "last seen".
      for (const id of ids) {
        if (prev[id] === "on" && this._presenceStates[id] === "off") this._lastSeen[id] = Date.parse(this._hass.states[id].last_changed);
      }
      return;
    }
    this._loadHistory(ids);
  }

  async _loadHistory(ids) {
    const hass = this._hass;
    if (!hass?.callWS) return;
    const start = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();
    try {
      const h = await hass.callWS({
        type: "history/history_during_period",
        start_time: start,
        entity_ids: ids,
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      for (const id of ids) {
        const rows = h?.[id] || [];
        const t = (r) => (r.lu ?? r.lc ?? 0) * 1000 || Date.parse(r.last_changed || r.last_updated || 0);
        let last = -1;
        rows.forEach((r, i) => {
          if ((r.s ?? r.state) === "on") last = i;
        });
        if (last >= 0 && last < rows.length - 1) this._lastSeen[id] = t(rows[last + 1]);
        else if (last < 0) this._lastSeen[id] = Date.now() - HISTORY_DAYS * 86400000 - 1;
      }
    } catch (e) {
      // History not available: fall back to the sensor's own last change.
      for (const id of ids) {
        const s = hass.states[id];
        if (s && s.state === "off") this._lastSeen[id] = Date.parse(s.last_changed);
      }
    }
    this._render();
  }

  _v(cls, icon, text) {
    return `<span class="v ${cls}"><ha-icon icon="${icon}"></ha-icon>${esc(text)}</span>`;
  }

  _openSheet(room) {
    this._sheet?.close();
    this._sheet = new RoomLampsSheet();
    this._sheet.open(this, room);
    this._mirrorIcons(room);
  }

  /* Read the lamp icons from the room's own view (cached for 5 minutes), then redraw. */
  async _mirrorIcons(room) {
    const path = room.navigation_path;
    if (!path || !this._hass) return;
    this._viewIcons = this._viewIcons || {};
    const cached = this._viewIcons[path];
    if (cached && Date.now() - cached.at < 300000) return;
    const view = await loadView(this._hass, path);
    this._viewIcons[path] = { at: Date.now(), map: view ? iconsInView(view) : {} };
    this._sheet?.update(this._hass);
  }

  /* Header: anything on → everything off; all off → everything on. No confirmation. */
  _toggleAll() {
    const s = this._hass.states[this._config.entity];
    this._haptic("light");
    this._call(isOn(s) ? "turn_off" : "turn_on", this._config.entity, this._config.name || "all lights");
  }

  /* name: what a failure message calls it (the room's or lamp's name, never an entity id). */
  _toggle(entity, name) {
    const s = this._hass.states[entity];
    this._haptic("light");
    this._call(isOn(s) ? "turn_off" : "turn_on", entity, name || s?.attributes?.friendly_name || "the light");
  }

  /* Home Assistant's own message when it gives one, else "Couldn't turn on Kitchen." */
  async _call(service, entity, name) {
    const [domain] = entity.split(".");
    const d = domain === "light" || domain === "switch" ? domain : "homeassistant";
    try {
      await this._hass.callService(d, service, { entity_id: entity });
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || `Couldn't turn ${service === "turn_off" ? "off" : "on"} ${name}.` });
    }
  }

  _navigate(path) {
    history.pushState(null, "", path);
    this._fire("location-changed", { replace: false });
  }

  _haptic(kind) {
    this._fire("haptic", kind);
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

/* ------------------------------------------------------------------------ */
/* Visual editor                                                             */
/* ------------------------------------------------------------------------ */

const RLC_EDITOR_TAG = "room-lights-card-editor";
const MULTI = ["temperature", "humidity", "illuminance", "lamps"];

const HEADER_SCHEMA = [
  { type: "grid", name: "", schema: [
    { name: "entity", selector: { entity: { domain: ["group", "light", "switch"] } } },
    { name: "name", selector: { text: {} } },
  ] },
  { name: "empty_warning", selector: { number: { min: 0, max: 240, step: 1, mode: "box", unit_of_measurement: "min" } } },
];
const ROOM_SCHEMA = [
  { type: "grid", name: "", schema: [
    { name: "name", selector: { text: {} } },
    { name: "icon", selector: { icon: {} } },
  ] },
  { name: "entity", required: true, selector: { entity: { domain: ["light", "switch", "group"] } } },
  { name: "navigation_path", selector: { navigation: {} } },
  { name: "temperature", selector: { entity: { domain: "sensor", multiple: true } } },
  { name: "humidity", selector: { entity: { domain: "sensor", multiple: true } } },
  { name: "illuminance", selector: { entity: { domain: "sensor", multiple: true } } },
  { name: "occupancy", selector: { entity: { domain: "binary_sensor" } } },
  { name: "window", selector: { entity: { domain: "binary_sensor" } } },
  { name: "lamps", selector: { entity: { domain: ["light", "switch"], multiple: true } } },
];
const EDITOR_LABELS = {
  entity: "Lights (light, switch or group)",
  name: "Name",
  icon: "Icon",
  navigation_path: "Icon tap goes to",
  temperature: "Temperature sensors",
  humidity: "Humidity sensors",
  illuminance: "Light level sensors",
  window: "Window sensor (red badge when open)",
  occupancy: "Occupancy sensor",
  empty_warning: "Flag lights left on in an empty room after (minutes)",
  lamps: "Lamps for the long-press list (optional)",
};
const EDITOR_HELPERS = {
  temperature: "Add more than one to show them all, in order (e.g. 21.1/21.8°).",
  lamps: "Leave empty to use the members of the room's group.",
  occupancy: "Green icon while someone is here, otherwise how long since they were (12m, 3h, 2d).",
  empty_warning: "Default 2. Lights on in a room empty this long turn its time amber.",
};

const EDITOR_CSS = `
  :host { display: block; }
  .rooms-title { margin: 20px 0 8px; font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
  details { border: 1px solid var(--divider-color, rgba(0,0,0,.12)); border-radius: 12px; margin-bottom: 8px;
    background: var(--card-background-color, #fff); }
  summary { list-style: none; display: flex; align-items: center; gap: 12px; padding: 10px 12px; cursor: pointer; }
  summary::-webkit-details-marker { display: none; }
  summary .ic { flex: 0 0 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); color: var(--grey-color, #9e9e9e); }
  summary .ic ha-icon { --mdc-icon-size: 24px; }
  summary .t { flex: 1; min-width: 0; }
  summary .t1 { font-size: 14px; font-weight: 500; color: var(--primary-text-color); overflow-wrap: break-word; }
  summary .t2 { font-size: 12px; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  summary .chev { --mdc-icon-size: 24px; color: var(--secondary-text-color); transition: transform 150ms; }
  details[open] summary .chev { transform: rotate(180deg); }
  .body { padding: 4px 12px 12px; }
  .tools { display: flex; justify-content: flex-end; gap: 4px; margin-top: 8px; }
  button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
    height: 36px; padding: 0 12px; border-radius: 18px; font-size: 14px; font-weight: 500; color: var(--primary-text-color); }
  button ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); }
  button:hover { background: rgba(var(--rgb-primary-text-color, 33,33,33), .06); }
  button:disabled { opacity: .35; cursor: default; background: none; }
  button.icon { padding: 0; width: 36px; justify-content: center; }
  button.delete ha-icon { color: var(--error-color, #db4437); }
  button.add { color: var(--primary-color); border: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  button.add ha-icon { color: var(--primary-color); }
  button:focus-visible { outline: 2px solid var(--primary-color); }
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

class RoomLightsCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = JSON.parse(JSON.stringify(config || {}));
    if (!Array.isArray(this._config.rooms)) this._config.rooms = [];
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot?.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
  }

  /* Several-sensor fields always go to the form as lists (YAML may hold a single string). */
  _roomData(room) {
    const d = { ...room };
    for (const k of MULTI) if (d[k] !== undefined) d[k] = list(d[k]);
    return d;
  }

  _render() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const rooms = this._config.rooms;
    // Typing in a field sends the config round-trip through Home Assistant; rebuilding the
    // forms then would drop the cursor. Rebuild only when rooms are added, removed or moved.
    if (this._shown === rooms.length && !this._dirty) {
      this._header.data = this._config;
      rooms.forEach((r, i) => {
        this._forms[i].data = this._roomData(r);
        this._summary(i);
      });
      return;
    }
    this._dirty = false;
    const open = new Set(this._open || []);
    root.innerHTML = `<style>${EDITOR_CSS}</style><div class="header"></div>
      <div class="rooms-title">Rooms</div><div class="list"></div>
      <button class="add"><ha-icon icon="mdi:plus"></ha-icon>Add room</button>`;
    this._header = this._form(HEADER_SCHEMA, this._config, (v) => {
      const next = { ...this._config, ...v };
      for (const k of ["entity", "name", "empty_warning"]) if (next[k] === "" || next[k] === undefined || next[k] === null) delete next[k];
      this._commit(next);
    }, { entity: "All lights switch (group)", name: "Header label (default: All lights)" });
    root.querySelector(".header").appendChild(this._header);
    const box = root.querySelector(".list");
    this._forms = [];
    rooms.forEach((room, i) => {
      const det = document.createElement("details");
      if (open.has(i)) det.open = true;
      det.innerHTML = `<summary><span class="ic"><ha-icon></ha-icon></span><span class="t"><div class="t1"></div><div class="t2"></div></span>
        <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon></summary>
        <div class="body"><div class="form"></div><div class="tools">
          <button class="icon up" title="Move up"><ha-icon icon="mdi:arrow-up"></ha-icon></button>
          <button class="icon down" title="Move down"><ha-icon icon="mdi:arrow-down"></ha-icon></button>
          <button class="delete" title="Remove room"><ha-icon icon="mdi:delete-outline"></ha-icon>Remove</button>
        </div></div>`;
      det.addEventListener("toggle", () => {
        this._open = [...box.children].map((d, j) => (d.open ? j : -1)).filter((j) => j >= 0);
      });
      const form = this._form(ROOM_SCHEMA, this._roomData(room), (v) => {
        const next = { ...v };
        for (const k of Object.keys(next)) {
          if (next[k] === "" || next[k] === undefined || next[k] === null || (Array.isArray(next[k]) && !next[k].length)) delete next[k];
        }
        // One sensor stays a plain entity id, as you would write it in YAML.
        for (const k of MULTI) if (Array.isArray(next[k]) && next[k].length === 1) next[k] = next[k][0];
        const roomsNext = this._config.rooms.slice();
        roomsNext[i] = next;
        this._commit({ ...this._config, rooms: roomsNext });
      });
      det.querySelector(".form").appendChild(form);
      det.querySelector(".up").disabled = i === 0;
      det.querySelector(".down").disabled = i === rooms.length - 1;
      det.querySelector(".up").addEventListener("click", () => this._move(i, -1));
      det.querySelector(".down").addEventListener("click", () => this._move(i, 1));
      det.querySelector(".delete").addEventListener("click", () => this._remove(i));
      box.appendChild(det);
      this._forms.push(form);
    });
    root.querySelector(".add").addEventListener("click", () => this._add());
    this._shown = rooms.length;
    rooms.forEach((_, i) => this._summary(i));
  }

  _form(schema, data, onChange, labels = {}) {
    const f = document.createElement("ha-form");
    f.hass = this._hass;
    f.schema = schema;
    f.data = data;
    f.computeLabel = (s) => labels[s.name] ?? EDITOR_LABELS[s.name] ?? s.name;
    f.computeHelper = (s) => EDITOR_HELPERS[s.name];
    f.addEventListener("value-changed", (e) => {
      e.stopPropagation();
      onChange(e.detail.value);
    });
    return f;
  }

  _summary(i) {
    const det = this.shadowRoot.querySelectorAll(".list > details")[i];
    if (!det) return;
    const r = this._config.rooms[i];
    const s = this._hass?.states?.[r.entity];
    det.querySelector(".ic ha-icon").setAttribute("icon", r.icon || s?.attributes?.icon || "mdi:lightbulb-group");
    det.querySelector(".t1").textContent = r.name || s?.attributes?.friendly_name || "New room";
    det.querySelector(".t2").textContent = r.entity || "Choose the room's lights";
  }

  _move(i, d) {
    const rooms = this._config.rooms.slice();
    const j = i + d;
    if (j < 0 || j >= rooms.length) return;
    [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
    const open = new Set(this._open || []);
    const oi = open.has(i);
    const oj = open.has(j);
    open.delete(i);
    open.delete(j);
    if (oi) open.add(j);
    if (oj) open.add(i);
    this._open = [...open];
    this._dirty = true;
    this._commit({ ...this._config, rooms });
  }

  _remove(i) {
    const rooms = this._config.rooms.filter((_, j) => j !== i);
    this._open = (this._open || []).filter((j) => j !== i).map((j) => (j > i ? j - 1 : j));
    this._dirty = true;
    this._commit({ ...this._config, rooms });
  }

  _add() {
    const rooms = [...this._config.rooms, { entity: "" }];
    this._open = [...(this._open || []), rooms.length - 1];
    this._dirty = true;
    this._commit({ ...this._config, rooms });
  }

  _commit(config) {
    this._config = config;
    this._render();
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  }
}

async function registerRoomLightsCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(RLC_TAG)) return;
  if (!registry.get(RLC_EDITOR_TAG)) registry.define(RLC_EDITOR_TAG, RoomLightsCardEditor);
  registry.define(RLC_TAG, RoomLightsCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: RLC_TAG,
    name: "Room lights",
    description: "All lights switch plus a tile per room with temperature, humidity and light level.",
  });
  console.info(`%c ROOM-LIGHTS-CARD %c ${RLC_VERSION} `, "background:#ff9800;color:#fff", "");
}

registerRoomLightsCard();
})();

/* ===== vacuum-maintenance-card 2.5.1 ===== */
(() => {
/*
 * Vacuum maintenance card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A robot vacuum's dock and consumables. First, what matters most: the dock's clean and dirty
 * water tanks as two tiles with a tank glyph (red when one needs you – refill it, empty it).
 * Then the consumables in one row of numbers: main brush, side brush, filter and
 * sensors as the share of life left (hours when the life isn't known, e.g. the dock's brush
 * and strainer), what is due next, a quiet line for the dock (water tanks, auto-empty mode)
 * (the dock's own jobs – Empty, Wash mop, Dry mop – are on the robot vacuum card). Tap a number for the details
 * (hours left, about how many cleans that is at your average) and Reset after replacing (or
 * after cleaning, for the sensors, the dock brush and the strainer),
 * which asks first. Entities are found from the vacuum's device and its dock device.
 * See cards/vacuum-maintenance-card/README.md for every option.
 */

const VMC_VERSION = "2.5.1";
const VMC_TAG = "vacuum-maintenance-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  amber: "var(--amber-color, #ffc107)",
  red: "var(--red-color, #f44336)",
  orange: "var(--orange-color, #ff9800)",
  blue: "var(--blue-color, #2196f3)",
  teal: "var(--teal-color, #009688)",
  brown: "var(--brown-color, #795548)",
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const tx = (c, p = 70) => `color-mix(in srgb, ${c} ${p}%, var(--primary-text-color))`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n, d = 0) => (n === null ? "–" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));
const DEAD = ["unavailable", "unknown"];
const human = (s) => {
  const t = String(s || "").replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
};
// A duration sensor's value in hours, whatever its unit.
function hours(s) {
  const v = num(s?.state);
  if (v === null) return null;
  const u = String(s.attributes?.unit_of_measurement || "s");
  return (v * ({ s: 1, min: 60, h: 3600, d: 86400 }[u] || 1)) / 3600;
}
const hText = (h) => (h === null ? "–" : h > 0 && h < 1 ? "under 1 h" : `${fmt(Math.round(h))} h`);

/* Consumables. Life in hours of cleaning (Roborock's defaults); the dock's are unknown. The
   brushes and the filter are replaced; the sensors, the dock brush and the strainer are cleaned
   (clean: true), so their sheet says so ("Reset after cleaning"). */
const ITEMS = [
  { k: "main_brush", name: "Main brush", icon: "mdi:brush-variant", life: 300, tk: ["main_brush_time_left"], sfx: ["_main_brush_time_left"], reset: ["_reset_main_brush_consumable"] },
  { k: "side_brush", name: "Side brush", icon: "mdi:broom", life: 200, tk: ["side_brush_time_left"], sfx: ["_side_brush_time_left"], reset: ["_reset_side_brush_consumable"] },
  { k: "filter", name: "Filter", icon: "mdi:air-filter", life: 150, tk: ["filter_time_left"], sfx: ["_filter_time_left"], reset: ["_reset_air_filter_consumable", "_reset_filter_consumable"] },
  { k: "sensor", name: "Sensors", icon: "mdi:eye-outline", life: 30, tk: ["sensor_time_left"], sfx: ["_sensor_time_left"], reset: ["_reset_sensor_consumable"], clean: true, them: true },
  { k: "dock_brush", name: "Dock brush", icon: "mdi:brush", life: null, tk: ["cleaning_brush_time_left", "dock_maintenance_brush_time_left"], sfx: ["_maintenance_brush_time_left", "_cleaning_brush_time_left"], reset: ["_reset_cleaning_brush_consumable"], clean: true },
  { k: "strainer", name: "Dock strainer", icon: "mdi:filter-outline", life: null, tk: ["strainer_time_left", "dock_strainer_time_left"], sfx: ["_strainer_time_left"], reset: ["_reset_strainer_consumable"], clean: true },
];
const OTHER = {
  total_time: { domain: "sensor", tk: ["total_cleaning_time"], sfx: ["_total_cleaning_time"] },
  total_count: { domain: "sensor", tk: ["total_cleaning_count"], sfx: ["_total_cleaning_count"] },
  clean_box: { domain: "binary_sensor", tk: ["clean_box_empty", "dock_clean_water_box"], sfx: ["_clean_water_box"] },
  dirty_box: { domain: "binary_sensor", tk: ["dirty_box_full", "dock_dirty_water_box"], sfx: ["_dirty_water_box"] },
  empty_mode: { domain: "select", tk: ["dust_collection_mode", "dock_empty_mode"], sfx: ["_empty_mode", "_dust_collection_mode"] },
};

function deviceEntityIds(hass, vacuumId) {
  const reg = hass.entities || {};
  const devId = reg[vacuumId]?.device_id;
  if (!devId) {
    const base = String(vacuumId).split(".")[1] || "";
    return Object.keys(hass.states).filter((id) => base && id.split(".")[1].includes(base));
  }
  const devs = hass.devices || {};
  const dev = devs[devId] || {};
  const own = (dev.identifiers || []).map(([d, i]) => `${d}|${i}_dock`);
  const dockIds = Object.values(devs)
    .filter((d) => d.id !== devId && ((d.identifiers || []).some(([x, i]) => own.includes(`${x}|${i}`)) || (dev.name && d.name === `${dev.name} Dock`)))
    .map((d) => d.id);
  return Object.values(reg)
    .filter((e) => e.device_id === devId || dockIds.includes(e.device_id))
    .map((e) => e.entity_id);
}

function pick(hass, ids, domain, tks, sfx) {
  const reg = hass.entities || {};
  const cands = ids.filter((id) => id.startsWith(`${domain}.`) && hass.states[id]);
  let hit = (tks || []).length ? cands.filter((id) => tks.includes(reg[id]?.translation_key)) : [];
  if (!hit.length) hit = cands.filter((id) => (sfx || []).some((s) => id.endsWith(s)));
  return hit.sort((a, b) => a.length - b.length)[0];
}

function discover(hass, cfg) {
  const ids = deviceEntityIds(hass, cfg.entity);
  const found = { items: {}, resets: {} };
  for (const it of ITEMS) {
    found.items[it.k] = cfg.entities?.[it.k] || pick(hass, ids, "sensor", it.tk, it.sfx);
    found.resets[it.k] = cfg.entities?.[`reset_${it.k}`] || pick(hass, ids, "button", [], it.reset);
  }
  for (const [k, spec] of Object.entries(OTHER)) found[k] = cfg.entities?.[k] || pick(hass, ids, spec.domain, spec.tk, spec.sfx);
  return found;
}

function model(hass, cfg, found) {
  const lives = { ...Object.fromEntries(ITEMS.map((i) => [i.k, i.life])), ...(cfg.lives || {}) };
  const soon = num(cfg.due_soon) ?? 10;
  const items = ITEMS.filter((it) => found.items[it.k] && !(cfg.hide || []).includes(it.k)).map((it) => {
    const st = hass.states[found.items[it.k]];
    const left = DEAD.includes(st?.state) ? null : hours(st);
    const life = num(lives[it.k]);
    const pct = left !== null && life ? Math.max(0, Math.min(100, Math.round((left / life) * 100))) : null;
    const due = left !== null && left <= 0;
    return { ...it, entity: found.items[it.k], reset: found.resets[it.k], left, life, pct, due, soon: !due && left !== null && left <= soon };
  });
  const totalH = hours(hass.states[found.total_time]);
  const count = num(hass.states[found.total_count]?.state);
  const avgH = totalH && count ? totalH / count : null;
  const next = items.filter((i) => i.left !== null).sort((a, b) => a.left - b.left)[0];
  const box = (id) => hass.states[id]?.state;
  return {
    items,
    avgH,
    next,
    clean: found.clean_box ? { e: found.clean_box, bad: box(found.clean_box) === "on" } : null,
    dirty: found.dirty_box ? { e: found.dirty_box, bad: box(found.dirty_box) === "on" } : null,
    empty: found.empty_mode && !DEAD.includes(box(found.empty_mode)) ? { e: found.empty_mode, mode: box(found.empty_mode) } : null,
  };
}

/* ------------------------------------------------------------------------ */
/* Sheet (Bubble look): details, then Reset with a confirmation step        */
/* ------------------------------------------------------------------------ */

const SHEET_CSS = `
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); padding: 25px 18px 18px;
    border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .row { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; }
  /* The text sits under the title, starting on its line (8 + 42px glyph + 6px gap). */
  .text { margin: 12px 0 0 56px; font-size: 15px; line-height: 21px; color: var(--secondary-text-color); }
  .buttons { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); display: grid; gap: 8px; }
  button { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 56px; padding-left: 10px;
    border-radius: 28px; cursor: pointer; font-size: 16px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color); }
  button .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  button .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
  /* Reset is a tap with no state colour of its own, so teal (design tokens → Colours). */
  button.cta { color: #fff; background: ${C.teal}; }
  button.cta .glyph { background: rgba(255,255,255,.2); }
  button.cta .glyph ha-icon { color: #fff; }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  button:active { filter: brightness(.92); }
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

/* A water tank glyph: the tank and its cap, with a drop for clean water or a speckled drop for
   dirty water. It never shows a level – the dock only reports OK / empty / full – so the state
   is carried by the colour and the words alone. */
function tankSvg(kind) {
  const drop = "M12 8.6c-1.8 2.3-2.9 3.9-2.9 5.4a2.9 2.9 0 0 0 5.8 0c0-1.5-1.1-3.1-2.9-5.4z";
  const inner = kind === "dirty"
    ? `<path class="d" d="${drop}" style="opacity:.45"/><circle class="d" cx="11" cy="14.6" r=".9"/><circle class="d" cx="13.1" cy="13.2" r=".7"/><circle class="d" cx="12.6" cy="15.9" r=".6"/>`
    : `<path class="d" d="${drop}"/>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="b" x="5.6" y="5" width="12.8" height="16" rx="3"/>` +
    `<rect class="c" x="9.5" y="2.6" width="5" height="2.4" rx="1"/>${inner}</svg>`;
}
const TANKS = {
  clean: { name: "Clean water", color: C.blue, ok: "OK", bad: "Empty – refill it" },
  dirty: { name: "Dirty water", color: C.brown, ok: "OK", bad: "Full – empty it" },
};

/* Ink alignment (design rule): the line under the title starts on the title's vertical line,
   measured on ink (each first letter has its own side bearing). */
const INK = { ctx: undefined };
function inkBearing(el) {
  if (INK.ctx === undefined) INK.ctx = /jsdom/i.test(navigator.userAgent) ? null : document.createElement("canvas").getContext("2d");
  const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
  if (!INK.ctx || !node) return null;
  const cs = getComputedStyle(el);
  INK.ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return -INK.ctx.measureText(node.textContent.trim()[0]).actualBoundingBoxLeft;
}
function inkSchedule(host, selector) {
  if (host._inkQueued) return;
  host._inkQueued = true;
  requestAnimationFrame(() => {
    host._inkQueued = false;
    const block = host.shadowRoot?.querySelector(selector);
    const [title, line] = block ? [...block.children] : [];
    if (!title || !line || !line.textContent) return;
    const a = inkBearing(title), b = inkBearing(line);
    if (a === null || b === null) return;
    const v = Math.abs(a - b) > 0.2 ? `${(a - b).toFixed(2)}px` : "";
    if (line.style.marginLeft !== v) line.style.marginLeft = v;
  });
}

/* ------------------------------------------------------------------------ */

const CSS = `
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  ha-card { padding: 10px; }
  /* Two-line label row: Mushroom-sized icon slot (decorative, so no circle), the title at edge
     + 46px and "Next: …" under it on the same vertical line (it wraps); the icon is centred on
     the text block. */
  .label { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 0 10px; }
  .slot { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
  .slot ha-icon { --mdc-icon-size: 24px; color: ${C.grey}; }
  .lt { flex: 1; min-width: 0; }
  .t { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .lt.one .t { position: relative; top: 1px; } /* alone, a 20px line reads ~1px high next to the icon */
  .s { display: block; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); cursor: pointer; border-radius: 4px; }
  .s:empty { display: none; }
  .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 10px; text-align: center; }
  .stats > button { all: unset; box-sizing: border-box; display: grid; min-width: 0; cursor: pointer; text-align: center;
    border-left: 1px solid var(--divider-color, rgba(0,0,0,.12)); -webkit-tap-highlight-color: transparent; }
  .stats > button:nth-child(3n+1) { border-left: none; }
  .stats b { font-size: 14px; line-height: 20px; font-weight: 500; color: var(--primary-text-color); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .stats b.soon { color: ${tx(C.amber, 70)}; }
  .stats b.due { color: ${tx(C.red, 85)}; }
  .stats span { font-size: 11px; line-height: 14px; letter-spacing: .4px; color: var(--secondary-text-color); overflow-wrap: break-word; padding: 0 4px; }
  /* The water tanks come first: tiles with a tank glyph in a circle; red glow when one needs you. */
  .tanks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 8px; margin: 0 0 12px; }
  .tank.wide { grid-column: 1 / -1; }
  .tank .shape ha-icon { --mdc-icon-size: 24px; }
  .tanks:empty { display: none; }
  .tank { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; min-width: 0; padding: 11px 10px; border-radius: 10px;
    cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04); -webkit-tap-highlight-color: transparent; }
  .tank.bad { background: ${tint(C.red, 10)}; }
  .tank .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .tank svg { width: 24px; height: 24px; }
  .tank svg .d { fill: currentColor; }
  .tank svg .b { fill: none; stroke: currentColor; stroke-width: 1.6; }
  .tank svg .c { fill: currentColor; }
  .tank .tx { min-width: 0; }
  .tank .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .tank .st { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .tank.bad .st { color: ${tx(C.red, 85)}; font-weight: 500; }
  .stats > button:active, .tank:active { filter: brightness(.92); }
  .stats > button:focus-visible, .tank:focus-visible, .s:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

class VacuumMaintenanceCard extends HTMLElement {
  static getStubConfig(hass) {
    const v = Object.keys(hass?.states || {}).find((id) => id.startsWith("vacuum."));
    return { entity: v || "vacuum.robot" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "entity", required: true, selector: { entity: { domain: "vacuum" } } },
        { type: "grid", name: "", schema: [
          { name: "title", selector: { text: {} } },
          { name: "due_soon", selector: { number: { min: 0, max: 100, mode: "box", unit_of_measurement: "h" } } },
        ] },
        { name: "hide_dock", selector: { boolean: {} } },
        { name: "lives", selector: { object: {} } },
      ],
      computeLabel: (s) =>
        ({ entity: "Vacuum", title: "Title", due_soon: "Due soon below", hide_dock: "Hide the water tanks and auto-empty", lives: "Lives in hours (YAML)" })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          due_soon: "A part with fewer hours left than this shows in amber. Default 10.",
          lives: "Hours of cleaning per part, for the %. Defaults: main_brush 300, side_brush 200, filter 150, sensor 30. Add dock_brush / strainer to show them as %.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.entity || !String(config.entity).startsWith("vacuum.")) throw new Error("Set entity to your vacuum (vacuum.…)");
    this._config = { ...config };
    this._built = false;
    this._found = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
    this._syncSheet();
  }

  getCardSize() {
    return 3;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  disconnectedCallback() {
    this._closeSheet();
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="label"><div class="slot"><ha-icon icon="mdi:wrench-clock"></ha-icon></div>
        <div class="lt"><div class="t"></div><span class="s" role="button" tabindex="0"></span></div></div>
      <div class="tanks"></div><div class="stats"></div></ha-card>`;
    const card = root.querySelector("ha-card");
    card.addEventListener("click", (e) => {
      const b = e.target.closest("[data-k]");
      if (b) return this._openSheet(b.dataset.k);
      if (e.target.closest(".s") && this._m?.next) return this._openSheet(this._m.next.k);
      const c = e.target.closest("[data-e]");
      if (c) this._more(c.dataset.e);
    });
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".s")) {
        e.preventDefault();
        if (this._m?.next) this._openSheet(this._m.next.k);
      }
    });
    this._built = true;
    this._keys = {};
  }

  _more(id) {
    if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    if (!this._found || this._regRef !== hass.entities || !Object.values(this._found.items).some(Boolean)) {
      this._found = discover(hass, this._config);
      this._regRef = hass.entities;
    }
    const m = model(hass, this._config, this._found);
    this._m = m;
    const root = this.shadowRoot;
    const set = (sel, v, html = false) => {
      const n = root.querySelector(sel);
      if (n && (html ? n._h !== v : n.textContent !== v)) html ? ((n.innerHTML = v), (n._h = v)) : (n.textContent = v);
    };
    set(".t", this._config.title || (this._config.hide_dock ? "Maintenance" : "Dock & maintenance"));
    const s = root.querySelector(".s");
    const next = m.next;
    set(".s", !next ? "" : next.due ? `${next.name}: due now` : `Next: ${next.name.toLowerCase()} in ${hText(next.left)}`);
    root.querySelector(".lt").classList.toggle("one", !next);
    s.style.color = next?.due ? tx(C.red, 85) : "";

    const stats = root.querySelector(".stats");
    const sk = m.items.map((i) => i.k).join();
    if (sk !== this._keys.stats) {
      stats.innerHTML = m.items.map((i) => `<button data-k="${i.k}" aria-haspopup="dialog"><b></b><span>${esc(i.name)}</span></button>`).join("");
      this._keys.stats = sk;
    }
    for (const i of m.items) {
      const b = stats.querySelector(`[data-k="${i.k}"] b`);
      const v = i.left === null ? "–" : i.due ? "Now" : i.pct !== null ? `${i.pct}%` : hText(i.left);
      if (b.textContent !== v) b.textContent = v;
      b.classList.toggle("due", i.due);
      b.classList.toggle("soon", i.soon);
    }

    // The water tanks, first and largest. A tank that needs you glows red and says what to do.
    const tanks = root.querySelector(".tanks");
    const list = this._config.hide_dock ? [] : [["clean", m.clean], ["dirty", m.dirty], ["empty", m.empty]].filter(([, x]) => x);
    const tk = list.map(([k]) => k).join();
    if (tk !== this._keys.tanks) {
      tanks.innerHTML = list
        .map(([k, x]) => `<button class="tank${k === "empty" ? " wide" : ""}" data-tank="${k}" data-e="${esc(x.e)}"><div class="shape"></div>
          <div class="tx"><div class="nm">${esc(k === "empty" ? "Auto-empty" : TANKS[k].name)}</div><div class="st"></div></div></button>`).join("");
      this._keys.tanks = tk;
    }
    for (const [k, x] of list) {
      const b = tanks.querySelector(`[data-tank="${k}"]`);
      const shape = b.querySelector(".shape");
      const st = b.querySelector(".st");
      if (k === "empty") {
        // Auto-empty: a setting, not a state – neutral, laid out exactly like the tanks above.
        shape.style.background = tint(C.grey, 20);
        shape.style.color = C.grey;
        if (!shape.firstElementChild) shape.innerHTML = `<ha-icon icon="mdi:delete-empty-outline"></ha-icon>`;
        const v = human(x.mode);
        if (st.textContent !== v) st.textContent = v;
        continue;
      }
      const spec = TANKS[k];
      const color = x.bad ? C.red : spec.color;
      b.classList.toggle("bad", x.bad);
      shape.style.background = tint(color, 20);
      shape.style.color = color;
      const svg = tankSvg(k);
      if (shape.dataset.svg !== svg) {
        shape.dataset.svg = svg;
        shape.innerHTML = svg;
      }
      const label = x.bad ? spec.bad : spec.ok;
      if (st.textContent !== label) st.textContent = label;
    }
    inkSchedule(this, ".lt");
  }

  /* ---- Details sheet ---- */

  _openSheet(k) {
    this._closeSheet();
    const host = document.createElement("vmc-sheet");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${SHEET_CSS}</style><div class="backdrop"></div><div class="dialog" role="dialog" aria-modal="true"></div>`;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this._closeSheet();
      }
    };
    root.querySelector(".backdrop").addEventListener("click", () => this._closeSheet());
    root.querySelector(".dialog").addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const sh = this._sheet;
      const it = this._m.items.find((i) => i.k === sh.k);
      if (b.dataset.a === "reset") {
        sh.confirm = true;
        sh.key = "";
        this._syncSheet();
        root.querySelector("button.cta")?.focus();
      } else if (b.dataset.a === "confirm") {
        this._closeSheet();
        if (it?.reset) this._call("button", "press", { entity_id: it.reset }, `reset the ${it.name.toLowerCase()}`);
      } else if (b.dataset.a === "history") {
        this._closeSheet();
        this._more(it?.entity);
      } else this._closeSheet();
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
    this._sheet = { host, root, onKey, k, confirm: false, key: "" };
    this._syncSheet();
    root.querySelector("button")?.focus();
  }

  _syncSheet() {
    const sh = this._sheet;
    if (!sh || !this._m) return;
    const it = this._m.items.find((i) => i.k === sh.k);
    if (!it) return this._closeSheet();
    const avg = this._m.avgH;
    const cleans = it.left !== null && avg ? Math.round(it.left / avg) : null;
    // Replaced parts (brushes, filter) vs cleaned ones (sensors, dock brush, strainer).
    const it_ = it.them ? "them" : "it";
    const every = !it.life ? "" : it.clean ? ` Clean ${it_} every ${fmt(it.life)} h of use.` : ` Replace every ${fmt(it.life)} h of cleaning.`;
    let text;
    if (sh.confirm)
      text = `Only after ${it.clean ? `cleaning ${it_}` : "fitting a new one"}: the countdown starts again${it.life ? ` from ${fmt(it.life)} h` : ""}.`;
    else if (it.left === null) text = "Not reported right now.";
    else if (it.due) text = `${it.clean ? `Due for cleaning now.` : "Due now."}${every}`;
    else
      text = `${hText(it.left)} left${it.pct !== null ? ` (${it.pct}%)` : ""}${cleans !== null ? `, about ${fmt(cleans)} clean${cleans === 1 ? "" : "s"} at your average of ${fmt(Math.round(avg * 60))} min` : ""}.${every}`;
    const color = it.due ? C.red : sh.confirm ? C.teal : C.grey;
    const key = [sh.k, sh.confirm, text, !!it.reset].join("|");
    if (key === sh.key) return;
    sh.key = key;
    const glyph = (icon) => `<span class="glyph"><ha-icon icon="${icon}"></ha-icon></span>`;
    const buttons = sh.confirm
      ? `<button class="cta" data-a="confirm">${glyph("mdi:restore")}Reset</button><button data-a="close">${glyph("mdi:close")}Cancel</button>`
      : `${it.reset ? `<button class="cta" data-a="reset">${glyph("mdi:restore")}Reset after ${it.clean ? "cleaning" : "replacing"}</button>` : ""}
         <button data-a="history">${glyph("mdi:chart-line")}History</button><button data-a="close">${glyph("mdi:close")}Close</button>`;
    sh.root.querySelector(".dialog").setAttribute("aria-label", it.name);
    sh.root.querySelector(".dialog").innerHTML = `<div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(it.icon)}" style="color:${color}"></ha-icon></div>
      <div class="title">${esc(sh.confirm ? `Reset ${it.name.toLowerCase()}?` : it.name)}</div></div>
      <div class="text">${esc(text)}</div><div class="buttons">${buttons}</div>`;
  }

  _closeSheet() {
    const sh = this._sheet;
    if (!sh) return;
    document.removeEventListener("keydown", sh.onKey, true);
    sh.host.remove();
    this._sheet = null;
  }

  async _call(domain, service, data, what = "do that") {
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || `Couldn't ${what}.` }, bubbles: true, composed: true }));
    }
  }
}

async function registerVacuumMaintenanceCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(VMC_TAG)) return;
  registry.define(VMC_TAG, VacuumMaintenanceCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: VMC_TAG,
    name: "Vacuum maintenance",
    description: "Robot vacuum consumables as numbers, what is due next, dock tanks, and Reset after replacing.",
  });
  console.info(`%c VACUUM-MAINTENANCE-CARD %c ${VMC_VERSION} `, "background:#9e9e9e;color:#fff", "");
}

registerVacuumMaintenanceCard();
})();

/* ===== weather-presence-card 1.4.2 ===== */
(() => {
/*
 * Weather & presence card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A slim block for the top of a climate section: the weather (condition, your own
 * outdoor sensor and the forecast service's temperature) with two pills on the
 * right – who is home (tap for e.g. the security dashboard) and a link pill (tap
 * for e.g. the climate dashboard). Either pill can be left out, e.g. the link pill
 * on the very dashboard it would link to. Tap the weather for the forecast, your own
 * temperature for its sensor (or long-press anywhere on the weather).
 * See cards/weather-presence-card/README.md for every option.
 */

const WPC_VERSION = "1.4.2";
const WPC_TAG = "weather-presence-card";
const HISTORY_DAYS = 7;
const HOLD_MS = 500;

// One meaning per colour (design-tokens → Colours): green = someone home, teal = you can tap
// this (the link pill's icon), grey = off / neutral. Weather icons keep their literal colours.
const C = {
  grey: "var(--grey-color, #9e9e9e)",
  teal: "var(--teal-color, #009688)",
  green: "var(--green-color, #4caf50)",
  blue: "var(--blue-color, #2196f3)",
};
const WEATHER = {
  sunny: ["mdi:weather-sunny", "var(--amber-color, #ffc107)"],
  "clear-night": ["mdi:weather-night", "var(--indigo-color, #3f51b5)"],
  partlycloudy: ["mdi:weather-partly-cloudy", "var(--amber-color, #ffc107)"],
  cloudy: ["mdi:weather-cloudy", C.grey],
  fog: ["mdi:weather-fog", C.grey],
  rainy: ["mdi:weather-rainy", C.blue],
  pouring: ["mdi:weather-pouring", C.blue],
  snowy: ["mdi:weather-snowy", "var(--light-blue-color, #03a9f4)"],
  "snowy-rainy": ["mdi:weather-snowy-rainy", "var(--light-blue-color, #03a9f4)"],
  hail: ["mdi:weather-hail", "var(--light-blue-color, #03a9f4)"],
  lightning: ["mdi:weather-lightning", "var(--deep-purple-color, #673ab7)"],
  "lightning-rainy": ["mdi:weather-lightning-rainy", "var(--deep-purple-color, #673ab7)"],
  windy: ["mdi:weather-windy", C.teal],
  "windy-variant": ["mdi:weather-windy-variant", C.teal],
  exceptional: ["mdi:alert-circle-outline", "var(--red-color, #f44336)"],
};

const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
// Readable coloured text: mixed toward the text colour, never the raw colour on white.
const tx = (c, p = 70) => `color-mix(in srgb, ${c} ${p}%, var(--primary-text-color))`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const fmt = (n, d = 0) => (n === null ? "–" : n.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d }));
// 14.23 → "14.2°": the entity's own value, whatever its unit (no hard-coded C).
const temp = (v) => (num(v) === null ? "–" : `${fmt(num(v), 1)}°`);

// "45 min", "3 h", "2 d" – a space and short units, like every card.
function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h`;
  return `${Math.floor(m / 1440)} d`;
}

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  /* Spacing follows Mushroom: content starts 10px from the card edge. */
  ha-card { padding: 12px 10px; container-type: inline-size; }
  .wrap { display: flex; align-items: center; gap: 10px; }
  .wx { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; cursor: pointer; -webkit-tap-highlight-color: transparent;
    user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; border-radius: 10px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .shape ha-icon { --mdc-icon-size: 24px; }
  .txt { min-width: 0; }
  /* Text is never cut: a condition too long for its row wraps instead. */
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    overflow-wrap: break-word; }
  .sc { display: flex; flex-wrap: wrap; column-gap: 9px; font-size: 12px; line-height: 16px; letter-spacing: .4px;
    color: var(--secondary-text-color); }
  /* Each reading is its own tap target (more-info of its own sensor) and stays whole. */
  .v { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;
    cursor: pointer; border-radius: 4px; -webkit-tap-highlight-color: transparent; }
  .v[hidden] { display: none; }
  .v ha-icon, .pill ha-icon { flex: none; width: var(--mdc-icon-size); height: var(--mdc-icon-size); }
  /* Small reading icons are quiet secondary information, the same on every card. */
  .v ha-icon { --mdc-icon-size: 14px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .pills { flex: none; display: flex; gap: 8px; align-items: center; }
  /* Primary pills: 36px – the height of the icon circle – on every screen, so circle, text block
     and pills share one centre line and the pills' edges line up with the circle. */
  .pill { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; padding: 0 14px 0 10px; border-radius: 18px; cursor: pointer; font-size: 13px; font-weight: 600; letter-spacing: .2px;
    white-space: nowrap;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--primary-text-color);
    -webkit-tap-highlight-color: transparent; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  /* The pills stay beside the weather whenever they fit there (the readings may wrap onto two
     lines). Only when they don't – measured in _fit() – do they move to a row of wide buttons
     below it, e.g. two pills on a 375px phone: equal widths while both labels fit, a longer
     label takes what it needs, and they wrap only as a last resort (the button-row pattern). */
  .wrap.stacked { flex-wrap: wrap; row-gap: 8px; }
  .wrap.stacked .wx { flex: 1 1 100%; }
  .wrap.stacked .pills { flex: 1 1 100%; flex-wrap: wrap; }
  .wrap.stacked .pill { flex: 1 1 0; min-width: max-content; }
  /* Someone home: green (Home Assistant's colour for a person at home), as an "on" pill. Away stays grey. */
  .pill.home { background: ${tint(C.green, 18)}; color: ${tx(C.green, 70)}; }
  .pill.home ha-icon { color: ${C.green}; }
  .pill.link { padding-right: 4px; }
  .pill.link ha-icon { color: ${C.teal}; }
  /* The chevron is a trailing glyph, not the pill's icon: 16px, grey. */
  .pill.link ha-icon.ch { --mdc-icon-size: 16px; color: ${C.grey}; margin-left: -3px; }
  .pill:active, .wx:active, .v:active { filter: brightness(.92); }
  /* Pressing a reading darkens the reading, not the whole weather block. */
  .wx:has(.v:active) { filter: none; }
  .pill:focus-visible, .wx:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .v:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
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

class WeatherPresenceCard extends HTMLElement {
  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {});
    return { weather: ids.find((i) => i.startsWith("weather.")) || "" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "weather", required: true, selector: { entity: { domain: "weather" } } },
        { type: "grid", name: "", schema: [
          { name: "temperature", selector: { entity: { domain: "sensor", device_class: "temperature" } } },
          { name: "temperature_name", selector: { text: {} } },
        ] },
        { name: "weather_name", selector: { text: {} } },
        { type: "expandable", name: "presence", title: "Presence pill", icon: "mdi:home-account", expanded: true, schema: [
          { name: "entity", selector: { entity: { domain: ["input_boolean", "binary_sensor", "zone", "group", "person"] } } },
          { name: "navigation_path", selector: { navigation: {} } },
        ] },
        { type: "expandable", name: "link", title: "Link pill", icon: "mdi:link-variant", expanded: true, schema: [
          { name: "hide", selector: { boolean: {} } },
          { type: "grid", name: "", schema: [
            { name: "name", selector: { text: {} } },
            { name: "icon", selector: { icon: {} } },
          ] },
          { name: "navigation_path", selector: { navigation: {} } },
        ] },
      ],
      computeLabel: (s) =>
        ({
          weather: "Weather",
          temperature: "Your outdoor temperature sensor",
          temperature_name: "Its label (default Real)",
          weather_name: "Label for the weather service's temperature (default Forecast)",
          entity: "Someone home (on / home / count above 0)",
          navigation_path: "Tap goes to",
          name: "Name",
          icon: "Icon",
          hide: "Hide this pill",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          weather: "Tap the weather for the forecast; tap your own temperature (or long-press) for its sensor.",
          hide: "E.g. on the dashboard it links to. Its settings below are kept.",
        })[s.name],
    };
  }

  setConfig(config) {
    if (!config?.weather) throw new Error("Set a weather entity");
    this._config = { ...config };
    this._built = false;
    this._since = undefined;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._track();
    this._render();
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    clearInterval(this._tick);
    this._tick = setInterval(() => this._hass && this._render(), 60000);
    this._observe();
  }

  disconnectedCallback() {
    clearInterval(this._tick);
    this._ro?.disconnect();
  }

  /* Re-check the layout whenever the card's width changes (rotation, sidebar, column count). */
  _observe() {
    const wrap = this.shadowRoot?.querySelector(".wrap");
    if (!wrap || typeof ResizeObserver === "undefined") return;
    this._ro = this._ro || new ResizeObserver(() => this._fit());
    this._ro.disconnect();
    this._ro.observe(wrap);
  }

  /* Do the pills need their own row? They fit beside the weather when the icon, the wider of the
     condition and the widest single reading (the readings may wrap, the condition may not be cut)
     and the pills at their natural width all fit in the row. */
  static stacks(available, weather, gap, pills) {
    return weather + gap + pills > available + 0.5;
  }

  /* Measures natural widths, so the answer is the same whichever layout is showing (no flip-flop). */
  _fit() {
    const root = this.shadowRoot;
    const wrap = root?.querySelector(".wrap");
    const pills = root ? [...root.querySelectorAll(".pill")] : [];
    if (!wrap || !pills.length || !wrap.clientWidth) return; // nothing to place, or not laid out (hidden)
    const range = this.ownerDocument.createRange();
    const contentW = (node) => (range.selectNodeContents(node), range.getBoundingClientRect().width);
    const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
    const wx = root.querySelector(".wx");
    // The condition's natural width: measured on one line, whether or not it is wrapping now.
    const nm = root.querySelector(".nm");
    nm.style.whiteSpace = "nowrap";
    const cond = contentW(nm);
    nm.style.whiteSpace = "";
    const text = Math.max(cond, ...[...root.querySelectorAll(".sc .v:not([hidden])")].map((v) => v.getBoundingClientRect().width));
    const weather = root.querySelector(".shape").offsetWidth + px(wx, "columnGap") + text;
    const pillsW =
      pills.reduce((s, p) => s + contentW(p) + px(p, "paddingLeft") + px(p, "paddingRight"), 0) +
      px(root.querySelector(".pills"), "columnGap") * (pills.length - 1);
    wrap.classList.toggle("stacked", WeatherPresenceCard.stacks(wrap.clientWidth, weather, px(wrap, "columnGap"), pillsW));
  }

  /* The link pill, or null when it is hidden or has nowhere to go (an editor-cleared link is {}). */
  _link() {
    const l = this._config.link;
    return l && typeof l === "object" && !l.hide && l.navigation_path ? l : null;
  }

  _presenceId() {
    const p = this._config.presence;
    return typeof p === "string" ? p : p?.entity;
  }

  _home(s) {
    if (!s) return null;
    if (["unavailable", "unknown"].includes(s.state)) return null;
    if (s.entity_id?.startsWith("zone.")) return Number(s.state) > 0;
    return ["on", "home"].includes(s.state);
  }

  /* When did the house become empty? Live change if we saw it, else from history (restart-proof). */
  _track() {
    const id = this._presenceId();
    if (!id || !this._hass) return;
    const s = this._hass.states[id];
    const home = this._home(s);
    if (this._lastHome === true && home === false) this._since = Date.parse(s.last_changed);
    if (this._lastHome === undefined && home === false) this._loadSince(id);
    this._lastHome = home;
  }

  async _loadSince(id) {
    const hass = this._hass;
    try {
      const h = await hass.callWS({
        type: "history/history_during_period",
        start_time: new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString(),
        entity_ids: [id],
        minimal_response: true,
        no_attributes: true,
        significant_changes_only: false,
      });
      const rows = h?.[id] || [];
      const t = (r) => (r.lu ?? r.lc ?? 0) * 1000 || Date.parse(r.last_changed || r.last_updated || 0);
      let last = -1;
      rows.forEach((r, i) => {
        if (this._home({ entity_id: id, state: r.s ?? r.state })) last = i;
      });
      this._since = last >= 0 && last < rows.length - 1 ? t(rows[last + 1]) : Date.now() - HISTORY_DAYS * 86400000 - 1;
    } catch (e) {
      this._since = Date.parse(hass.states[id]?.last_changed);
    }
    this._render();
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const link = this._link();
    const c = this._config;
    const np = (this._presenceId() ? 1 : 0) + (link ? 1 : 0);
    // The readings are built once and updated in place, so a focused one keeps its focus.
    // Your own temperature is a button of its own (its sensor); the forecast belongs to the weather.
    root.innerHTML = `<style>${CSS}</style><ha-card><div class="wrap">
      <div class="wx" role="button" tabindex="0"><div class="shape"><ha-icon></ha-icon></div>
        <div class="txt"><div class="nm"></div><div class="sc">${
          c.temperature ? `<button class="v real" data-e="${esc(c.temperature)}"><ha-icon icon="mdi:thermometer"></ha-icon><span></span></button>` : ""
        }<span class="v fc" data-e="${esc(c.weather)}"><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon><span></span></span></div></div></div>
      <div class="pills"${np ? "" : ` style="display:none"`}>
        ${this._presenceId() ? `<button class="pill pres"><ha-icon></ha-icon><span></span></button>` : ""}
        ${link ? `<button class="pill link"><ha-icon></ha-icon><span></span><ha-icon class="ch" icon="mdi:chevron-right"></ha-icon></button>` : ""}
      </div></div></ha-card>`;
    const wx = root.querySelector(".wx");
    let timer = null;
    let held = false;
    wx.addEventListener("pointerdown", () => {
      held = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        held = true;
        this._fire("haptic", "medium");
        this._more(this._config.temperature || this._config.weather);
      }, HOLD_MS);
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((t) => wx.addEventListener(t, () => clearTimeout(timer)));
    wx.addEventListener("contextmenu", (e) => e.preventDefault());
    // After a hold, the finger lifting must not "click" the dialog that just opened under it.
    wx.addEventListener("touchend", (e) => held && e.cancelable && e.preventDefault(), { passive: false });
    // A tap on a reading opens its own sensor; anywhere else on the weather, the forecast.
    wx.addEventListener("click", (e) => {
      if (held) return (held = false);
      const v = e.target.closest?.("[data-e]");
      this._more(v ? v.dataset.e : this._config.weather);
    });
    wx.addEventListener("keydown", (e) => {
      if (e.target !== wx || (e.key !== "Enter" && e.key !== " ")) return; // the reading button handles its own keys
      e.preventDefault();
      this._more(this._config.weather);
    });
    root.querySelector(".pres")?.addEventListener("click", () => {
      const p = this._config.presence;
      if (p?.navigation_path) this._navigate(p.navigation_path);
      else this._more(this._presenceId());
    });
    root.querySelector(".link")?.addEventListener("click", () => link?.navigation_path && this._navigate(link.navigation_path));
    this._built = true;
    this._observe();
    this.ownerDocument.fonts?.ready?.then(() => this._fit());
  }

  _render() {
    inkSchedule(this, ".txt", () => this._fit());
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    const root = this.shadowRoot;
    let changed = false;
    const set = (node, v, html = false) => {
      if (!node) return;
      // HTML is compared with what was last written (innerHTML never serialises back to the same
      // string), so a reading under the finger isn't rebuilt mid-tap.
      if (html ? node._h !== v : node.textContent !== v) {
        html ? ((node.innerHTML = v), (node._h = v)) : (node.textContent = v);
        changed = true;
      }
    };

    const w = hass.states[this._config.weather];
    // The weather circle is a tap target (it opens the forecast), and a tap target is never grey:
    // grey weather (cloudy, fog, unknown) shows teal (design tokens → Colours).
    const [icon, wc] = WEATHER[w?.state] || ["mdi:weather-cloudy", C.grey];
    const color = wc === C.grey ? C.teal : wc;
    const shape = root.querySelector(".shape");
    shape.style.background = tint(color, 20);
    shape.querySelector("ha-icon").setAttribute("icon", icon);
    shape.querySelector("ha-icon").style.color = color;
    const cond = !w ? "Weather unavailable" : hass.formatEntityState ? hass.formatEntityState(w) : w.state.charAt(0).toUpperCase() + w.state.slice(1);
    set(root.querySelector(".nm"), cond);
    const real = root.querySelector(".v.real");
    if (real) set(real.querySelector("span"), `${this._config.temperature_name || "Real"} ${temp(hass.states[this._config.temperature]?.state)}`);
    const fc = root.querySelector(".v.fc");
    if (fc.hidden !== !w) {
      fc.hidden = !w;
      changed = true;
    }
    if (w) set(fc.querySelector("span"), `${this._config.weather_name || "Forecast"} ${temp(w.attributes?.temperature)}`);

    const pres = root.querySelector(".pres");
    if (pres) {
      const home = this._home(hass.states[this._presenceId()]);
      pres.classList.toggle("home", home === true);
      pres.querySelector("ha-icon").setAttribute("icon", home ? "mdi:home-account" : "mdi:home-export-outline");
      const away = this._since ? (Date.now() - this._since > HISTORY_DAYS * 86400000 ? `${HISTORY_DAYS} d+` : ago(Date.now() - this._since)) : "";
      const label = home === null ? "Presence –" : home ? "Home" : away ? `Away · ${away}` : "Away";
      set(pres.querySelector("span"), label);
    }
    const link = root.querySelector(".link");
    const lc = this._link();
    if (link && lc) {
      link.querySelector("ha-icon").setAttribute("icon", lc.icon || "mdi:arrow-right");
      set(link.querySelector("span"), lc.name || "Open");
    }
    // New text ("Away · 3 h", a longer condition) can change what fits; check once per frame.
    if (changed && this._ro && !this._fitQueued) {
      this._fitQueued = true;
      requestAnimationFrame(() => {
        this._fitQueued = false;
        this._fit();
      });
    }
  }

  _more(entityId) {
    if (entityId) this._fire("hass-more-info", { entityId });
  }

  _navigate(path) {
    history.pushState(null, "", path);
    this._fire("location-changed", { replace: false });
  }

  _fire(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }
}

async function registerWeatherPresenceCard() {
  await window.customElements.whenDefined("home-assistant");
  const registry = window.customElements;
  if (registry.get(WPC_TAG)) return;
  registry.define(WPC_TAG, WeatherPresenceCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: WPC_TAG,
    name: "Weather & presence",
    description: "Weather with your own outdoor temperature, plus a presence pill and a link pill.",
  });
  console.info(`%c WEATHER-PRESENCE-CARD %c ${WPC_VERSION} `, "background:#009688;color:#fff", "");
}

registerWeatherPresenceCard();
})();
