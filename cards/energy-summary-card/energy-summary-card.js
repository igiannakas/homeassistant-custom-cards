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

const ESC_VERSION = "1.3.0";
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
    const cost = (kwh) => (kwh === null || price === null ? "" : money(kwh * price, currency, locale));
    const w = num(hass.states[this._config.power]?.state);
    const month = new Date().toLocaleDateString(locale || "en-GB", { month: "long" });
    // Today and the month run live: statistics up to the latest block, plus the meter since then.
    const extra = sinceStats(kwhState(hass.states[this._config.energy]), this._totals.anchor);
    const live = (v) => (v === null ? null : v + extra);
    const today = live(this._totals.today);
    const monthSoFar = live(this._totals.month);
    const rows = {
      now: ["Now", power(w, locale), w === null || price === null ? "" : perHour((w / 1000) * price, currency, locale)],
      today: ["Today", energy(today, locale), cost(today)],
      yesterday: ["Yesterday", energy(this._totals.yesterday, locale), cost(this._totals.yesterday)],
      month: [month.charAt(0).toUpperCase() + month.slice(1), energy(monthSoFar, locale), cost(monthSoFar)],
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
