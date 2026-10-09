/*
 * Enclosure filter card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * A printer enclosure's filter / vent (e.g. a StealthMax): the vent position as a
 * segmented selector, intake and exhaust side by side (temperature, humidity, VOC,
 * VOC with manual calibration), and any extra readings (e.g. the delta) as a small
 * line. Tap any value for its own more-info.
 * See cards/enclosure-filter-card/README.md for every option.
 */

const EFC_VERSION = "1.1.1";
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
  ha-card { padding: 6px; }
  .label { display: flex; align-items: center; gap: 6px; min-height: 28px; padding: 2px 6px 6px; }
  .label ha-icon { --mdc-icon-size: 18px; color: ${C.teal}; }
  /* Card label row: same on every card – 18px icon, 14px / 500 title (like Mushroom names), 12px status. */
  .title { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .sum { margin-left: auto; font-size: 12px; line-height: 20px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color);
    white-space: nowrap; }
  .vent { display: flex; align-items: center; gap: 10px; margin: 0 2px 8px 6px; }
  .vl { font-size: 12px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .seg { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(var(--n, 5), minmax(0, 1fr)); gap: 2px; padding: 3px;
    border-radius: 12px; background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); }
  .opt { all: unset; box-sizing: border-box; min-width: 0; height: 32px; border-radius: 9px; cursor: pointer; text-align: center;
    font-size: 12px; line-height: 32px; font-weight: 500; letter-spacing: .2px; color: var(--secondary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; -webkit-tap-highlight-color: transparent; }
  .opt.on { background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
  .io { display: flex; align-items: stretch; gap: 6px; }
  .side { box-sizing: border-box; flex: 1; min-width: 0; padding: 8px 10px; border-radius: 10px; cursor: pointer;
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
  .extra { display: flex; flex-wrap: wrap; gap: 2px 12px; padding: 8px 6px 2px; }
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
