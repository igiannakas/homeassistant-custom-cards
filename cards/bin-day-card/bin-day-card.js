/*
 * Bin day card – which bins go out, the evening before and on collection day, at the top of the home view.
 *
 *   type: custom:bin-day-card
 *   calendar: calendar.bin_collections
 *   tonight_from: input_datetime.bins_tonight_alert_from
 *   tonight_done: input_datetime.bins_tonight_alert_done_for
 *   today_done: input_datetime.bins_today_alert_done_for
 *   bins:
 *     - match: Food
 *       icon: mdi:food-apple
 *       color: green
 *     - match: Refuse
 *       icon: mdi:trash-can
 *       color: brown
 *
 * The collections come from a calendar: one all-day event per bin, as the Waste Collection Schedule
 * integration makes them (a Local Calendar with repeating events works the same way). Two alerts,
 * each a row like the appliance alert card's:
 *
 * - "Take the bins out tonight" from `tonight_from` (default 18:00) on the evening before a
 *   collection. Red glyph: something to do now.
 * - "Bins collected today" all through collection day. Amber glyph: a heads-up.
 *
 * Under the title, the bins collected, each with its glyph in the bin's own colour (brown refuse,
 * black recycling…), then a Done pill. Done stores that collection's date in the alert's own date
 * helper, so the alert stays away on every phone until the next collection. The two alerts have
 * separate helpers: Done on one never hides the other.
 *
 * The card shows only while an alert is due and takes no room otherwise: it hides itself the way
 * Home Assistant's conditional cards do (in the dashboard editor it stays visible, with the next
 * collection). The glyph is decorative, so no circle; only the glyph carries the colour, and the
 * card keeps the theme's own background.
 */

const BDC_VERSION = "1.0.0";
const BDC_TAG = "bin-day-card";

const C = {
  teal: "var(--teal-color, #009688)",
  red: "var(--red-color, #f44336)",
  amber: "var(--amber-color, #ffc107)",
  grey: "var(--grey-color, #9e9e9e)",
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LIVE = (s) => s && s !== "unavailable" && s !== "unknown";

const DEFAULT_ICON = "mdi:trash-can";
const DEFAULT_FROM = "18:00";
const TONIGHT_TITLE = "Take the bins out tonight";
const TODAY_TITLE = "Bins collected today";
const DONE_LABEL = "Done";
const DAY = 864e5;
const REFRESH = 30 * 60e3; // re-read the calendar every half hour,
const RETRY = 5 * 60e3; //    and five minutes after a failed read
const AHEAD = 16; //          days read ahead: the next fortnightly collection, for the editor preview

/* Home Assistant's named colours (the colour picker's), with the theme variable each one follows.
   Black follows the text colour, so a black bin stays visible on a dark theme. */
const NAMED = {
  red: "#f44336", pink: "#e91e63", purple: "#926bc7", "deep-purple": "#6e41ab", indigo: "#3f51b5",
  blue: "#2196f3", "light-blue": "#03a9f4", cyan: "#00bcd4", teal: "#009688", green: "#4caf50",
  "light-green": "#8bc34a", lime: "#cddc39", yellow: "#ffeb3b", amber: "#ffc107", orange: "#ff9800",
  "deep-orange": "#ff6f22", brown: "#795548", grey: "#9e9e9e", "blue-grey": "#607d8b",
  "light-grey": "#bdbdbd", "dark-grey": "#606060", white: "#ffffff", disabled: "#bdbdbd",
};
/* A bin colour as CSS – only values that are safe inside a style attribute, else null. */
function binColor(c) {
  const v = String(c ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "black") return "var(--primary-text-color)";
  if (v === "primary" || v === "accent") return `var(--${v}-color)`;
  if (NAMED[v]) return `var(--${v}-color, ${NAMED[v]})`;
  if (/^#[0-9a-f]{3,8}$/.test(v) || /^(rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)$/.test(v)) return v;
  return null;
}

/* What a collection looks like when the config doesn't say: by the words in its name. Order
   matters ("Garden waste" is garden, "Glass recycling" is glass). */
const KINDS = [
  [/food|kitchen|caddy|organic|compost|bio/i, "mdi:food-apple", "green"],
  [/garden|green waste|yard|grass/i, "mdi:leaf", "green"],
  [/glass|bottle/i, "mdi:bottle-wine", "cyan"],
  [/recycl/i, "mdi:recycle", "blue"],
  [/paper|card/i, "mdi:newspaper-variant-outline", "blue"],
  [/refuse|general|rubbish|residual|landfill|waste|trash|garbage/i, "mdi:trash-can", "grey"],
];
const kindOf = (s) => KINDS.find(([re]) => re.test(s)) || [null, "mdi:trash-can-outline", "grey"];

/* The bins of one day, from the calendar's event names: each matched to the first configured bin
   whose `match` it contains (any case), in the config's order; anything unmatched still shows,
   under its own name, after them. Never hidden – an unexpected collection is still a collection. */
function resolveBins(summaries, cfgBins) {
  const out = [];
  summaries.forEach((summary, n) => {
    const s = String(summary ?? "").trim();
    if (!s) return;
    const i = cfgBins.findIndex((b) => s.toLowerCase().includes(String(b.match).trim().toLowerCase()));
    const b = i >= 0 ? cfgBins[i] : {};
    const [, icon, color] = kindOf(s);
    const name = String(b.name ?? "").trim() || s;
    if (out.some((x) => x.name === name)) return;
    out.push({
      name,
      icon: String(b.icon ?? "").trim() || icon,
      color: binColor(b.color) || binColor(color),
      order: i >= 0 ? i : cfgBins.length + n,
    });
  });
  return out.sort((a, b) => a.order - b.order);
}

/* Clock parts of a moment in a time zone (undefined = the browser's): the day and minutes since midnight. */
function zoned(ms, tz) {
  const p = {};
  for (const x of new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)))
    p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}
