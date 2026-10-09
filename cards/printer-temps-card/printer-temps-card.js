/*
 * Printer temperatures card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Heaters (temperature, target, heater power – the tile glows while heating), other
 * temperature readings, and the fans, for a Klipper / Moonraker printer. Sensors
 * are found from the Moonraker prefix; every list can be overridden. Tap any value
 * (temperature, target, power, fan) for its own more-info.
 * See cards/printer-temps-card/README.md for every option.
 */

const PTC_VERSION = "1.1.3";
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
  ha-card { padding: 6px; }
  /* Card label row, the same on every card: 40px high (room for the 24px switch), the icon centred
     in a 36px slot so titles line up across cards and with the tile icons below. Only an icon
     you can tap gets a filled circle (e.g. All lights). */
  .label { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 2px 6px 8px; }
  .label > ha-icon:first-child { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; --mdc-icon-size: 18px; color: ${C.orange}; }
  /* Card label row: same on every card – 18px icon, 14px / 500 title (like Mushroom names), 12px status. */
  /* top: 1px – optical centring: the line box sits ~1px high against an icon of the same height. */
  .title { position: relative; top: 1px; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .sum { margin-left: auto; font-size: 12px; line-height: 20px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; }
  .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 6px; }
  .tile { box-sizing: border-box; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px;
    padding: 8px 10px; border-radius: 10px; cursor: pointer; background: rgba(var(--rgb-primary-text-color, 33,33,33), .04);
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
  .fans { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 8px 6px 2px; font-size: 12px; line-height: 16px; letter-spacing: .4px;
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
