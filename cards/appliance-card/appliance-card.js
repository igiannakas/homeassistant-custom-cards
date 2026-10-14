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

const AC_VERSION = "1.0.2";
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
  if (!unit || Math.abs(v) >= 0.995) return money(v, currency);
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
