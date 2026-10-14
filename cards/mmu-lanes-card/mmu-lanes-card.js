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
