/*
 * MMU lanes card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Every lane of a Happy Hare MMU (e.g. an EMU) at a glance: whether filament is
 * loaded, the lane's humidity (coloured: dry / OK / humid) and temperature, and a
 * fan icon while the lane is drying. The label row counts the loaded lanes and
 * shows the filament buffer (tension / compression). Sensors are found from the
 * Moonraker prefix; lanes are counted automatically.
 * See cards/mmu-lanes-card/README.md for every option.
 */

const MLC_VERSION = "1.0.0";
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
  const [dry, humid] = cfg.humidity_thresholds || [40, 50];
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
      more: hass.states[e.humidity] ? e.humidity : entry ? e.entry : null,
    };
  });
}

function buffer(hass, cfg) {
  const p = cfg.prefix;
  const u = cfg.unit ?? 0;
  const ten = hass.states[`binary_sensor.${p}_unit${u}_filament_tension`];
  const com = hass.states[`binary_sensor.${p}_unit${u}_filament_compression`];
  if (!ten && !com) return "";
  if (com?.state === "on") return "compression";
  if (ten?.state === "on") return "tension";
  return "neutral";
}

const CSS = `
  :host { display: block; }
  ha-card { padding: 6px; container-type: inline-size; }
  .label { display: flex; align-items: center; gap: 6px; min-height: 28px; padding: 2px 6px 6px; }
  .label ha-icon { --mdc-icon-size: 18px; color: ${C.teal}; }
  .title { font-size: 13px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); }
  .sum { margin-left: auto; min-width: 0; font-size: 12px; line-height: 20px; font-weight: 500; letter-spacing: .4px;
    color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lanes { display: grid; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 6px; }
  @container (max-width: 300px) { .lanes { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .lane { all: unset; box-sizing: border-box; min-width: 0; padding: 8px; border-radius: 10px; cursor: pointer;
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .04); -webkit-tap-highlight-color: transparent; }
  .lt { display: flex; align-items: center; gap: 4px; }
  .ln { flex: 1; min-width: 0; font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lane.empty .ln { color: var(--secondary-text-color); }
  .lt ha-icon { --mdc-icon-size: 18px; color: ${C.teal}; }
  .lane.empty .lt ha-icon.sp { color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .lt ha-icon.dry { --mdc-icon-size: 16px; color: ${C.orange}; }
  .lv { display: grid; gap: 1px; margin-top: 2px; font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .v { display: inline-flex; align-items: center; gap: 2px; white-space: nowrap; }
  .v ha-icon { --mdc-icon-size: 14px; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; padding: 8px 6px 2px; font-size: 11px; line-height: 14px; letter-spacing: .4px;
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
    const [dry, humid] = this._config.humidity_thresholds || [40, 50];
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="label"><ha-icon icon="mdi:tray-full"></ha-icon><span class="title">${esc(this._config.title ?? "MMU lanes")}</span><span class="sum"></span></div>
      <div class="lanes" style="--cols:${Math.max(1, Math.min(8, Number(this._config.columns) || 4))}">
        ${ls.map((l) => `<button class="lane" data-n="${l.n}"><div class="lt"><span class="ln">${esc(l.name)}</span>
          <ha-icon class="dry" icon="mdi:fan" style="display:none"></ha-icon><ha-icon class="sp"></ha-icon></div><div class="lv"></div></button>`).join("")}
      </div>
      ${this._config.legend ? `<div class="legend"><span><ha-icon icon="mdi:circle-slice-8"></ha-icon>loaded</span>
        <span><ha-icon icon="mdi:circle-outline" style="color:${C.grey}"></ha-icon>empty</span>
        <span><em style="background:${C.green}"></em>&lt;${dry}% dry</span><span><em style="background:${C.amber}"></em>${dry}–${humid}%</span>
        <span><em style="background:${C.orange}"></em>&gt;${humid}% humid</span></div>` : ""}
    </ha-card>`;
    this._lanes = ls;
    root.querySelectorAll(".lane").forEach((b) =>
      b.addEventListener("click", () => {
        const l = this._lanes[Number(b.dataset.n)];
        if (l?.more) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: l.more }, bubbles: true, composed: true }));
      }),
    );
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
        `<span class="v"${l.tone ? ` style="color:${TEXT[l.tone]}"` : ""}><ha-icon icon="mdi:water-percent"${l.tone ? ` style="color:${C[l.tone]}"` : ""}></ha-icon>${hum}</span>` +
        `<span class="v"><ha-icon icon="mdi:thermometer"></ha-icon>${l.t === null ? "–" : `${l.t.toFixed(1)}°`}</span>`;
      const lv = el.querySelector(".lv");
      if (lv.innerHTML !== html) lv.innerHTML = html;
    });
    const loaded = ls.filter((l) => l.loaded).length;
    const buf = buffer(this._hass, this._config);
    const sum = [`${loaded} of ${ls.length} loaded`, buf && `Buffer: ${buf}`].filter(Boolean).join(" · ");
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
    description: "Happy Hare MMU lanes: filament loaded, humidity and temperature per lane, buffer state.",
  });
  console.info(`%c MMU-LANES-CARD %c ${MLC_VERSION} `, "background:#009688;color:#fff", "");
}

registerMmuLanesCard();
