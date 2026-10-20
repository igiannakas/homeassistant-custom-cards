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

const VMC_VERSION = "2.5.3";
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
  /* Close / Cancel / Done – the button that only dismisses the pop-up – is filled in the theme's dark grey
     with white text, so it reads as the way out rather than one more row (design tokens → Dialogs). */
  button.dismiss { background: var(--dark-grey-color, #606060); color: var(--text-primary-color, #fff); }
  button.dismiss .glyph { background: rgba(255,255,255,.2); }
  button.dismiss .glyph ha-icon { color: var(--text-primary-color, #fff); }
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
      ? `<button class="cta" data-a="confirm">${glyph("mdi:restore")}Reset</button><button class="dismiss" data-a="close">${glyph("mdi:close")}Cancel</button>`
      : `${it.reset ? `<button class="cta" data-a="reset">${glyph("mdi:restore")}Reset after ${it.clean ? "cleaning" : "replacing"}</button>` : ""}
         <button data-a="history">${glyph("mdi:chart-line")}History</button><button class="dismiss" data-a="close">${glyph("mdi:close")}Close</button>`;
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
