/*
 * Energy summary card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * One compact row: power now, and energy used today, yesterday and this month
 * so far, each with what it costs. Tap it for the full Energy dashboard.
 * Totals come from Home Assistant's long-term statistics, so they match the
 * Energy dashboard; the price comes from the Energy settings unless you set one.
 * See cards/energy-summary-card/README.md for every option.
 */

const ESC_VERSION = "1.0.1";
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
  .row { display: flex; align-items: center; gap: 6px; padding: 10px 12px; }
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
    .row { padding: 10px 8px; }
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