/* A calendar day plus n days (calendar arithmetic, so clock changes don't matter). */
function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/* "Wed 21 Oct" for a calendar day. */
function dayLabel(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
/* The day an event falls on: an all-day event's date, or a timed event's start in the home's time zone. */
function eventDay(ev, tz) {
  const s = ev?.start;
  if (typeof s?.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(s.date)) return s.date.slice(0, 10);
  const t = Date.parse(s?.dateTime ?? "");
  return Number.isFinite(t) ? zoned(t, tz).day : null;
}
/* Minutes since midnight from "18:00", or from a time entity (input_datetime with a time, time.*). */
function minutesOf(v, hass) {
  const parse = (str) => {
    const m = /(?:^|[\sT])(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(str ?? "").trim());
    return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
  };
  const lit = parse(v);
  if (lit !== null) return lit;
  const s = hass.states[v];
  if (!s || !LIVE(s.state)) return null;
  const { hour, minute } = s.attributes || {};
  if (Number.isFinite(hour) && Number.isFinite(minute) && s.attributes.has_time !== false) return hour * 60 + minute;
  return parse(s.state);
}
/* The date a Done helper holds ("2026-10-21"), or null. */
function dayOf(s) {
  const m = s && LIVE(s.state) ? /^(\d{4}-\d{2}-\d{2})/.exec(s.state) : null;
  return m ? m[1] : null;
}

/* The card's whole view: which alerts are due, as plain values. */
function model(hass, cfg, events, now) {
  const tz = hass.locale?.time_zone === "server" ? hass.config?.time_zone : undefined;
  const z = zoned(now, tz);
  const today = z.day;
  const tomorrow = addDays(today, 1);
  const cfgBins = Array.isArray(cfg.bins) ? cfg.bins.filter((b) => b && String(b.match ?? "").trim()) : [];
  const byDay = new Map();
  for (const ev of events || []) {
    const d = eventDay(ev, tz);
    if (!d || d < today) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(ev.summary);
  }
  const binsOn = (d) => resolveBins(byDay.get(d) || [], cfgBins);
  const doneFor = (entity) => (entity ? dayOf(hass.states[entity]) : null);
  const rows = [];

  // The evening before: from the helper's time (18:00 if it isn't set or can't be read).
  if (!cfg.today_only) {
    const from = minutesOf(cfg.tonight_from ?? DEFAULT_FROM, hass) ?? minutesOf(DEFAULT_FROM, hass);
    const bins = binsOn(tomorrow);
    if (bins.length && z.min >= from && doneFor(cfg.tonight_done) !== tomorrow)
      rows.push({ key: "tonight", title: cfg.tonight_title || TONIGHT_TITLE, day: tomorrow, bins, done: cfg.tonight_done || null });
  }
  // Collection day, all day.
  const bins = binsOn(today);
  if (bins.length && doneFor(cfg.today_done) !== today)
    rows.push({ key: "today", title: cfg.today_title || TODAY_TITLE, day: today, bins, done: cfg.today_done || null });

  // The next collection, for the editor preview.
  const nextDay = [...byDay.keys()].sort().find((d) => binsOn(d).length);
  return { rows, today, next: nextDay ? { day: nextDay, bins: binsOn(nextDay) } : null };
}

/* The bins as a status line: each an unbreakable glyph + name, joined so the dot stays with the bin
   before it. Colours come from binColor(), so they are safe in the style attribute. */
const binsHtml = (bins) =>
  bins
    .map((b) => `<span class="v"><ha-icon icon="${esc(b.icon)}" style="color:${b.color || C.grey}"></ha-icon>${esc(b.name)}</span>`)
    .join("&nbsp;· ");

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  :host { display: block; }
  :host([hidden]) { display: none; }
  /* A single-block card: content 10px from the sides like Mushroom, 12px top and bottom for air.
     The theme's own card background: the glyph carries the colour. */
  ha-card { padding: 12px 10px; container-type: inline-size; }
  .rows { display: flex; flex-direction: column; gap: 12px; }
  /* One centre line per alert: glyph, text block and pill.
     Mushroom measures its 10px from the card's outer edge (its content overlaps the border), so the
     row moves out by the border width. A negative margin, never calc(10px - border) on the padding:
     themes set --ha-card-border-width to a bare 0 (the home view's does), which makes such a calc
     invalid and the padding drop to 0. Here the same 0 only makes the margin invalid, and a margin's
     fallback, 0, is right for a card without a border. */
  .wrap { display: flex; align-items: center; gap: 10px; margin: 0 calc(-1 * var(--ha-card-border-width, 1px)); }
  .wrap[hidden], .pill[hidden] { display: none; }
  .head { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; }
  /* Mushroom-sized slot: a 24px glyph in 36px, so it sits where a Mushroom shape's glyph does and the
     title starts at edge + 46. Decorative (the pill is the only action), so no circle. */
  .slot { flex: 0 0 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
  .slot ha-icon { --mdc-icon-size: 24px; color: ${C.grey}; }
  .wrap.tonight .slot ha-icon { color: ${C.red}; } /* something to do now */
  .wrap.today .slot ha-icon { color: ${C.amber}; } /* a heads-up */
  .txt { flex: 1; min-width: 0; }
  .txt > span { display: block; }
  /* Never cut off: the title wraps, and the bins wrap between bins. */
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .txt.one .nm { position: relative; top: 1px; } /* alone, a 20px line reads ~1px high next to the glyph */
  .sc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .sc:empty { display: none; }
  /* A bin: its glyph in the bin's own colour, then its name, never split. Top-aligned in the 16px
     line so glyph and name sit on the same centre as the dots between bins. */
  .v { display: inline-flex; align-items: center; gap: 2px; height: 16px; vertical-align: top; white-space: nowrap; }
  .v ha-icon { --mdc-icon-size: 14px; }
  /* Primary pill (36px = the icon slot), neutral, its icon teal: you can tap it. */
  .pill { all: unset; box-sizing: border-box; flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; padding: 0 14px 0 10px; border-radius: 18px; cursor: pointer; white-space: nowrap;
    font-size: 13px; font-weight: 600; letter-spacing: .2px; color: var(--primary-text-color);
    background: rgba(var(--rgb-primary-text-color, 33,33,33), .05); -webkit-tap-highlight-color: transparent; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.teal}; }
  .pill[aria-disabled="true"] { opacity: .45; cursor: default; }
  /* When the text and the pill don't fit on one line (measured in _fit()), the pill takes a
     full-width row under the text, which then has the whole width. */
  .wrap.stacked { flex-wrap: wrap; row-gap: 8px; }
  .wrap.stacked .head { flex: 1 1 100%; }
  .wrap.stacked .pill { flex: 1 1 100%; }
  .pill:active { filter: brightness(.92); }
  .pill:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
`;

/* Ink alignment (design rule): every line of a text block starts on the title's vertical line,
   measured on ink rather than boxes. A bin's glyph has its own side bearing inside its 14px box and
   so does a leading letter; each gets the margin that puts its ink under the title's first letter.
   The margin depends only on the glyph, not on where it sits, so it holds when the line wraps. */
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

const KEYS = ["tonight", "today", "info"];
const DONE_DOMAIN = "input_datetime";

class BinDayCard extends HTMLElement {
  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {}).filter((e) => e.startsWith("calendar."));
    return { calendar: ids.find((e) => /bin|waste|refuse|recycl|collection/.test(e)) || ids[0] || "calendar.bin_collections" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "calendar", required: true, selector: { entity: { domain: "calendar" } } },
        { type: "grid", name: "", schema: [
          { name: "tonight_from", selector: { entity: { domain: ["input_datetime", "time"] } } },
          { name: "tonight_done", selector: { entity: { domain: DONE_DOMAIN } } },
          { name: "today_done", selector: { entity: { domain: DONE_DOMAIN } } },
          { name: "today_only", selector: { boolean: {} } },
        ] },
        { name: "bins", selector: { object: {
          multiple: true,
          label_field: "match",
          description_field: "name",
          fields: {
            match: { label: "Calendar text", required: true, selector: { text: {} } },
            name: { label: "Name", selector: { text: {} } },
            icon: { label: "Icon", selector: { icon: {} } },
            color: { label: "Colour", selector: { ui_color: {} } },
          },
        } } },
        { type: "grid", name: "", schema: [
          { name: "tonight_title", selector: { text: {} } },
          { name: "today_title", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ] },
      ],
      computeLabel: (s) =>
        ({
          calendar: "Collections calendar",
          tonight_from: "Evening alert from",
          tonight_done: "Done helper – evening alert",
          today_done: "Done helper – collection day",
          today_only: "Only on collection day",
          bins: "Bins",
          tonight_title: "Evening title",
          today_title: "Collection day title",
          icon: "Icon",
        })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          calendar: "One all-day event per bin, e.g. from Waste Collection Schedule.",
          tonight_from: `A time helper; ${DEFAULT_FROM} without one.`,
          tonight_done: "A date helper. Done stores the collection's date in it. Without one there is no Done.",
          today_done: "A date helper of its own, so Done on one alert doesn't hide the other.",
          bins: "How each collection shows: the text its calendar event contains, and the bin's name, icon and colour.",
          tonight_title: `Default: "${TONIGHT_TITLE}".`,
          today_title: `Default: "${TODAY_TITLE}".`,
        })[s.name],
    };
  }

  setConfig(config) {
    const cal = config?.calendar;
    if (typeof cal !== "string" || !cal.startsWith("calendar."))
      throw new Error("Set calendar: the calendar with your bin collections (e.g. calendar.bin_collections)");
    for (const k of ["tonight_done", "today_done"])
      if (config[k] !== undefined && !(typeof config[k] === "string" && config[k].startsWith(`${DONE_DOMAIN}.`)))
        throw new Error(`${k} must be an input_datetime with a date (it stores the collection Done was pressed for)`);
    if (config.tonight_done && config.tonight_done === config.today_done)
      throw new Error("Use two different helpers for tonight_done and today_done, so Done on one alert doesn't hide the other");
    if (config.bins !== undefined && !(Array.isArray(config.bins) && config.bins.every((b) => b && typeof b === "object" && String(b.match ?? "").trim())))
      throw new Error("bins is a list, each with match: the text its calendar event contains (e.g. Food)");
    if (this._config?.calendar !== cal) {
      this._events = null;
      this._error = null;
      this._fetchedAt = 0;
      this._calState = undefined;
    }
    this._config = { ...config };
    this._pending = {};
    if (this._hass) {
      this._maybeFetch();
      this._render();
    }
  }

  set hass(hass) {
    this._hass = hass;
    this._maybeFetch();
    this._render();
  }

  /* Home Assistant sets this in the dashboard editor: the card shows there even with nothing due. */
  set preview(v) {
    this._preview = !!v;
    this._render();
  }

  get preview() {
    return !!this._preview;
  }

  getCardSize() {
    return 1;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    // The alerts change at the evening time and at midnight; the calendar is re-read every half hour.
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      this._maybeFetch();
      this._render();
    }, 60e3);
    this._observe();
    if (this._hass) {
      this._maybeFetch();
      this._render();
    }
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = null;
    this._ro?.disconnect();
  }

  _now() {
    return Date.now();
  }

  /* Read the calendar when there is nothing yet, when its entity changes (a collection day starts,
     the integration fetched new dates), on a new day, and every half hour. */
  _maybeFetch() {
    const hass = this._hass;
    const cal = this._config?.calendar;
    if (!hass || !cal || this._loading) return;
    const st = hass.states[cal];
    if (!st) return; // the preview says so
    const now = this._now();
    const tz = hass.locale?.time_zone === "server" ? hass.config?.time_zone : undefined;
    const day = zoned(now, tz).day;
    const due =
      this._fetchedAt === 0 ||
      st !== this._calState ||
      day !== this._fetchedDay ||
      now - this._fetchedAt >= (this._error ? RETRY : REFRESH);
    if (!due) return;
    this._calState = st;
    this._fetch(cal, now, day);
  }

  async _fetch(cal, now, day) {
    this._loading = true;
    const q = new URLSearchParams({ start: new Date(now - DAY).toISOString(), end: new Date(now + AHEAD * DAY).toISOString() });
    try {
      const events = await this._hass.callApi("GET", `calendars/${encodeURIComponent(cal)}?${q}`);
      if (this._config?.calendar !== cal) return; // the config moved on meanwhile
      this._events = Array.isArray(events) ? events : [];
      this._error = null;
    } catch (err) {
      if (this._config?.calendar !== cal) return;
      this._error = err?.message || err?.body?.message || "Couldn't read the calendar.";
    } finally {
      this._loading = false;
      if (this._config?.calendar === cal) {
        this._fetchedAt = now;
        this._fetchedDay = day;
      }
      this._maybeFetch(); // a calendar set while this read was out
      this._render();
    }
  }

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const row = (k) => `<div class="wrap ${k}" data-k="${k}" role="${k === "info" ? "status" : "alert"}" hidden>
        <div class="head"><span class="slot"><ha-icon icon="${DEFAULT_ICON}"></ha-icon></span><span class="txt"><span class="nm"></span><span class="sc"></span></span></div>
        <button class="pill" hidden><ha-icon icon="mdi:check"></ha-icon><span>${DONE_LABEL}</span></button>
      </div>`;
    root.innerHTML = `<style>${CSS}</style><ha-card><div class="rows">${KEYS.map(row).join("")}</div></ha-card>`;
    this._rows = {};
    for (const k of KEYS) {
      const el = root.querySelector(`.wrap.${k}`);
      this._rows[k] = el;
      el.querySelector(".pill").addEventListener("click", () => this._done(k));
    }
    this._built = true;
    this._observe();
    this.ownerDocument.fonts?.ready?.then(() => this._fit());
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const m = model(this._hass, this._config, this._events, this._now());
    this._m = m;

    // Shown while an alert is due (and always in the editor). Hidden the way conditional cards
    // are: Home Assistant's card wrapper reads `hidden` and drops the card from the section.
    const show = m.rows.length > 0 || this.preview;
    if (this.hidden !== !show) {
      this.hidden = !show;
      this.dispatchEvent(new CustomEvent("card-visibility-changed", { detail: { value: show } }));
    }

    // Only touch what changed, so a tap is never lost mid-update. Compare with the string last
    // written – innerHTML never serialises back to exactly the same text.
    const set = (el, sel, v) => {
      const n = el.querySelector(sel);
      if (n._h !== v) {
        n.innerHTML = v;
        n._h = v;
      }
    };
    const toggle = (el, hide) => {
      if (el.hidden !== hide) el.hidden = hide;
    };
    const icon = this._config.icon || DEFAULT_ICON;
    const views = Object.fromEntries(m.rows.map((r) => [r.key, r]));
    if (this.preview && !m.rows.length) views.info = this._info(m);

    for (const k of KEYS) {
      const el = this._rows[k];
      const r = views[k];
      if (!r) {
        toggle(el, true);
        this._pending[k] = false;
        continue;
      }
      toggle(el, false);
      const ic = el.querySelector(".slot ha-icon");
      if (ic.getAttribute("icon") !== icon) ic.setAttribute("icon", icon);
      set(el, ".nm", esc(r.title));
      set(el, ".sc", r.sub ?? binsHtml(r.bins));
      el.querySelector(".txt").classList.toggle("one", !(r.sub ?? r.bins.length));
      const pill = el.querySelector(".pill");
      toggle(pill, !r.done);
      const off = String(!!this._pending[k]);
      if (pill.getAttribute("aria-disabled") !== off) pill.setAttribute("aria-disabled", off);
    }

    inkSchedule(this, ".txt", () => this._fit());
  }

  /* The editor's row while nothing is due: when the card shows, and the next collection (or why
     there is none). */
  _info(m) {
    const cal = this._config.calendar;
    const st = this._hass.states[cal];
    const name = st?.attributes?.friendly_name || cal;
    let sub;
    if (!st) sub = esc(`${cal} not found`);
    else if (this._error && !this._events) sub = esc(`Couldn't read ${name}: ${this._error}`);
    else if (!this._events) sub = "Reading the calendar…";
    else if (!m.next) sub = esc(`No collections in ${name} in the next ${AHEAD - 1} days`);
    else sub = `Next ${esc(dayLabel(m.next.day))}&nbsp;· ${binsHtml(m.next.bins)}`;
    return { title: "Shows the evening before and on bin day", sub, done: null };
  }

  /* Re-check the layout whenever the card's width changes (rotation, sidebar, column count). */
  _observe() {
    const rows = this.shadowRoot?.querySelector(".rows");
    if (!rows || typeof ResizeObserver === "undefined") return;
    this._ro = this._ro || new ResizeObserver(() => this._fit());
    this._ro.disconnect();
    this._ro.observe(rows);
  }

  /* Does the pill need its own row? Not while the glyph, the title and the bins each on one line,
     and the pill at its natural width all fit in the row. Natural widths, so the answer is the
     same whichever layout is showing (no flip-flop). */
  static stacks(available, head, gap, pill) {
    return head + gap + pill > available + 0.5;
  }

  _fit() {
    const root = this.shadowRoot;
    if (!root || !this._rows) return;
    const range = this.ownerDocument.createRange();
    const contentW = (node) => (range.selectNodeContents(node), range.getBoundingClientRect().width);
    const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]) || 0;
    for (const wrap of Object.values(this._rows)) {
      if (wrap.hidden || !wrap.clientWidth) continue; // not laid out
      const p = wrap.querySelector(".pill");
      if (p.hidden) {
        wrap.classList.remove("stacked");
        continue;
      }
      const nm = wrap.querySelector(".nm");
      const sc = wrap.querySelector(".sc");
      nm.style.whiteSpace = sc.style.whiteSpace = "nowrap";
      const text = Math.max(contentW(nm), contentW(sc) + (parseFloat(sc.style.marginLeft) || 0));
      nm.style.whiteSpace = sc.style.whiteSpace = "";
      const headEl = wrap.querySelector(".head");
      const head = wrap.querySelector(".slot").offsetWidth + px(headEl, "columnGap") + text;
      const pill = contentW(p) + px(p, "paddingLeft") + px(p, "paddingRight");
      wrap.classList.toggle("stacked", BinDayCard.stacks(wrap.clientWidth, head, px(wrap, "columnGap"), pill));
    }
  }

  /* Done stores the collection's date in the alert's own helper: that alert stays away for this
     collection, everywhere, and comes back for the next one. The pill rests until the state changes
     or the call fails. */
  async _done(key) {
    const r = this._m?.rows.find((x) => x.key === key);
    if (!r?.done || this._pending[key]) return;
    this._pending[key] = true;
    this._render();
    try {
      await this._hass.callService(DONE_DOMAIN, "set_datetime", { entity_id: r.done, date: r.day }, undefined, false);
    } catch (err) {
      this._pending[key] = false;
      this._render();
      this.dispatchEvent(
        new CustomEvent("hass-notification", { detail: { message: err?.message || `Couldn't mark "${r.title}" as done.` }, bubbles: true, composed: true }),
      );
    }
  }
}

async function registerBinDayCard() {
  await window.customElements.whenDefined("home-assistant");
  if (window.customElements.get(BDC_TAG)) return;
  window.customElements.define(BDC_TAG, BinDayCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: BDC_TAG,
    name: "Bin day",
    description: "Which bins go out: the evening before and on collection day, from a collections calendar, each alert with its own Done.",
  });
  console.info(`%c BIN-DAY-CARD %c ${BDC_VERSION} `, "background:#795548;color:#fff", "");
}

registerBinDayCard();
