/*
 * Home Assistant custom cards – https://github.com/igiannakas/homeassistant-custom-cards
 * Built from the cards folder by scripts/build.js – edit the cards, not this file.
 * air-quality-card, climate-modes-card, enclosure-filter-card, energy-summary-card, home-status-card, mmu-lanes-card, printer-status-card, printer-temps-card, room-lights-card, weather-presence-card
 */

/* ===== air-quality-card 1.1.9 ===== */
(() => {
/*
 * Air quality card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Every room's air in one card: a label row that sums up the house, and a tile
 * per room with its status (Excellent / Elevated / Poor / Ventilate) and its key
 * readings – CO₂, PM2.5 and VOC always, plus whatever else is causing trouble.
 * Readings that are out of range take their level's colour; a room that needs a
 * window opened glows red. Tap a room for its own air-quality dashboard.
 * See cards/air-quality-card/README.md for every option.
 */

const AQC_VERSION = "1.1.9";
const AQC_TAG = "air-quality-card";

const C = {
  green: "var(--green-color, #4caf50)",
  amber: "var(--amber-color, #ffc107)",
  orange: "var(--orange-color, #ff9800)",
  red: "var(--red-color, #f44336)",
  grey: "var(--grey-color, #9e9e9e)",
};
const TIERS = [
  { color: C.green, icon: "mdi:leaf", word: "Excellent" },
  { color: C.amber, icon: "mdi:information-outline", word: "Elevated" },
  { color: C.orange, icon: "mdi:alert-outline", word: "Poor" },
  { color: C.red, icon: "mdi:alert-circle-outline", word: "Poor air" },
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
  co2: { suffix: "co2", t: [800, null, 1000], label: "CO₂", digits: 0, unit: "ppm", always: true, gas: true },
  voc: { suffix: "voc_index", t: [150, 250, 400], label: "VOC", digits: 0, always: true, gas: true },
  // Particles: always shown, each with its size class as the label, on a line of their own.
  pm1: { suffix: "pm1", t: [12, null, 36], label: "PM1", digits: 1, always: true, pm: true },
  pm2_5: { suffix: "pm2_5", t: [12, null, 36], label: "PM2.5", digits: 1, always: true, pm: true },
  pm4: { suffix: "pm4", t: [17, null, 51], label: "PM4", digits: 1, always: true, pm: true },
  pm10: { suffix: "pm10", t: [17, null, 51], label: "PM10", digits: 1, always: true, pm: true },
  nox: { suffix: "nox_index", t: [20, 150, 300], label: "NOx", digits: 0, gas: true },
};
const ORDER = ["co2", "voc", "nox", "pm1", "pm2_5", "pm4", "pm10"];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
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
  if (worst === 3 && readings.some((r) => r.level === 3 && r.gas)) {
    tier.word = "Ventilate";
    tier.icon = "mdi:window-open-variant";
  }
  // Always CO₂, VOC and every PM size; NOx only while it is the cause.
  const shown = readings.filter((r) => r.always || (worst > 0 && r.level === worst));
  return { name: room.name || "Room", worst, tier, readings: shown, missing: !readings.length };
}

const CSS = `
  :host { display: block; }
  ha-card { padding: 10px; }
  /* Spacing follows Mushroom: everything inside the card starts 10px from its edge (card padding).
     Label row: 40px high (room for the 24px switch). The icon is Mushroom-sized (24px) and sits where
     the glyph of a 36px Mushroom icon would, so it lines up with the icons of Mushroom, Tado and
     All lights cards and the title starts where theirs do. Only a tappable icon gets the filled circle. */
  .label { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 0 8px; }
  .label > ha-icon:first-child { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; --mdc-icon-size: 24px; }
  /* Card label row: same on every card – 18px icon, 14px / 500 title (like Mushroom names), 12px status. */
  /* top: 1px – optical centring: the line box sits ~1px high against an icon of the same height. */
  .title { position: relative; top: 1px; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .sum { margin-left: auto; min-width: 0; font-size: 12px; line-height: 20px; font-weight: 500; letter-spacing: .4px;
    color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .m { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .row { display: flex; flex-wrap: wrap; column-gap: 7px; }
  /* Particle sizes as a tidy 2×2 (PM1 PM2.5 / PM4 PM10); four across when the tile is wide. */
  .row.pm { display: grid; grid-template-columns: repeat(2, max-content); column-gap: 10px; }
  @container (min-width: 300px) { .row.pm { grid-template-columns: repeat(4, max-content); } }
  /* Phone-width tiles: CO₂ is always in ppm, so the unit gives way and status, CO₂ and VOC share one line. */
  @container (max-width: 270px) { .v small { display: none; } }
  /* Particle size class as a small label in front of each PM value. */
  /* Labels and units are the same size as the values, only lighter. */
  .k { margin-right: 3px; color: color-mix(in srgb, var(--secondary-text-color) 70%, transparent); }
  .v.hot .k { color: inherit; }
  /* One type style for the whole block: same size and weight; colour alone marks a problem. */
  .st { white-space: nowrap; }
  .v { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
  .v ha-icon { --mdc-icon-size: 14px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .v small { font-size: inherit; color: color-mix(in srgb, var(--secondary-text-color) 70%, transparent); }
  .v.hot small { color: inherit; }
  .room:active { filter: brightness(.94); }
  .room:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Phone width: tiles are ~170px, so tighten the tile's sides and the PM grid so the four PM
     readings never run past the tile edge. (A container can't style itself, so the tile padding
     keys off the grid's width and the text rules off the tile's.) */
  @container rooms (max-width: 400px) { .room { padding: 11px 8px; gap: 8px; } }
  @container (max-width: 175px) { .row { column-gap: 5px; } .row.pm { column-gap: 5px; } .m { font-size: 11.5px; letter-spacing: .2px; } }
  /* Very small phones: one PM reading per line rather than running past the edge. */
  @container (max-width: 152px) { .row.pm { grid-template-columns: max-content; } }
`;

class AirQualityCard extends HTMLElement {
  static getStubConfig() {
    return { title: "Air quality", rooms: [] };
  }

  static getConfigForm() {
    const sensor = { entity: { domain: "sensor" } };
    return {
      schema: [
        { name: "title", selector: { text: {} } },
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
      ],
      computeLabel: (s) => ({ title: "Title", rooms: "Rooms" })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          rooms: "With a prefix, the card finds <prefix>co2, pm1, pm2_5, pm4, pm10, voc_index and nox_index by itself.",
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

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const c = this._config;
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="label"><ha-icon icon="mdi:leaf"></ha-icon><span class="title">${esc(c.title ?? "Air quality")}</span><span class="sum"></span></div>
      <div class="rooms" style="--cols:${Math.max(1, Math.min(4, Number(c.columns) || 2))}">
        ${c.rooms
          .map((r, i) => `<button class="room" data-i="${i}"><span class="shape"><ha-icon></ha-icon></span>
            <span class="txt"><div class="nm"></div><div class="m"></div></span></button>`)
          .join("")}
      </div></ha-card>`;
    root.querySelectorAll(".room").forEach((b) =>
      b.addEventListener("click", () => {
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
  }

  _render() {
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
      const one = (r) => {
            const v = r.value === null ? "–" : r.value.toFixed(r.digits);
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
      }
    });

    // The house in a few words.
    const worst = models.reduce((a, m) => Math.max(a, m.worst), 0);
    let sum = "All excellent";
    if (worst === 3) {
      // Each problem by name: rooms to air out, and rooms with too many particles.
      const names = (word) => models.filter((m) => m.worst === 3 && m.tier.word === word).map((m) => m.name).join(", ");
      sum = [names("Ventilate") && `Ventilate ${names("Ventilate")}`, names("Poor air") && `Poor air in ${names("Poor air")}`]
        .filter(Boolean)
        .join(" · ");
    } else if (worst === 2) {
      sum = `Poor in ${models.filter((m) => m.worst === 2).map((m) => m.name).join(", ")}`;
    } else if (worst === 1) {
      const n = models.filter((m) => m.worst === 1).length;
      sum = `${n} ${n === 1 ? "room" : "rooms"} elevated`;
    }
    const sumEl = root.querySelector(".sum");
    if (sumEl.textContent !== sum) sumEl.textContent = sum;
    const lab = root.querySelector(".label ha-icon");
    const lt = { ...TIERS[worst] };
    lab.setAttribute("icon", worst ? lt.icon : "mdi:leaf");
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

/* ===== climate-modes-card 1.1.4 ===== */
(() => {
/*
 * Climate modes card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Whole-house shortcuts in one card: a label row (icon, title, what the rooms are
 * on, or a switch) and a row of mode tiles. A tile glows in its colour while it is
 * the active mode. Made for heating presets across several thermostats, and just
 * as happy with any entity + state (e.g. an aircon speed helper).
 * See cards/climate-modes-card/README.md for every option.
 */

const CMC_VERSION = "1.1.4";
const CMC_TAG = "climate-modes-card";

const NAMED = ["red", "pink", "purple", "deep-purple", "indigo", "blue", "light-blue", "cyan", "teal", "green", "light-green",
  "lime", "yellow", "amber", "orange", "deep-orange", "brown", "grey", "blue-grey"];
const FALLBACK = { cyan: "#00bcd4", blue: "#2196f3", purple: "#9c27b0", amber: "#ffc107", red: "#f44336", orange: "#ff9800",
  teal: "#009688", green: "#4caf50", grey: "#9e9e9e", "light-blue": "#03a9f4", indigo: "#3f51b5", "deep-purple": "#673ab7" };
const color = (c) => (!c ? `var(--grey-color, #9e9e9e)` : NAMED.includes(c) ? `var(--${c}-color, ${FALLBACK[c] || "#9e9e9e"})` : c);
const GREY = color("grey");
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const list = (v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);

/* Which mode is on? A preset all thermostats share, or a mode's own entity + state. */
function activeIndex(hass, cfg) {
  const modes = cfg.modes || [];
  const th = list(cfg.thermostats).map((id) => hass.states[id]).filter(Boolean);
  const presets = th.map((s) => s.attributes?.preset_mode);
  const allSame = presets.length && presets.every((p) => p === presets[0]);
  return modes.findIndex((m) => {
    if (m.active?.entity) {
      const s = hass.states[m.active.entity];
      return !!s && list(m.active.state).map(String).includes(String(s.state));
    }
    return m.preset !== undefined && allSame && presets[0] === m.preset;
  });
}

const CSS = `
  :host { display: block; }
  ha-card { padding: 10px; }
  /* Spacing follows Mushroom: everything inside the card starts 10px from its edge (card padding).
     Label row: 40px high (room for the 24px switch). The icon is Mushroom-sized (24px) and sits where
     the glyph of a 36px Mushroom icon would, so it lines up with the icons of Mushroom, Tado and
     All lights cards and the title starts where theirs do. Only a tappable icon gets the filled circle. */
  .label { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 0 8px; }
  .label > ha-icon:first-child { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; --mdc-icon-size: 24px; }
  /* Card label row: same on every card – 18px icon, 14px / 500 title (like Mushroom names), 12px status. */
  /* top: 1px – optical centring: the line box sits ~1px high against an icon of the same height. */
  .title { position: relative; top: 1px; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .status { margin-left: auto; font-size: 12px; line-height: 20px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Switch next to the status; padded so the whole label + switch is an easy tap target. */
  .switch { all: unset; flex: none; margin: -6px -4px -6px 4px; padding: 6px 4px 6px 10px; display: inline-flex; align-items: center; gap: 8px;
    cursor: pointer; border-radius: 16px; font-size: 12px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color);
    -webkit-tap-highlight-color: transparent; }
  .status:empty { display: none; }
  /* Label-row switch: 40×24, the same on every card. */
  .sw { flex: none; width: 40px; height: 24px; border-radius: 12px; position: relative; background: var(--disabled-color, #bdbdbd); transition: background-color 160ms; }
  .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .switch.on .sw { background: var(--sw-color); }
  .switch.on .sw::after { transform: translateX(16px); }
  .modes { display: grid; grid-template-columns: repeat(var(--n, 5), minmax(0, 1fr)); gap: 8px; }
  .mode { all: unset; box-sizing: border-box; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 12px 2px 11px; border-radius: 10px; cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
    -webkit-tap-highlight-color: transparent; transition: background-color 180ms; }
  .shape { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: ${tint(GREY, 20)}; transition: background-color 180ms; }
  .shape ha-icon { --mdc-icon-size: 24px; color: ${GREY}; transition: color 180ms; }
  /* 12px like every other card's second line; the icon carries the tile. */
  .name { max-width: 100%; font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .2px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mode.on { background: color-mix(in srgb, var(--c) 12%, transparent); }
  .mode.on .shape { background: color-mix(in srgb, var(--c) 20%, transparent); }
  .mode.on .shape ha-icon { color: var(--c); }
  /* Press feedback without moving anything, so taps near the edge still land. */
  .mode:active, .switch:active { filter: brightness(.92); }
  .mode:focus-visible, .switch:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  ha-card { container-type: inline-size; }
`;

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
        { name: "modes", selector: { object: {} } },
      ],
      computeLabel: (s) =>
        ({
          title: "Title",
          icon: "Icon",
          icon_color: "Icon colour",
          thermostats: "Thermostats (a mode is active when all share its preset)",
          switch: "Switch in the label row (optional)",
          switch_name: "Switch label (default Automatic)",
          switch_tap_action: "Switch tap (default: toggle)",
          modes: "Modes",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          modes: "One entry per tile: name, icon, color, preset (or active: {entity, state}) and tap_action.",
          switch: "Shown after the status, e.g. summer mode or an automatic-aircon automation.",
          switch_tap_action: "E.g. navigate to #summer-mode to confirm in a pop-up first.",
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
    root.innerHTML = `<style>${CSS}</style><ha-card>
      ${c.title || c.icon ? `<div class="label"><ha-icon icon="${esc(c.icon || "mdi:thermostat")}" style="color:${color(c.icon_color || "orange")}"></ha-icon>
        <span class="title">${esc(c.title || "")}</span>
        <span class="status"></span>
        ${c.switch ? `<button class="switch" role="switch" style="--sw-color:${color(c.switch_color || "blue")}"><span class="swl"></span><span class="sw"></span></button>` : ""}</div>` : ""}
      <div class="modes" style="--n:${Math.max(1, c.modes.length)}">
        ${c.modes
          .map((m, i) => `<button class="mode" data-i="${i}" style="--c:${color(m.color)}" aria-pressed="false">
            <span class="shape"><ha-icon icon="${esc(m.icon || "mdi:thermostat")}"></ha-icon></span><span class="name">${esc(m.name || "")}</span></button>`)
          .join("")}
      </div></ha-card>`;
    root.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => this._tap(c.modes[Number(b.dataset.i)])));
    root.querySelector(".switch")?.addEventListener("click", () => this._toggleSwitch());
    this._built = true;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    const root = this.shadowRoot;
    const c = this._config;
    const active = activeIndex(hass, c);
    root.querySelectorAll(".mode").forEach((b, i) => {
      b.classList.toggle("on", i === active);
      b.setAttribute("aria-pressed", String(i === active));
    });
    const status = root.querySelector(".status");
    if (status) {
      const n = list(c.thermostats).length;
      const text = !n ? (active >= 0 ? c.modes[active].name : "")
        : active >= 0 ? `${n > 1 ? "All rooms" : "On"} · ${c.modes[active].name}` : "Mixed";
      if (status.textContent !== text) status.textContent = text;
    }
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

  async _tap(mode) {
    const a = mode?.tap_action;
    if (!a || a.action === "none") return;
    this._fire("haptic", "light");
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
      this._fire("hass-notification", { message: err?.message || "That did not work" });
    }
  }

  async _toggleSwitch() {
    if (this._config.switch_tap_action) return this._tap({ tap_action: this._config.switch_tap_action });
    const id = this._config.switch;
    const on = this._hass.states[id]?.state === "on";
    this._fire("haptic", "light");
    try {
      await this._hass.callService("homeassistant", on ? "turn_off" : "turn_on", { entity_id: id });
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || `Could not switch ${id}` });
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

/* ===== enclosure-filter-card 1.1.4 ===== */
(() => {
/*
 * Enclosure filter card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A printer enclosure's filter / vent (e.g. a StealthMax): the vent position as a
 * segmented selector, intake and exhaust side by side (temperature, humidity, VOC,
 * VOC with manual calibration), and any extra readings (e.g. the delta) as a small
 * line. Tap any value for its own more-info.
 * See cards/enclosure-filter-card/README.md for every option.
 */

const EFC_VERSION = "1.1.4";
const EFC_TAG = "enclosure-filter-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  teal: "var(--teal-color, #009688)",
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

/* "0" → Closed, "100" → Open, numbers as they are. */
function optionLabel(o) {
  if (String(o) === "0") return "Closed";
  if (String(o) === "100") return "Open";
  return String(o);
}

const CSS = `
  :host { display: block; }
  ha-card { padding: 10px; }
  /* Spacing follows Mushroom: everything inside the card starts 10px from its edge (card padding).
     Label row: 40px high (room for the 24px switch). The icon is Mushroom-sized (24px) and sits where
     the glyph of a 36px Mushroom icon would, so it lines up with the icons of Mushroom, Tado and
     All lights cards and the title starts where theirs do. Only a tappable icon gets the filled circle. */
  .label { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 0 8px; }
  .label > ha-icon:first-child { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; --mdc-icon-size: 24px; color: ${C.teal}; }
  /* Card label row: same on every card – 18px icon, 14px / 500 title (like Mushroom names), 12px status. */
  /* top: 1px – optical centring: the line box sits ~1px high against an icon of the same height. */
  .title { position: relative; top: 1px; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .sum { margin-left: auto; font-size: 12px; line-height: 20px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; }
  .vent { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; }
  .vl { font-size: 12px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .seg { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(var(--n, 5), minmax(0, 1fr)); gap: 2px; padding: 3px;
    border-radius: 12px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); }
  .opt { all: unset; box-sizing: border-box; min-width: 0; height: 32px; border-radius: 9px; cursor: pointer; text-align: center;
    font-size: 12px; line-height: 32px; font-weight: 500; letter-spacing: .2px; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; -webkit-tap-highlight-color: transparent; }
  .opt.on { background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
  .io { display: flex; align-items: stretch; gap: 8px; }
  .side { box-sizing: border-box; flex: 1; min-width: 0; padding: 10px; border-radius: 10px; cursor: pointer;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .04); display: grid; gap: 1px; -webkit-tap-highlight-color: transparent; }
  .vals { display: flex; flex-wrap: wrap; gap: 1px 10px; }
  .h { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .v, .x { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 2px; font-size: 12px; line-height: 16px;
    letter-spacing: .4px; color: var(--secondary-text-color); white-space: nowrap; cursor: pointer; border-radius: 4px;
    -webkit-tap-highlight-color: transparent; }
  .v:active, .x:active { filter: brightness(.85); }
  .v:focus-visible, .x:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .v ha-icon { --mdc-icon-size: 14px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .arrow { align-self: center; --mdc-icon-size: 20px; color: color-mix(in srgb, var(--secondary-text-color) 45%, transparent); }
  .extra { display: flex; flex-wrap: wrap; gap: 2px 12px; padding: 10px 0 0; }
  .extra:empty { display: none; }
  .opt:active, .side:active { filter: brightness(.94); }
  .opt:focus-visible, .side:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

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

  _options() {
    const s = this._hass.states[this._config.vent];
    return (s?.attributes?.options || []).filter((o) => isFinite(Number(o)));
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const opts = this._config.vent ? this._options() : [];
    const side = (k, title) => `<div class="side ${k}" role="button" tabindex="0"><div class="h">${esc(title)}</div><div class="vals"></div></div>`;
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="label"><ha-icon icon="mdi:air-filter"></ha-icon><span class="title">${esc(this._config.title ?? "Filter")}</span><span class="sum"></span></div>
      ${opts.length ? `<div class="vent"><span class="vl">Vent</span><div class="seg" style="--n:${opts.length}">
        ${opts.map((o) => `<button class="opt" data-o="${esc(o)}">${esc(optionLabel(o))}</button>`).join("")}</div></div>` : ""}
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
    const voc = (id, val, label) => {
      const [c, tc] = VOC[vocLevel(val)];
      parts.push(btn(id, `color:${tc}`, "mdi:spray", `color:${c}`, `${label} ${fmt(val)}`));
    };
    if (v !== undefined) voc(cfg.voc, v, "VOC");
    if (vm !== undefined) voc(cfg.voc_manual, vm, "VOC (manual)");
    return { html: parts.join(""), voc: v };
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    // Only touch the DOM when something changed, so a tap is never lost mid-update.
    const set = (n, v) => {
      if (n && n.innerHTML !== v) n.innerHTML = v;
    };
    const vent = this._hass.states[this._config.vent]?.state;
    root.querySelectorAll(".opt").forEach((b) => b.classList.toggle("on", b.dataset.o === vent));
    const a = this._side(this._config.intake);
    const b = this._side(this._config.exhaust);
    set(root.querySelector(".side.in .vals"), a.html);
    set(root.querySelector(".side.out .vals"), b.html);
    const sum = [
      vent && !isFinite(Number(vent)) ? `Vent: ${vent}` : "",
      a.voc != null && b.voc != null ? `VOC ${fmt(a.voc)} → ${fmt(b.voc)}` : "",
    ].filter(Boolean).join(" · ");
    const s = root.querySelector(".sum");
    if (s.textContent !== sum) s.textContent = sum;
    const extra = (this._config.details || [])
      .map((d) => (typeof d === "string" ? { entity: d } : d))
      .filter((d) => this._hass.states[d.entity])
      .map((d) => {
        const st = this._hass.states[d.entity];
        const n = num(st.state);
        const name = d.name || st.attributes.friendly_name || d.entity;
        return `<button class="x" data-e="${esc(d.entity)}">${esc(name)} ${n === null ? esc(st.state) : fmt(n, Math.abs(n) < 100 && n % 1 ? 1 : 0)}</button>`;
      })
      .join("");
    set(root.querySelector(".extra"), extra);
  }

  async _select(option) {
    const id = this._config.vent;
    const [domain] = id.split(".");
    try {
      await this._hass.callService(domain === "input_select" ? "input_select" : "select", "select_option", { entity_id: id, option });
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || "Could not move the vent" }, bubbles: true, composed: true }));
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

/* ===== energy-summary-card 1.0.2 ===== */
(() => {
/*
 * Energy summary card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * One compact row: power now, and energy used today, yesterday and this month
 * so far, each with what it costs. Tap it for the full Energy dashboard.
 * Totals come from Home Assistant's long-term statistics, so they match the
 * Energy dashboard; the price comes from the Energy settings unless you set one.
 * See cards/energy-summary-card/README.md for every option.
 */

const ESC_VERSION = "1.0.2";
const ESC_TAG = "energy-summary-card";
const REFRESH_MS = 120000;

const TEAL = "var(--teal-color, #009688)";
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));

/* 616 W · 12.4 kW */
function power(w) {
  if (w === null) return ["–", "W"];
  return Math.abs(w) >= 10000 ? [(w / 1000).toFixed(1), "kW"] : [String(Math.round(w)), "W"];
}

/* 7.99 · 86.6 · 1204 kWh – about three significant figures. */
function energy(kwh) {
  if (kwh === null) return ["–", "kWh"];
  const a = Math.abs(kwh);
  return [kwh.toFixed(a < 10 ? 2 : a < 100 ? 1 : 0), "kWh"];
}

function money(v, currency, locale) {
  if (v === null || !currency) return "";
  try {
    return new Intl.NumberFormat(locale || "en-GB", { style: "currency", currency }).format(v);
  } catch (e) {
    return `${v.toFixed(2)} ${currency}`;
  }
}

/* Running cost of the current draw: "15p/h" in pounds, otherwise "€0.15/h". */
function perHour(v, currency, locale) {
  if (v === null || !currency) return "";
  if (currency === "GBP" && v < 1) return `${Math.round(v * 100)}p/h`;
  return `${money(v, currency, locale)}/h`;
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
  :host { display: block; }
  ha-card { container-type: inline-size; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  /* Spacing follows Mushroom: content starts 10px from the card edge. */
  .row { display: flex; align-items: center; gap: 6px; padding: 12px 10px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .shape ha-icon { --mdc-icon-size: 24px; } /* same as Mushroom / tile card icons */
  .stats { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .stat { min-width: 0; padding: 0 6px 0 10px; border-left: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  .stat:first-child { border-left: none; }
  .k { font-size: 11px; line-height: 14px; font-weight: 500; letter-spacing: .02em; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Text matches Mushroom / tile cards: values 14px medium, costs 12px regular, same colour. */
  .v { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); white-space: nowrap; }
  .v small { font-size: 11px; font-weight: 400; color: var(--secondary-text-color); margin-left: 2px; }
  .now .v { color: ${TEAL}; }
  .c { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c:empty::before { content: "\\00a0"; }
  ha-card:active { filter: brightness(.96); }
  ha-card:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* Phone width: the icon gives its space to the numbers. */
  @container (max-width: 400px) {
    .shape { display: none; }
    .row { padding: 12px 8px; }
    .stat { padding: 0 4px 0 8px; }
    .stat:first-child { padding-left: 2px; }
    .v small { font-size: 10px; margin-left: 1px; }
  }
`;

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
    this._totals = { today: null, yesterday: null, month: null };
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
    const change = async (calendar) => {
      try {
        const r = await hass.callWS({ type: "recorder/statistic_during_period", statistic_id: id, calendar, types: ["change"] });
        return num(r?.change);
      } catch (e) {
        return null;
      }
    };
    const [today, yesterday, month] = await Promise.all([
      change({ period: "day" }),
      change({ period: "day", offset: -1 }),
      change({ period: "month" }),
    ]);
    this._totals = { today, yesterday, month };
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
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    const root = this.shadowRoot;
    const currency = hass.config?.currency;
    const locale = hass.locale?.language || hass.language;
    const price = this._priceValue();
    const cost = (kwh) => (kwh === null || price === null ? "" : money(kwh * price, currency, locale));
    const w = num(hass.states[this._config.power]?.state);
    const month = new Date().toLocaleDateString(locale || "en-GB", { month: "long" });
    const rows = {
      now: ["Now", power(w), w === null || price === null ? "" : perHour((w / 1000) * price, currency, locale)],
      today: ["Today", energy(this._totals.today), cost(this._totals.today)],
      yesterday: ["Yesterday", energy(this._totals.yesterday), cost(this._totals.yesterday)],
      month: [month.charAt(0).toUpperCase() + month.slice(1), energy(this._totals.month), cost(this._totals.month)],
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
      if (vv.innerHTML !== v) vv.innerHTML = v;
      if (c.textContent !== money_) c.textContent = money_;
    }
  }

  _tap() {
    const path = this._config.navigation_path;
    if (path) {
      history.pushState(null, "", path);
      this._fire("location-changed", { replace: false });
    } else if (this._config.power || this._config.energy) {
      this._fire("hass-more-info", { entityId: this._config.power || this._config.energy });
    }
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

/* ===== home-status-card 1.2.2 ===== */
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

const HSC_VERSION = "1.2.2";
const HSC_TAG = "home-status-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  teal: "var(--teal-color, #009688)",
  orange: "var(--orange-color, #ff9800)",
  amber: "var(--amber-color, #ffc107)",
  red: "var(--red-color, #f44336)",
  blue: "var(--blue-color, #2196f3)",
};
const RECENT_S = 3600;

const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || isNaN(Number(v)) ? null : Number(v));
const unavailable = (s) => !s || s.state === "unavailable" || s.state === "unknown";

function when(date) {
  // Same wording as the old chip: "today at 16:09", "yesterday at 09:12", "on Oct 03 at 18:40".
  const now = new Date();
  const hm = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
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
    presence = { color: C.teal, label: "Occupied", detail: occupied, icon: "mdi:home-account" };
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
      label: unavailable(s) ? "Door ?" : open ? "Open" : "Closed",
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
      label: unavailable(s) ? "TV ?" : on ? "TV on" : "TV off",
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
    // Short enough to fit a phone-width button: "25.1° · Cool".
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
/* Confirmation dialog – same look as the Tado X room card's Boost dialog    */
/* ------------------------------------------------------------------------ */

const DIALOG_CSS = `
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
  .body { margin-top: 20px; }
  .primary { font-size: 17px; line-height: 24px; font-weight: 600; }
  .secondary { font-size: 15px; line-height: 21px; margin-top: 2px; }
  .buttons { margin-top: 20px; display: grid; gap: 8px; }
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

function confirmDialog({ title, icon, color, bodyIcon, primary, secondary, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("hsc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(icon)}" style="color:${color}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        <div class="row body"><div class="glyph"><ha-icon icon="${esc(bodyIcon)}" style="color:${color}"></ha-icon></div>
          <div><div class="primary">${esc(primary)}</div><div class="secondary">${esc(secondary)}</div></div></div>
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
  :host { display: block; }
  /* Spacing follows Mushroom: content starts 10px from the card edge; a little more air vertically. */
  ha-card { container-type: inline-size; padding: 12px 10px; display: grid; gap: 10px; }
  /* Icon on the left across both lines; title and alarm switch share the first line, so the
     presence text below gets the full width. */
  .head { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; grid-template-areas: "s n a" "s d d";
    column-gap: 10px; align-items: center; }
  .who { cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .shape { grid-area: s; align-self: start; width: 36px; height: 36px; border-radius: 50%; display: flex;
    align-items: center; justify-content: center; transition: background-color 180ms; }
  /* Same size as Mushroom / tile card icons: 36 px circle, 24 px icon. */
  .shape ha-icon { --mdc-icon-size: 24px; transition: color 180ms; }
  /* Text matches Mushroom / tile cards: name 14px medium, detail 12px regular, same colour. */
  .name { grid-area: n; min-width: 0; font-size: 14px; line-height: 18px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name .state { font-weight: 400; color: var(--secondary-text-color); }
  .detail { grid-area: d; min-width: 0; font-size: 12px; line-height: 15px; color: var(--primary-text-color);
    letter-spacing: .4px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .alarm { all: unset; grid-area: a; box-sizing: border-box; display: flex; align-items: center; gap: 5px; height: 28px;
    padding: 0 10px 0 7px; border-radius: 14px; cursor: pointer; font-size: 12px; font-weight: 600;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--secondary-text-color);
    transition: background-color 180ms, color 180ms; -webkit-tap-highlight-color: transparent; }
  .alarm ha-icon { --mdc-icon-size: 16px; color: var(--grey-color, #9e9e9e); }
  .alarm.on { background: color-mix(in srgb, var(--red-color, #f44336) 20%, transparent); color: var(--red-color, #f44336); }
  .alarm.on ha-icon { color: var(--red-color, #f44336); }
  /* Press feedback without moving the button: a scale-down shrinks the target under the finger
     and taps near the edge would be lost. */
  .alarm:active, .tile:active, .msg:active, .shape.who:active { filter: brightness(.9); }
  .alarm:focus-visible, .tile:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .tiles { display: grid; grid-template-columns: repeat(var(--n, 3), minmax(0, 1fr)); gap: 6px; }
  .tile { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 6px;
    height: 30px; padding: 0 8px; border-radius: 15px; cursor: pointer; min-width: 0;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--primary-text-color);
    font-size: 12px; font-weight: 500; transition: background-color 180ms; -webkit-tap-highlight-color: transparent; }
  .tile ha-icon { --mdc-icon-size: 16px; flex: 0 0 auto; color: var(--grey-color, #9e9e9e); }
  .tile span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
  @container (max-width: 300px) {
    .alarm .txt { display: none; }
    .alarm { padding: 0 8px; }
    .tile { gap: 4px; padding: 0 6px; }
  }
`;

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
          <div class="name who"></div>
          <button class="alarm" aria-pressed="false"><ha-icon></ha-icon><span class="txt"></span></button>
          <div class="detail who"></div>
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
    this._el.alarm.addEventListener("click", () => this._toggleAlarm());
    this._el.msg.addEventListener("click", () => this._act({ action: "more-info", entity: this._config.message }));
    this._built = true;
    this._tileKeys = "";
  }

  _render() {
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
    const nameHtml = `${esc(this._config.name || "Home")} <span class="state">· ${esc(m.presence.label)}</span>`;
    if (e.name.innerHTML !== nameHtml) e.name.innerHTML = nameHtml;
    if (e.detail.textContent !== m.presence.detail) e.detail.textContent = m.presence.detail;

    e.alarm.style.display = m.alarm ? "" : "none";
    if (m.alarm) {
      e.alarm.classList.toggle("on", m.alarm.on);
      e.alarm.setAttribute("aria-pressed", String(m.alarm.on));
      e.alarmIcon.setAttribute("icon", m.alarm.on ? "mdi:shield-lock" : "mdi:shield-off-outline");
      e.alarmTxt.textContent = m.alarm.unavailable ? "Alarm ?" : m.alarm.on ? "Armed" : "Disarmed";
    }

    const keys = m.tiles.map((t) => t.key).join();
    if (keys !== this._tileKeys) {
      e.tiles.innerHTML = m.tiles
        .map((t) => `<button class="tile" data-key="${t.key}"><ha-icon></ha-icon><span></span></button>`)
        .join("");
      e.tiles.style.setProperty("--n", String(m.tiles.length || 1));
      e.tiles.querySelectorAll(".tile").forEach((b) =>
        b.addEventListener("click", () => this._act(this._m.tiles.find((t) => t.key === b.dataset.key).action)),
      );
      this._tileKeys = keys;
    }
    m.tiles.forEach((t, i) => {
      const b = e.tiles.children[i];
      b.querySelector("ha-icon").setAttribute("icon", t.icon);
      b.querySelector("ha-icon").style.color = t.color || "";
      b.style.backgroundColor = t.color ? tint(t.color, 20) : "";
      const span = b.querySelector("span");
      if (span.textContent !== t.label) span.textContent = t.label;
      b.title = `${t.title}: ${t.label}`;
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
    const name = this._config.name || "Home";
    const ok = await confirmDialog({
      title: arming ? "Arm alarm" : "Disarm alarm",
      icon: arming ? "mdi:shield-lock" : "mdi:shield-off-outline",
      color: arming ? C.red : C.teal,
      bodyIcon: "mdi:home-outline",
      primary: name,
      secondary: arming
        ? `Your CCTV alarm system will send push notifications when it detects someone in ${name}.`
        : `Your CCTV alarm system stops sending push notifications for ${name} until you arm it again.`,
      confirmLabel: arming ? "Arm alarm" : "Disarm alarm",
    });
    if (!ok) return;
    const [domain] = this._config.alarm.split(".");
    try {
      await this._hass.callService(domain === "switch" ? "switch" : "input_boolean", arming ? "turn_on" : "turn_off", {
        entity_id: this._config.alarm,
      });
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || "Could not change the alarm" });
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

/* ===== mmu-lanes-card 1.1.4 ===== */
(() => {
/*
 * MMU lanes card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Every lane of a Happy Hare MMU (e.g. an EMU) at a glance: whether filament is
 * loaded, the lane's humidity (coloured: dry / OK / humid) and temperature, and a
 * fan icon while the lane is drying. The label row counts the loaded lanes. Tap a
 * reading for its own more-info. Sensors are found from the Moonraker prefix;
 * lanes are counted automatically.
 * See cards/mmu-lanes-card/README.md for every option.
 */

const MLC_VERSION = "1.1.4";
const MLC_TAG = "mmu-lanes-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  teal: "var(--teal-color, #009688)",
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
  :host { display: block; }
  ha-card { padding: 10px; container-type: inline-size; }
  /* Spacing follows Mushroom: everything inside the card starts 10px from its edge (card padding).
     Label row: 40px high (room for the 24px switch). The icon is Mushroom-sized (24px) and sits where
     the glyph of a 36px Mushroom icon would, so it lines up with the icons of Mushroom, Tado and
     All lights cards and the title starts where theirs do. Only a tappable icon gets the filled circle. */
  .label { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 0 8px; }
  .label > ha-icon:first-child { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; --mdc-icon-size: 24px; color: ${C.teal}; }
  /* Card label row: same on every card – 18px icon, 14px / 500 title (like Mushroom names), 12px status. */
  /* top: 1px – optical centring: the line box sits ~1px high against an icon of the same height. */
  .title { position: relative; top: 1px; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .sum { margin-left: auto; min-width: 0; font-size: 12px; line-height: 20px; font-weight: 500; letter-spacing: .4px;
    color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lanes { display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 8px; }
  @container (max-width: 300px) { .lanes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .lane { box-sizing: border-box; min-width: 0; padding: 10px 8px; border-radius: 10px; cursor: pointer;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .04); -webkit-tap-highlight-color: transparent; }
  .lt { display: flex; align-items: center; gap: 4px; }
  .ln { flex: 1; min-width: 0; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lane.empty .ln { color: var(--secondary-text-color); }
  .lt ha-icon { --mdc-icon-size: 18px; color: ${C.teal}; }
  .lane.empty .lt ha-icon.sp { color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .lt ha-icon.dry { --mdc-icon-size: 16px; color: ${C.orange}; }
  .lv { display: grid; gap: 1px; margin-top: 2px; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .v { all: unset; box-sizing: border-box; justify-self: start; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;
    cursor: pointer; border-radius: 6px; -webkit-tap-highlight-color: transparent; }
  .v:active { filter: brightness(.85); }
  .v:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .v ha-icon { --mdc-icon-size: 14px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 10px 0 0; font-size: 11px; line-height: 14px; letter-spacing: .4px;
    color: var(--secondary-text-color); }
  .legend span { display: inline-flex; align-items: center; gap: 4px; }
  .legend em { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .legend ha-icon { --mdc-icon-size: 14px; color: ${C.teal}; }
  .lane:active { filter: brightness(.94); }
  .lane:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

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

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const ls = lanes(this._hass, this._config);
    const [dry, humid] = this._config.humidity_thresholds || [20, 40];
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="label"><ha-icon icon="mdi:tray-full"></ha-icon><span class="title">${esc(this._config.title ?? "MMU lanes")}</span><span class="sum"></span></div>
      <div class="lanes" style="--cols:${Math.max(1, Math.min(8, Number(this._config.columns) || 4))}">
        ${ls.map((l) => `<div class="lane" role="button" tabindex="0" data-n="${l.n}"><div class="lt"><span class="ln">${esc(l.name)}</span>
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
    this._built = true;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const ls = lanes(this._hass, this._config);
    this._lanes = ls;
    ls.forEach((l, i) => {
      const el = root.querySelectorAll(".lane")[i];
      if (!el) return;
      el.classList.toggle("empty", l.loaded === false);
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
      const lv = el.querySelector(".lv");
      if (lv.innerHTML !== html) lv.innerHTML = html;
    });
    const loaded = ls.filter((l) => l.loaded).length;
    const sum = `${loaded} of ${ls.length} loaded`;
    const s = root.querySelector(".sum");
    if (s.textContent !== sum) s.textContent = sum;
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

/* ===== printer-status-card 1.4.0 ===== */
(() => {
/*
 * Printer status card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A Klipper / Moonraker printer at a glance: state and message, a power pill while
 * the plug is on (On and live watts), the current job (thumbnail, progress, time left, finish time,
 * layer, filament, speed) or, when idle, today's energy and lifetime totals, your
 * camera card (only while the printer is reachable and the camera serves a picture), Power on
 * (plug off) or a safe Power off (idle), and an optional chamber light toggle (glows while
 * on; hold it for the light's more-info). Printer operations – homing, pause, resume,
 * cancel – are left to the printer itself on purpose. Power on, Power off and turning the
 * plug off always ask first. Tap any value for its own more-info (the watts on the power
 * pill too). Sensors are found from the Moonraker prefix (e.g. "voron").
 * See cards/printer-status-card/README.md for every option.
 */

const PSC_VERSION = "1.4.0";
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

/* 1.383 h → "1h 23m" */
function hm(hours) {
  if (hours === null) return "–";
  const m = Math.max(0, Math.round(hours * 60));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}
/* "4825h 49m 38s" → 4826 */
function hoursFrom(text) {
  const t = String(text || "");
  const h = Number((t.match(/(\d+)\s*h/) || [])[1] || 0);
  const m = Number((t.match(/(\d+)\s*m/) || [])[1] || 0);
  return t ? Math.round(h + m / 60) : null;
}

const STATES = {
  off: { word: "Off", color: C.grey, icon: "mdi:printer-3d-off" },
  ready: { word: "Ready", color: C.grey, icon: "mdi:printer-3d" },
  printing: { word: "Printing", color: C.blue, icon: "mdi:printer-3d-nozzle" },
  paused: { word: "Paused", color: C.amber, icon: "mdi:pause-circle-outline" },
  complete: { word: "Complete", color: C.green, icon: "mdi:check-circle-outline" },
  cancelled: { word: "Cancelled", color: C.grey, icon: "mdi:close-circle-outline" },
  error: { word: "Error", color: C.red, icon: "mdi:alert-circle-outline" },
  starting: { word: "Starting", color: C.grey, icon: "mdi:printer-3d" },
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
  else if (!printer || printer === "unavailable" || printer === "unknown" || printer === "startup") key = "starting";

  const msg = [s("current_display_message"), s("printer_message")].find((x) => x && !["unknown", "unavailable"].includes(x)) || "";
  const watts = num(st(cfg.power_sensor)?.state);
  const eta = st(`sensor.${p}_print_eta`)?.state;
  const etaDate = eta && !["unknown", "unavailable"].includes(eta) ? new Date(eta) : null;
  return {
    key,
    state: STATES[key],
    message: !plugOn ? "Power is off" : msg,
    plug: plug ? { on: plugOn, watts } : null,
    file: s("filename") && !["unknown", "unavailable"].includes(s("filename")) ? s("filename") : "",
    progress: num(s("progress")),
    left: num(s("print_time_left")),
    eta: etaDate && !isNaN(etaDate) ? etaDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "",
    layer: num(s("current_layer")),
    layers: num(s("total_layer")),
    filament: num(s("filament_used")),
    speed: num(s("print_speed")),
    today: num(st(cfg.energy_today)?.state),
    jobs: num(s("totals_jobs")),
    hours: hoursFrom(s("totals_print_time")),
    km: num(s("totals_filament_used")) === null ? null : num(s("totals_filament_used")) / 1000,
    thumb: st(cfg.thumbnail || `camera.${p}_thumbnail`)?.attributes?.entity_picture || "",
    light: lightModel(st(cfg.light), cfg.light),
  };
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
   resume, cancel) are deliberately not here – they are done on the printer. */
function actions(key) {
  if (key === "off") return [["poweron", "Power on", "mdi:power"]];
  if (["printing", "paused", "starting"].includes(key)) return [];
  return [["poweroff", "Power off", "mdi:power"]];
}

/* ------------------------------------------------------------------------ */
/* Confirmation dialog – same look as the other cards' dialogs              */
/* ------------------------------------------------------------------------ */

const DIALOG_CSS = `
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
  .body { margin-top: 20px; }
  .primary { font-size: 17px; line-height: 24px; font-weight: 600; }
  .secondary { font-size: 15px; line-height: 21px; margin-top: 2px; }
  .buttons { margin-top: 20px; display: grid; gap: 8px; }
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

function confirmDialog({ title, icon, color, primary, secondary, confirmLabel }) {
  return new Promise((resolve) => {
    const host = document.createElement("psc-confirm-dialog");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${DIALOG_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="row"><div class="glyph" style="background:${tint(color, 20)}"><ha-icon icon="${esc(icon)}" style="color:${color}"></ha-icon></div>
          <div class="title">${esc(title)}</div></div>
        <div class="row body"><div class="glyph"><ha-icon icon="mdi:printer-3d" style="color:${color}"></ha-icon></div>
          <div><div class="primary">${esc(primary)}</div><div class="secondary">${esc(secondary)}</div></div></div>
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
  :host { display: block; }
  /* Spacing follows Mushroom: content starts 10px from the card edge. */
  ha-card { padding: 10px; container-type: inline-size; }
  .head { display: flex; align-items: center; gap: 10px; padding: 0 0 10px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .shape ha-icon { --mdc-icon-size: 24px; }
  .txt { flex: 1; min-width: 0; }
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nm .st { font-weight: 400; color: var(--secondary-text-color); }
  .sc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pill { flex: none; display: inline-flex; align-items: stretch; height: 36px; border-radius: 18px; overflow: hidden;
    font-size: 13px; font-weight: 600; letter-spacing: .2px; white-space: nowrap;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--secondary-text-color); }
  .pill button { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
    -webkit-tap-highlight-color: transparent; }
  .pill .tog { padding: 0 12px 0 10px; }
  .pill .w { padding: 0 14px 0 10px; border-left: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
  .pill[hidden], .pill .w:empty { display: none; }
  .pill .tog:has(+ .w:empty) { padding-right: 14px; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  .pill.on { background: ${tint(C.orange, 18)}; color: color-mix(in srgb, ${C.orange} 70%, var(--primary-text-color)); }
  .pill.on ha-icon { color: ${C.orange}; }
  [data-e] { cursor: pointer; }
  .jt [data-e], .stats [data-e], .txt [data-e] { border-radius: 4px; -webkit-tap-highlight-color: transparent; }
  [data-e]:active { filter: brightness(.85); }
  .job { display: flex; gap: 10px; margin: 0 0 10px; }
  .thumb { flex: 0 0 64px; height: 64px; border-radius: 10px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05);
    display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .thumb img { width: 100%; height: 100%; object-fit: contain; }
  .thumb ha-icon { --mdc-icon-size: 30px; color: ${C.grey}; }
  .jt { flex: 1; min-width: 0; }
  .pct { font-size: 20px; line-height: 26px; font-weight: 600; color: var(--primary-text-color); white-space: nowrap; }
  .pct .when { font-size: 12px; font-weight: 400; letter-spacing: .4px; color: var(--secondary-text-color); margin-left: 8px; }
  .pbar { height: 8px; border-radius: 4px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .08); margin: 4px 0 6px; overflow: hidden; }
  .pbar i { display: block; height: 100%; border-radius: 4px; transition: width 400ms; }
  .camera { margin: 0 0 10px; border-radius: 10px; overflow: hidden; }
  .camera:empty { display: none; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 0 10px; text-align: center; }
  .stats > button { all: unset; box-sizing: border-box; display: grid; min-width: 0; cursor: pointer; text-align: center;
    border-left: 1px solid var(--divider-color, rgba(0,0,0,.12)); -webkit-tap-highlight-color: transparent; }
  .stats > button:first-child { border-left: none; }
  .stats b { font-size: 14px; line-height: 20px; font-weight: 500; color: var(--primary-text-color); white-space: nowrap; }
  .stats span { font-size: 11px; line-height: 14px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .acts { display: grid; grid-template-columns: repeat(var(--n, 2), minmax(0, 1fr)); gap: 8px; }
  .acts:empty { display: none; }
  .act { all: unset; box-sizing: border-box; height: 44px; border-radius: 22px; cursor: pointer; display: flex; align-items: center;
    justify-content: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--primary-text-color);
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); -webkit-tap-highlight-color: transparent; }
  .act ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  .act.poweroff ha-icon { color: ${C.orange}; }
  .act.poweron ha-icon { color: ${C.green}; }
  /* Chamber light: glows while on, like a lit room on the lights card. */
  .act.light.on { background: ${tint(C.orange, 18)}; color: color-mix(in srgb, ${C.orange} 70%, var(--primary-text-color)); }
  .act.light.on ha-icon { color: ${C.orange}; }
  .act .lvl { font-weight: 400; opacity: .8; }
  .pill button:active, .act:active { filter: brightness(.92); }
  .pill button:focus-visible, .act:focus-visible, [data-e]:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

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
        { name: "power_switch", selector: { entity: { domain: ["switch", "input_boolean"] } } },
        { type: "grid", name: "", schema: [
          { name: "power_sensor", selector: { entity: { domain: "sensor", device_class: "power" } } },
          { name: "energy_today", selector: { entity: { domain: "sensor", device_class: "energy" } } },
        ] },
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
          power_switch: "Power plug",
          power_sensor: "Power (W)",
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

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="head"><div class="shape"><ha-icon></ha-icon></div>
        <div class="txt" data-e="sensor.${esc(this._config.prefix)}_current_print_state" role="button" tabindex="0"><div class="nm"></div><div class="sc msg"></div></div>
        ${this._config.power_switch ? `<div class="pill"><button class="tog"><ha-icon icon="mdi:power-plug"></ha-icon><span></span></button><button class="w"${this._config.power_sensor ? ` data-e="${esc(this._config.power_sensor)}"` : ""}></button></div>` : ""}</div>
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
      if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".txt")) {
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
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const m = model(this._hass, this._config);
    this._m = m;
    const set = (sel, v, html = false) => {
      const n = root.querySelector(sel);
      if (!n) return;
      if (html ? n.innerHTML !== v : n.textContent !== v) html ? (n.innerHTML = v) : (n.textContent = v);
    };

    const shape = root.querySelector(".shape");
    shape.style.background = tint(m.state.color, 20);
    const ic = shape.querySelector("ha-icon");
    if (ic.getAttribute("icon") !== m.state.icon) ic.setAttribute("icon", m.state.icon);
    ic.style.color = m.state.color;
    set(".nm", `${esc(this._config.name || "Printer")} <span class="st">· ${esc(m.state.word)}</span>`, true);
    const active = ["printing", "paused", "complete", "cancelled"].includes(m.key) && m.file;
    set(".msg", active ? m.file : m.message);

    const pill = root.querySelector(".pill");
    if (pill && m.plug) {
      // Only while the plug is on; when it is off the Power on button below takes over.
      pill.hidden = !m.plug.on;
      pill.classList.toggle("on", m.plug.on);
      set(".pill .tog span", m.plug.on ? "On" : "Off");
      set(".pill .w", m.plug.on && m.plug.watts !== null ? `${fmt(m.plug.watts)} W` : "");
      pill.querySelector(".tog").setAttribute("aria-pressed", String(m.plug.on));
    }

    // Current job (printing, paused, or the last one that finished).
    const job = root.querySelector(".job");
    job.style.display = active ? "" : "none";
    if (active) {
      const pct = m.progress === null ? 0 : Math.max(0, Math.min(100, m.progress));
      const p = this._config.prefix;
      const e = (key, text) => `<span data-e="sensor.${esc(p)}_${key}">${esc(text)}</span>`;
      const when =
        m.key === "complete" ? "Done" : m.key === "cancelled" ? "Cancelled" : `${e("print_time_left", `${hm(m.left)} left`)}${m.eta ? ` · ${e("print_eta", `done ${m.eta}`)}` : ""}`;
      set(".pct", `${e("progress", `${fmt(pct)}%`)}<span class="when">${when}</span>`, true);
      const bar = root.querySelector(".pbar i");
      bar.style.width = `${pct}%`;
      bar.style.background = m.state.color;
      set(".l1", [m.layers ? e("current_layer", `Layer ${fmt(m.layer)} / ${fmt(m.layers)}`) : "", m.filament !== null ? e("filament_used", `${fmt(m.filament, 1)} m filament`) : ""].filter(Boolean).join(" · "), true);
      set(".l2", m.key === "printing" && m.speed !== null ? e("print_speed", `${fmt(m.speed)} mm/s`) : "", true);
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
      if (this._config.energy_today) cells.push([`${fmt(m.today, 2)} kWh`, "today", this._config.energy_today]);
      cells.push(
        [fmt(m.jobs), "prints", `sensor.${p}_totals_jobs`],
        [m.hours === null ? "–" : `${fmt(m.hours)} h`, "printed", `sensor.${p}_totals_print_time`],
        [m.km === null ? "–" : `${fmt(m.km, 1)} km`, "filament", `sensor.${p}_totals_filament_used`],
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
      box.style.setProperty("--n", String(acts.length || 1));
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
    if (l.numeric) {
      // A Klipper output pin: off is 0; on goes back to the last level seen, or light_on (default: full).
      const on = this._lastLight || num(this._config.light_on) || l.max;
      return this._call(domain, "set_value", { entity_id: id, value: l.on ? 0 : on });
    }
    const svc = domain === "light" || domain === "switch" || domain === "input_boolean" ? domain : "homeassistant";
    return this._call(svc, l.on ? "turn_off" : "turn_on", { entity_id: id });
  }

  async _action(k) {
    const name = this._config.name || "Printer";
    const press = (id) => this._call("button", "press", { entity_id: id });
    if (k === "poweron") {
      const ok = await confirmDialog({
        title: "Power on", icon: "mdi:power", color: C.green, primary: name,
        secondary: `The plug turns on and ${name} starts up.`, confirmLabel: "Power on",
      });
      if (!ok) return;
      const id = this._config.power_switch;
      const [domain] = id.split(".");
      return this._call(domain === "input_boolean" ? "input_boolean" : "switch", "turn_on", { entity_id: id });
    }
    if (k === "poweroff") {
      const ok = await confirmDialog({
        title: "Power off", icon: "mdi:power", color: C.orange, primary: name,
        secondary: `${name} shuts down safely, then its plug turns off.`, confirmLabel: "Power off",
      });
      if (ok) {
        const [domain] = this._config.power_off_script.split(".");
        domain === "button" ? press(this._config.power_off_script) : this._call("script", "turn_on", { entity_id: this._config.power_off_script });
      }
    }
  }

  /* Plug pill (shown only while on): off asks first and warns while printing. */
  async _togglePlug() {
    const id = this._config.power_switch;
    const on = this._m?.plug?.on;
    const [domain] = id.split(".");
    if (!on) return this._action("poweron");
    const name = this._config.name || "Printer";
    const busy = ["printing", "paused"].includes(this._m.key);
    const ok = await confirmDialog({
      title: "Cut power", icon: "mdi:power-plug-off", color: busy ? C.red : C.orange, primary: name,
      secondary: busy
        ? `${name} is printing. Cutting power now ends the print.`
        : `The plug switches off at once, without a shutdown.${this._config.power_off_script ? " Use Power off for a safe shutdown." : ""}`,
      confirmLabel: "Turn plug off",
    });
    if (ok) this._call(domain === "input_boolean" ? "input_boolean" : "switch", "turn_off", { entity_id: id });
  }

  async _call(domain, service, data) {
    try {
      await this._hass.callService(domain, service, data);
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: err?.message || "That did not work" }, bubbles: true, composed: true }));
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

/* ===== printer-temps-card 1.1.5 ===== */
(() => {
/*
 * Printer temperatures card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Heaters (temperature, target, heater power – the tile glows while heating), other
 * temperature readings, and the fans, for a Klipper / Moonraker printer. Sensors
 * are found from the Moonraker prefix; every list can be overridden. Tap any value
 * (temperature, target, power, fan) for its own more-info.
 * See cards/printer-temps-card/README.md for every option.
 */

const PTC_VERSION = "1.1.5";
const PTC_TAG = "printer-temps-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  orange: "var(--orange-color, #ff9800)",
  teal: "var(--teal-color, #009688)",
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
  :host { display: block; }
  ha-card { padding: 10px; }
  /* Spacing follows Mushroom: everything inside the card starts 10px from its edge (card padding).
     Label row: 40px high (room for the 24px switch). The icon is Mushroom-sized (24px) and sits where
     the glyph of a 36px Mushroom icon would, so it lines up with the icons of Mushroom, Tado and
     All lights cards and the title starts where theirs do. Only a tappable icon gets the filled circle. */
  .label { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 0 8px; }
  .label > ha-icon:first-child { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; --mdc-icon-size: 24px; color: ${C.orange}; }
  /* Card label row: same on every card – 18px icon, 14px / 500 title (like Mushroom names), 12px status. */
  /* top: 1px – optical centring: the line box sits ~1px high against an icon of the same height. */
  .title { position: relative; top: 1px; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .sum { margin-left: auto; font-size: 12px; line-height: 20px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; }
  .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 8px; }
  .tile { box-sizing: border-box; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px;
    padding: 10px; border-radius: 10px; cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
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
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
  .pw { min-width: 30px; text-align: right; font-size: 11px; line-height: 14px; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; }
  .pw:empty { display: none; }
  .bar { height: 4px; border-radius: 2px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .08); overflow: hidden; }
  .bar i { display: block; height: 100%; background: ${C.orange}; border-radius: 2px; transition: width 400ms; }
  .fans { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 10px 0 0; font-size: 12px; line-height: 16px; letter-spacing: .4px;
    color: var(--secondary-text-color); }
  .fan { all: unset; display: inline-flex; align-items: center; gap: 3px; cursor: pointer; }
  .fan ha-icon { --mdc-icon-size: 16px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .fan.on ha-icon { color: ${C.teal}; }
  .tile:active, .fan:active { filter: brightness(.94); }
  .tile:focus-visible, .fan:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

const deg = (v, d = 1) => (v === null ? "–" : `${v.toFixed(d)}°`);

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
      <div class="label"><ha-icon icon="mdi:thermometer"></ha-icon><span class="title">${esc(this._config.title ?? "Temperatures")}</span><span class="sum"></span></div>
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
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const items = [...heaters(this._hass, this._config).filter((h) => !h.missing), ...readings(this._hass, this._config)];
    // Only touch the DOM when something changed, so a tap is never lost mid-update.
    const set = (n, v) => {
      if (n.innerHTML !== v) n.innerHTML = v;
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
    const sumEl = root.querySelector(".sum");
    if (sumEl.textContent !== sum) sumEl.textContent = sum;
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

/* ===== room-lights-card 1.3.4 ===== */
(() => {
/*
 * Room lights card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Every room's lights in one card: an "All lights" switch in the header and a
 * tile per room underneath with its temperature, humidity and light level.
 * Tap a tile to switch the room, tap its icon to open the room's dashboard,
 * long-press for the room's individual lamps. Nothing asks first – lights are
 * cheap to switch back.
 * See cards/room-lights-card/README.md for every option.
 */

const RLC_VERSION = "1.3.4";
const RLC_TAG = "room-lights-card";

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  orange: "var(--orange-color, #ff9800)",
  red: "var(--red-color, #f44336)",
  blue: "var(--blue-color, #2196f3)",
  amber: "var(--amber-color, #ffc107)",
  teal: "var(--teal-color, #009688)",
};
const HOLD_MS = 500;
const HISTORY_DAYS = 3;
const MOVE_PX = 10;

const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const list = (v) => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v.filter(Boolean) : [v]);
const isOn = (s) => !!s && s.state === "on";

/* "21.1/21.8°", "49/49%", "30 lx" – the unit once, each sensor's value in order. */
function reading(hass, ids, digits, unit, space) {
  const vals = list(ids).map((id) => {
    const s = hass.states[id];
    const n = s ? Number(s.state) : NaN;
    return s && s.state !== "" && isFinite(n) ? n.toFixed(digits) : "–";
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

/* "12m", "3h", "2d" */
function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

/*
 * Who is in the room: occupied → teal motion sensor; empty → how long since someone was there.
 * Lights on in a room that has been empty for a while → amber, so lights left on stand out.
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
  .title { font-size: 20px; line-height: 26px; font-weight: 600; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list, .buttons { margin-top: 20px; display: grid; gap: 8px; }
  /* The actions are set apart from the lamp list by a divider and extra space. */
  .buttons { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  button { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 10px; height: 56px;
    padding: 0 12px 0 10px; border-radius: 28px; cursor: pointer; font-size: 16px; line-height: 24px; font-weight: 600;
    letter-spacing: .1px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .07); color: var(--primary-text-color);
    -webkit-tap-highlight-color: transparent; }
  button .glyph { flex-basis: 36px; height: 36px; background: color-mix(in srgb, var(--grey-color, #9e9e9e) 20%, transparent); }
  button .glyph ha-icon { --mdc-icon-size: 22px; color: var(--grey-color, #9e9e9e); }
  /* Call to action, filled like "Boost heating": the lights colour with white text and icon. */
  button.open { background: ${C.orange}; color: #fff; }
  button.open .glyph { background: rgba(255,255,255,.2); }
  button.open .glyph ha-icon { color: #fff; }
  button.open .nm, .lamp .nm { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sw { flex: 0 0 auto; width: 44px; height: 26px; border-radius: 13px; position: relative; background: var(--disabled-color, #bdbdbd);
    transition: background-color 160ms; }
  .sw::after { content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .lamp.on .sw { background: ${C.orange}; }
  .lamp.on .sw::after { transform: translateX(18px); }
  .lamp.missing { opacity: .5; }
  button:active { filter: brightness(.92); }
  button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .empty { padding: 0 8px; font-size: 15px; line-height: 21px; color: var(--primary-text-color); }
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
      const label = `Open ${m.name}`;
      if (open.querySelector(".nm").textContent !== label) open.querySelector(".nm").textContent = label;
    }
    root.querySelector(".dialog").setAttribute("aria-label", m.name);

    const items = lamps(hass, this._room, this._card._viewIcons?.[this._room.navigation_path]?.map || {});
    const box = root.querySelector(".list");
    const keys = items.map((l) => l.id).join();
    if (box.dataset.keys !== keys) {
      box.dataset.keys = keys;
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
  :host { display: block; }
  /* Spacing follows Mushroom: everything inside starts 10px from the card edge. */
  ha-card { padding: 10px; }
  /* The All lights switch is the card's label row – same height, title and switch as the label row
     of every other card (40px row, 14px / 500 title, 40×24 switch), and the whole row toggles.
     Its icon is tappable, so it sits in a filled 36px circle like every other tappable icon. */
  .all { all: unset; box-sizing: border-box; width: 100%; display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 0 8px;
    cursor: pointer; -webkit-tap-highlight-color: transparent; border-radius: 10px; }
  .all .hi { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    --mdc-icon-size: 24px; color: ${C.grey}; background: ${tint(C.grey, 20)}; transition: color 180ms, background-color 180ms; }
  .all.on .hi { color: ${C.orange}; background: ${tint(C.orange, 20)}; }
  .shape { position: relative; flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center;
    justify-content: center; transition: background-color 180ms; }
  /* Same size as Mushroom / tile card icons: 36 px circle, 24 px icon. */
  .shape ha-icon { --mdc-icon-size: 24px; transition: color 180ms; }
  /* Text matches Mushroom / tile cards: names 14px medium, readings 12px regular, same colour. */
  .all .nm { position: relative; top: 1px; flex: 1; min-width: 0; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .all .sw { flex: 0 0 auto; width: 40px; height: 24px; border-radius: 12px; position: relative; background: var(--disabled-color, #bdbdbd);
    transition: background-color 160ms; }
  .all .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform 160ms; }
  .all.on .sw { background: ${C.orange}; }
  .all.on .sw::after { transform: translateX(16px); }
  .rooms { display: grid; grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 8px; }
  .room { position: relative; border-radius: 10px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
    container-type: inline-size; cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none;
    -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
  .tile { display: flex; align-items: center; gap: 10px; height: 100%; box-sizing: border-box; padding: 11px 10px; min-height: 58px; }
  .room .shape { cursor: pointer; }
  .badge { position: absolute; top: -3px; right: -3px; width: 16px; height: 16px; border-radius: 50%; display: none;
    align-items: center; justify-content: center; background: ${C.red}; }
  .badge ha-icon { --mdc-icon-size: 11px; color: #fff; }
  .badge.on { display: flex; }
  .txt { flex: 1; min-width: 0; }
  .room .nm { flex: 1; min-width: 0; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Presence sits on the name's own line, so it always lines up with the room title. */
  .top { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .pres { flex: 0 0 auto; display: none; align-items: center; gap: 2px; height: 20px; font-size: 12px; line-height: 20px;
    font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color); }
  .pres.show { display: inline-flex; }
  .pres ha-icon { --mdc-icon-size: 16px; }
  .pres.here { color: ${C.teal}; }
  .pres.warn { color: var(--warning-color, #ffa600); }
  .m { display: flex; column-gap: 9px; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; }
  .g { display: flex; column-gap: 9px; min-width: 0; }
  .g:empty { display: none; }
  .v { display: inline-flex; align-items: center; gap: 2px; }
  .v ha-icon { --mdc-icon-size: 14px; }
  /* The lights are the point of the card: readings are secondary. Their numbers use the quiet
     secondary grey and their icons keep their colours, faded towards grey. Rooms with lights on
     get a faint warm tint, so a lit room stands out on its own. */
  .v.t ha-icon { color: color-mix(in srgb, ${C.orange} 55%, ${C.grey}); }
  .v.h ha-icon { color: color-mix(in srgb, ${C.blue} 55%, ${C.grey}); }
  .v.l ha-icon { color: color-mix(in srgb, ${C.amber} 60%, ${C.grey}); }
  .room.lit { background: color-mix(in srgb, ${C.orange} 10%, transparent); }
  .room.missing .nm { color: var(--secondary-text-color); }
  /* Press feedback without moving anything: a scale-down shrinks the target under the
     finger and taps near the edge would be lost. */
  .all:active, .room:active { filter: brightness(.94); }
  .all:focus-visible, .room:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  /* When any room's readings do not fit on one line (the card measures this), every tile
     switches together: temperature on one line, humidity + light level on the next. All tiles
     keep the same height (grid-auto-rows: 1fr) even if one room has more sensors. */
  .stack .m { flex-direction: column; }
  .stack .g { flex-wrap: wrap; column-gap: 7px; }
  .stack .tile { padding: 11px 8px; gap: 8px; }
  @container (max-width: 175px) {
    .tile { padding: 11px 6px; gap: 6px; }
    .stack .g { column-gap: 5px; }
    .v { gap: 1px; }
    .m { font-size: 11.5px; }
    .v ha-icon { --mdc-icon-size: 13px; }
  }
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
      <div class="rooms" style="--cols:${Math.max(1, Math.min(4, Number(this._config.columns) || 2))}">
        ${rooms
          .map(
            (r, i) => `<div class="room" role="button" tabindex="0" data-i="${i}"><div class="tile">
              <div class="shape"><ha-icon></ha-icon><span class="badge"><ha-icon icon="mdi:window-open-variant"></ha-icon></span></div>
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
      rooms: [...root.querySelectorAll(".room")],
    };
    this._built = true;
    if (this.isConnected) this.connectedCallback();
  }

  /* Tap = switch the room; tap on the icon = open the room; hold = lamps sheet. */
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
      this._toggle(room.entity);
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._toggle(room.entity);
      }
    });
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    // Only touch the DOM when something changed: Home Assistant pushes state several times a
    // second, and replacing text under a finger can swallow the tap.
    const set = (node, text) => {
      if (node.textContent !== text) node.textContent = text;
    };

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
      set(el.querySelector(".nm"), m.name);
      const pr = presenceModel(hass, room, this._lastSeen?.[room.occupancy], this._warnMin(), m.on);
      const pel = el.querySelector(".pres");
      const phtml = !pr || pr.kind === "unknown" ? ""
        : pr.kind === "here" ? `<ha-icon icon="mdi:motion-sensor"></ha-icon>`
        : `${pr.kind === "warn" ? `<ha-icon icon="mdi:motion-sensor-off"></ha-icon>` : ""}${esc(pr.text)}`;
      if (pel.dataset.h !== phtml) {
        pel.innerHTML = phtml;
        pel.dataset.h = phtml;
      }
      pel.className = `pres${phtml ? " show" : ""}${pr ? ` ${pr.kind}` : ""}`;
      pel.title = !pr ? "" : pr.kind === "here" ? "Someone is here"
        : pr.kind === "warn" ? `Lights on, nobody here for ${pr.text}` : pr.text ? `Last seen ${pr.text} ago` : "";
      el.setAttribute("aria-label", `${m.name}: ${m.missing ? "not found" : m.on ? "on" : "off"}`);
      const [g1, g2] = el.querySelectorAll(".g");
      const html1 = m.temp ? this._v("t", "mdi:thermometer", m.temp) : "";
      const html2 = (m.hum ? this._v("h", "mdi:water-percent", m.hum) : "") + (m.lux ? this._v("l", "mdi:white-balance-sunny", m.lux) : "");
      let changed = false;
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
      if (changed) this._fit();
    });
  }

  /* One line per tile if every room's readings fit, otherwise two lines for all of them. */
  _fit() {
    if (this._fitQueued) return;
    this._fitQueued = true;
    requestAnimationFrame(() => {
      this._fitQueued = false;
      const card = this.shadowRoot?.querySelector("ha-card");
      if (!card || !card.isConnected) return;
      card.classList.remove("stack");
      const overflow = [...card.querySelectorAll(".m, .g")].some((m) => m.scrollWidth > m.clientWidth + 1);
      card.classList.toggle("stack", overflow);
    });
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
    this._call(isOn(s) ? "turn_off" : "turn_on", this._config.entity);
  }

  _toggle(entity) {
    const s = this._hass.states[entity];
    this._haptic("light");
    this._call(isOn(s) ? "turn_off" : "turn_on", entity);
  }

  async _call(service, entity) {
    const [domain] = entity.split(".");
    const d = domain === "light" || domain === "switch" ? domain : "homeassistant";
    try {
      await this._hass.callService(d, service, { entity_id: entity });
    } catch (err) {
      this._fire("hass-notification", { message: err?.message || `Could not switch ${entity}` });
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
  occupancy: "Teal icon while someone is here, otherwise how long since they were.",
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
  summary .t1 { font-size: 14px; font-weight: 500; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  summary .t2 { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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

/* ===== weather-presence-card 1.1.1 ===== */
(() => {
/*
 * Weather & presence card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A slim block for the top of a climate section: the weather (condition, your own
 * outdoor sensor and the forecast service's temperature) with two pills on the
 * right – who is home (tap for e.g. the security dashboard) and a link pill (tap
 * for e.g. the climate dashboard).
 * See cards/weather-presence-card/README.md for every option.
 */

const WPC_VERSION = "1.1.1";
const WPC_TAG = "weather-presence-card";
const HISTORY_DAYS = 7;
const HOLD_MS = 500;

const C = {
  grey: "var(--grey-color, #9e9e9e)",
  teal: "var(--teal-color, #009688)",
  orange: "var(--orange-color, #ff9800)",
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
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
const temp = (v) => (num(v) === null ? "–" : `${num(v).toFixed(1)}°C`);

function ago(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

const CSS = `
  :host { display: block; }
  /* Spacing follows Mushroom: content starts 10px from the card edge. */
  ha-card { padding: 12px 10px; container-type: inline-size; }
  .wrap { display: flex; align-items: center; gap: 10px; }
  .wx { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; cursor: pointer; -webkit-tap-highlight-color: transparent;
    user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; border-radius: 10px; }
  .shape { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .shape ha-icon { --mdc-icon-size: 24px; }
  .txt { min-width: 0; }
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sc { display: flex; flex-wrap: wrap; column-gap: 9px; font-size: 12px; line-height: 16px; letter-spacing: .4px;
    color: var(--secondary-text-color); }
  .v { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
  .v ha-icon { --mdc-icon-size: 14px; }
  .v.real ha-icon { color: color-mix(in srgb, ${C.orange} 55%, ${C.grey}); }
  .v.fc ha-icon { color: color-mix(in srgb, ${C.blue} 55%, ${C.grey}); }
  .pills { flex: none; display: flex; gap: 8px; align-items: center; }
  /* Pills are finger-sized (36px, 44px on a phone) – they are the card's buttons. */
  .pill { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; padding: 0 14px 0 10px; border-radius: 18px; cursor: pointer; font-size: 13px; font-weight: 600; letter-spacing: .2px;
    white-space: nowrap;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); color: var(--secondary-text-color);
    -webkit-tap-highlight-color: transparent; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.grey}; }
  /* Phone: the weather gets the full first line; the two pills share a row of wide buttons below. */
  @container (max-width: 440px) {
    .wrap { flex-wrap: wrap; row-gap: 8px; }
    .wx { flex: 1 1 100%; }
    .pills { flex: 1 1 100%; display: grid; grid-template-columns: repeat(var(--np, 2), minmax(0, 1fr)); }
    .pill { height: 44px; border-radius: 22px; }
  }
  .pill.home { background: ${tint(C.teal, 20)}; color: ${C.teal}; }
  .pill.home ha-icon { color: ${C.teal}; }
  .pill.link { color: var(--primary-text-color); padding-right: 4px; }
  .pill.link ha-icon { color: ${C.teal}; }
  .pill.link ha-icon.ch { --mdc-icon-size: 16px; color: ${C.grey}; margin-left: -3px; }
  .pill:active, .wx:active { filter: brightness(.92); }
  .pill:focus-visible, .wx:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
`;

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
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({ weather: "Tap the weather for the forecast; long-press for your own sensor." })[s.name],
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
  }

  disconnectedCallback() {
    clearInterval(this._tick);
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
    const link = this._config.link;
    const np = (this._presenceId() ? 1 : 0) + (link ? 1 : 0);
    root.innerHTML = `<style>${CSS}</style><ha-card><div class="wrap">
      <div class="wx" role="button" tabindex="0"><div class="shape"><ha-icon></ha-icon></div>
        <div class="txt"><div class="nm"></div><div class="sc"></div></div></div>
      <div class="pills" style="--np:${np || 1}${np ? "" : ";display:none"}">
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
    wx.addEventListener("click", () => {
      if (held) return (held = false);
      this._more(this._config.weather);
    });
    root.querySelector(".pres")?.addEventListener("click", () => {
      const p = this._config.presence;
      if (p?.navigation_path) this._navigate(p.navigation_path);
      else this._more(this._presenceId());
    });
    root.querySelector(".link")?.addEventListener("click", () => link?.navigation_path && this._navigate(link.navigation_path));
    this._built = true;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const hass = this._hass;
    const root = this.shadowRoot;
    const set = (node, v, html = false) => {
      if (!node) return;
      if (html ? node.innerHTML !== v : node.textContent !== v) html ? (node.innerHTML = v) : (node.textContent = v);
    };

    const w = hass.states[this._config.weather];
    const [icon, color] = WEATHER[w?.state] || ["mdi:weather-cloudy", C.grey];
    const shape = root.querySelector(".shape");
    shape.style.background = tint(color, 20);
    shape.querySelector("ha-icon").setAttribute("icon", icon);
    shape.querySelector("ha-icon").style.color = color;
    const cond = !w ? "Weather unavailable" : hass.formatEntityState ? hass.formatEntityState(w) : w.state.charAt(0).toUpperCase() + w.state.slice(1);
    set(root.querySelector(".nm"), cond);
    const parts = [];
    if (this._config.temperature)
      parts.push(`<span class="v real"><ha-icon icon="mdi:thermometer"></ha-icon>${esc(this._config.temperature_name || "Real")} ${esc(temp(hass.states[this._config.temperature]?.state))}</span>`);
    if (w)
      parts.push(`<span class="v fc"><ha-icon icon="mdi:weather-partly-cloudy"></ha-icon>${esc(this._config.weather_name || "Forecast")} ${esc(temp(w.attributes?.temperature))}</span>`);
    set(root.querySelector(".sc"), parts.join(""), true);

    const pres = root.querySelector(".pres");
    if (pres) {
      const home = this._home(hass.states[this._presenceId()]);
      pres.classList.toggle("home", home === true);
      pres.querySelector("ha-icon").setAttribute("icon", home ? "mdi:home-account" : "mdi:home-export-outline");
      const label = home === null ? "Presence ?" : home ? "Home" : this._since ? `Away · ${Date.now() - this._since > HISTORY_DAYS * 86400000 ? `${HISTORY_DAYS}d+` : ago(Date.now() - this._since)}` : "Away";
      set(pres.querySelector("span"), label);
    }
    const link = root.querySelector(".link");
    if (link) {
      link.querySelector("ha-icon").setAttribute("icon", this._config.link.icon || "mdi:arrow-right");
      set(link.querySelector("span"), this._config.link.name || "Open");
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
