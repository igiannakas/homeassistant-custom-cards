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
