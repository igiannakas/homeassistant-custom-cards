/*
 * Heating schedule card – https://github.com/igiannakas/homeassistant-custom-cards
 *
 * Every room's heating day on one card, and an editor to change it.
 *
 *   type: custom:heating-schedule-card
 *   rooms:
 *     - climate: climate.living_room_thermostat
 *       schedule: input_select.living_room_heating_schedule
 *       name: Living Room        # optional, defaults to the area name
 *       icon: mdi:sofa           # optional, defaults to the area icon
 *
 * The schedules live in the Scheduler integration (nielsfaber/scheduler-component). Each room has
 * a schedule helper (an input_select or select whose options are modes: comfort, night, away,
 * frost_protection) that Scheduler sets at each change of the day, and the thermostat (e.g.
 * Roomstat) follows the helper. The card reads Scheduler's schedules over its websocket API, finds
 * the ones that set each room's helper, and draws each room's day as a 24-hour bar: a block per
 * mode in the mode's colour (Day amber, Night purple, Away blue, Off grey, the same colours as the
 * Heating controls card), with its icon and the room's temperature for that mode. A line marks
 * now. Under each room's name: the temperature now and its target, then what comes next ("Night
 * at 21:30") or why the room is not following the schedule (a mode set by hand, window open,
 * nobody home, summer lock), with a Resume button where it applies.
 *
 * Tap a room to edit its day: drag the dividers or step them in quarter hours, pick each block's
 * mode, add or remove a change. Choose which rooms get the times (rooms that share a schedule are
 * picked together; leave one out and it keeps its own times) and which days (every day, weekdays
 * or the weekend, or one day). Save works out the Scheduler changes – edit, split, add, merge or
 * remove schedules – and makes them with Scheduler's own services. When the days differ between
 * schedules, a day strip appears at the top to look at any day of the week.
 *
 * See cards/heating-schedule-card/README.md for every option.
 */

const HSC_VERSION = "1.0.4";
const HSC_TAG = "heating-schedule-card";

const NAMED = ["red", "pink", "purple", "deep-purple", "indigo", "blue", "light-blue", "cyan", "teal", "green", "light-green",
  "lime", "yellow", "amber", "orange", "deep-orange", "brown", "grey", "blue-grey"];
const FALLBACK = { red: "#f44336", pink: "#e91e63", purple: "#926bc7", "deep-purple": "#6e41ab", indigo: "#3f51b5", blue: "#2196f3",
  "light-blue": "#03a9f4", cyan: "#00bcd4", teal: "#009688", green: "#4caf50", "light-green": "#8bc34a", lime: "#cddc39",
  yellow: "#ffeb3b", amber: "#ffc107", orange: "#ff9800", "deep-orange": "#ff6f22", brown: "#795548", grey: "#9e9e9e",
  "blue-grey": "#607d8b" };
/* A colour name or CSS colour as CSS – only values that are safe inside a style attribute. */
function colorOf(c) {
  const v = String(c ?? "").trim().toLowerCase();
  if (NAMED.includes(v)) return `var(--${v}-color, ${FALLBACK[v]})`;
  if (/^#[0-9a-f]{3,8}$/.test(v) || /^(rgb|rgba|hsl|hsla)\([\d\s.,%/]+\)$/.test(v)) return v;
  return `var(--grey-color, ${FALLBACK.grey})`;
}
const C = { teal: colorOf("teal"), grey: colorOf("grey"), orange: colorOf("orange"), red: colorOf("red"), amber: colorOf("amber") };
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
/* Readable coloured text: mixed toward the text colour, so it reads on light and dark themes. */
const tx = (c, p) => `color-mix(in srgb, ${c} ${p}%, var(--primary-text-color))`;
const NEUTRAL = (a) => `rgba(var(--rgb-primary-text-color, 33,33,33), ${a})`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LIVE = (s) => s && s !== "unavailable" && s !== "unknown";
const num = (v) => (v === null || v === undefined || v === "" || !isFinite(Number(v)) ? null : Number(v));
/* 19.8 → "19.8", 20 → "20": temperatures as people say them. */
const deg = (v) => (v === null ? "–" : String(Math.round(v * 10) / 10));
const join = (parts) => parts.filter(Boolean).map((p) => `<span class="p">${p}</span>`).join("&nbsp;· ");
const listNames = (names) => (names.length < 2 ? names[0] || "" : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/* ---------- Modes ---------- */

/* What each schedule helper option means. `preset` is the thermostat preset behind it (Roomstat
   calls Night "eco"), used for the temperature and for naming the preset a room is in now. */
const MODES = {
  comfort: { name: "Day", icon: "mdi:weather-sunny", color: "amber", preset: "comfort" },
  night: { name: "Night", icon: "mdi:weather-night", color: "purple", preset: "eco" },
  eco: { name: "Night", icon: "mdi:weather-night", color: "purple", preset: "eco" },
  away: { name: "Away", icon: "mdi:home-export-outline", color: "blue", preset: "away" },
  frost_protection: { name: "Off", icon: "mdi:radiator-off", color: "grey", preset: "frost_protection" },
};
/* Thermostat presets (preset_mode) by name, for "Off by hand". */
const PRESET_NAMES = { comfort: "Day", eco: "Night", away: "Away", frost_protection: "Off", boost: "Boost", none: "Manual", home: "Home",
  sleep: "Sleep", activity: "Activity" };
const PRESET_COLORS = { comfort: "amber", eco: "purple", away: "blue", frost_protection: "grey", boost: "red", none: "teal" };
const keyOf = (o) => String(o ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const capital = (s) => {
  const t = String(s ?? "").replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "–";
};

/* ---------- Days and times ---------- */

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ALL = 127; //      a set of days is a bit mask: bit 0 = Monday … bit 6 = Sunday
const WORKDAYS = 31;
const WEEKEND = 96;
const bit = (d) => 1 << d;
const bits = (m) => DAYS.reduce((n, _, i) => n + ((m >> i) & 1), 0);
const STEP = 15; //      minutes: times snap to quarter hours
const DAY_MIN = 1440;

/* Scheduler's weekdays list as a mask: daily, workday, weekend or mon…sun. Workday and weekend
   follow Monday–Friday here (Scheduler asks the workday sensor, which also knows the holidays). */
function maskOf(weekdays) {
  const list = Array.isArray(weekdays) && weekdays.length ? weekdays : ["daily"];
  let m = 0;
  for (const w of list) {
    if (w === "daily") m |= ALL;
    else if (w === "workday") m |= WORKDAYS;
    else if (w === "weekend") m |= WEEKEND;
    else if (DAYS.includes(w)) m |= bit(DAYS.indexOf(w));
  }
  return m || ALL;
}
const weekdaysOf = (m) => (m === ALL ? ["daily"] : DAYS.filter((_, i) => (m >> i) & 1));
/* "Every day", "Weekdays", "Weekend", "Saturday", "Mon–Wed, Fri". */
function daysLabel(m) {
  if (m === ALL) return "Every day";
  if (m === WORKDAYS) return "Weekdays";
  if (m === WEEKEND) return "Weekend";
  if (bits(m) === 1) return DAY_LONG[DAYS.findIndex((_, i) => (m >> i) & 1)];
  const runs = [];
  for (let i = 0; i < 7; i++) {
    if (!((m >> i) & 1)) continue;
    const last = runs[runs.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else runs.push([i, i]);
  }
  return runs
    .map(([a, b]) => (b - a >= 2 ? `${DAY_SHORT[a]}–${DAY_SHORT[b]}` : b > a ? `${DAY_SHORT[a]}, ${DAY_SHORT[b]}` : DAY_SHORT[a]))
    .join(", ");
}

/* "on weekdays", "at the weekend", "on Saturday", "every day". */
const onDays = (m) =>
  m === ALL ? "every day" : m === WORKDAYS ? "on weekdays" : m === WEEKEND ? "at the weekend" : `on ${daysLabel(m)}`;

const pad = (n) => String(n).padStart(2, "0");
const hm = (m) => `${pad(Math.floor((((m % DAY_MIN) + DAY_MIN) % DAY_MIN) / 60))}:${pad((((m % DAY_MIN) + DAY_MIN) % DAY_MIN) % 60)}`;
const hms = (m) => `${hm(m)}:00`;
function parseClock(s) {
  const x = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(s ?? "").trim());
  if (!x || +x[1] > 23 || +x[2] > 59) return null;
  return +x[1] * 60 + +x[2];
}
const SUN_RE = /^(sunrise|sunset)([+-])(\d{1,2}):(\d{2})(?::\d{2})?$/;
/* A timeslot time: "06:00:00", or "sunrise+00:30" placed with today's sunrise. */
function parseTime(s, sun) {
  const c = parseClock(s);
  if (c !== null) return { min: c, fixed: true };
  const m = SUN_RE.exec(String(s ?? "").trim());
  if (!m || !sun || sun[m[1]] === null || sun[m[1]] === undefined) return null;
  const off = +m[3] * 60 + +m[4];
  return { min: (((sun[m[1]] + (m[2] === "+" ? off : -off)) % DAY_MIN) + DAY_MIN) % DAY_MIN, fixed: false };
}
/* Clock parts of a moment in a time zone: the day of the week (0 = Monday) and minutes since midnight. */
function zoned(ms, tz) {
  const p = {};
  for (const x of new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)))
    p[x.type] = x.value;
  const dow = (new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay() + 6) % 7;
  return { dow, min: Number(p.hour) * 60 + Number(p.minute) };
}

/* ---------- Programmes ---------- */

/* A room's day is a programme: blocks [{s, m}] from 00:00, each running until the next block's
   start (the last until midnight); m is a helper option, or null where nothing is scheduled. */
function compress(arr) {
  const out = [];
  for (let i = 0; i < DAY_MIN; i++) {
    const v = arr[i] ?? null;
    if (!out.length || out[out.length - 1].m !== v) out.push({ s: i, m: v });
  }
  return out;
}
/* Paint timeslots onto the day. A slot with a stop sets its value from start to stop (crossing
   midnight if stop is earlier); a slot without one is a trigger whose value holds until the next. */
function programOf(slots) {
  const arr = new Array(DAY_MIN);
  const fill = (a, b, v) => {
    for (let i = a; i < b; i++) arr[i] = v;
  };
  const trig = slots.filter((s) => s.stop === null).sort((a, b) => a.start - b.start);
  trig.forEach((t, i) => {
    const next = trig[(i + 1) % trig.length].start;
    const n = ((next - t.start - 1 + DAY_MIN) % DAY_MIN) + 1;
    for (let k = 0; k < n; k++) arr[(t.start + k) % DAY_MIN] = t.val;
  });
  for (const s of slots) {
    if (s.stop === null) continue;
    const end = s.stop === 0 ? DAY_MIN : s.stop;
    if (end > s.start) fill(s.start, end, s.val);
    else {
      fill(s.start, DAY_MIN, s.val);
      fill(0, s.stop, s.val);
    }
  }
  return compress(arr);
}
const ends = (prog) => prog.map((b, i) => (i < prog.length - 1 ? prog[i + 1].s : DAY_MIN));
const modeAt = (prog, min) => {
  let m = null;
  for (const b of prog || []) if (b.s <= min) m = b.m;
  return m;
};
/* Merge neighbours with the same mode and start at 00:00. */
function normProg(prog) {
  const out = [];
  for (const b of [...prog].sort((a, c) => a.s - c.s)) {
    if (out.length && out[out.length - 1].m === b.m) continue;
    out.push({ s: b.s, m: b.m });
  }
  if (out.length) out[0].s = 0;
  return out;
}
const sameProg = (a, b) => JSON.stringify(normProg(a || [])) === JSON.stringify(normProg(b || []));

/* ---------- Scheduler data ---------- */

const optionOf = (a) => a?.service_data?.option ?? a?.data?.option;
/* The room (its helper's entity id) an action sets, or null for any other action. */
function actionRoom(a, byEnt) {
  const e = a?.entity_id ?? a?.service_data?.entity_id;
  if (typeof e !== "string" || !byEnt.has(e)) return null;
  return a.service === `${e.split(".")[0]}.select_option` && optionOf(a) !== undefined ? e : null;
}
/* One Scheduler schedule as the card sees it: its days, each room's programme, and whether the
   card can rewrite its times without losing anything (plain: fixed times with a stop, no
   conditions, repeating, no date range, the same rooms in every slot). */
function parseSchedule(raw, byEnt, sun) {
  const slots = Array.isArray(raw.timeslots) ? raw.timeslots : [];
  let other = false;
  let plain = slots.length > 0;
  const vals = new Map();
  const times = slots.map((ts, i) => {
    const st = parseTime(ts.start, sun);
    const hasStop = ts.stop !== null && ts.stop !== undefined && ts.stop !== "";
    const sp = hasStop ? parseTime(ts.stop, sun) : null;
    if (!st || !hasStop || !sp || !st.fixed || !sp.fixed) plain = false;
    if (Array.isArray(ts.conditions) && ts.conditions.length) plain = false;
    for (const a of ts.actions || []) {
      const e = actionRoom(a, byEnt);
      if (!e) {
        other = true;
        continue;
      }
      if (!vals.has(e)) vals.set(e, new Array(slots.length).fill(undefined));
      vals.get(e)[i] = keyOf(optionOf(a));
    }
    return { start: st ? st.min : null, stop: sp ? sp.min : hasStop ? undefined : null };
  });
  if ((raw.repeat_type && raw.repeat_type !== "repeat") || raw.start_date || raw.end_date) plain = false;
  const rooms = new Map();
  for (const [e, v] of vals) {
    if (v.some((x) => x === undefined)) plain = false;
    rooms.set(e, programOf(times.map((t, i) => ({ ...t, val: v[i] })).filter((t) => t.start !== null && t.stop !== undefined)));
  }
  return {
    id: raw.schedule_id, entity: raw.entity_id, name: raw.name || "", mask: maskOf(raw.weekdays),
    enabled: raw.enabled !== false, plain, other, rooms, raw,
  };
}

/* Only what Scheduler's schema takes, in a fixed key order (empty conditions are refused). */
function sanitizeSlot(ts) {
  const out = { start: ts.start };
  if (ts.stop !== null && ts.stop !== undefined && ts.stop !== "") out.stop = ts.stop;
  const conds = Array.isArray(ts.conditions) ? ts.conditions : [];
  if (conds.length) {
    out.conditions = conds.map((c) => {
      const o = { entity_id: c.entity_id, value: c.value, match_type: c.match_type };
      if (c.attribute) o.attribute = c.attribute;
      return o;
    });
    if (ts.condition_type) out.condition_type = ts.condition_type;
    if (ts.track_conditions !== null && ts.track_conditions !== undefined) out.track_conditions = !!ts.track_conditions;
  }
  out.actions = (ts.actions || []).map((a) => {
    const o = {};
    if (a.entity_id) o.entity_id = a.entity_id;
    o.service = a.service;
    const data = a.service_data ?? a.data;
    if (data && typeof data === "object") o.service_data = data;
    return o;
  });
  return out;
}
/* Slots compared without caring about the order of the actions in them. */
const slotsSig = (slots) =>
  JSON.stringify(
    slots.map(sanitizeSlot).map((s) => ({ ...s, actions: [...s.actions].sort((a, b) => String(a.entity_id).localeCompare(String(b.entity_id))) })),
  );
/* A programme as Scheduler timeslots for these rooms. */
function buildSlots(prog, rooms) {
  const p = normProg(prog);
  const e = ends(p);
  return p.map((b, i) => ({
    start: hms(b.s),
    stop: hms(e[i] === DAY_MIN ? 0 : e[i]),
    actions: rooms.map((r) => ({ entity_id: r.schedule, service: `${r.schedule.split(".")[0]}.select_option`, service_data: { option: r.options?.[b.m] ?? b.m } })),
  }));
}
/* The slots with only (keep) or without (!keep) these rooms' actions; empty slots dropped. */
function filterRooms(slots, set, byEnt, keep) {
  return slots
    .map((ts) => ({ ...ts, actions: (ts.actions || []).filter((a) => set.has(actionRoom(a, byEnt)) === keep) }))
    .filter((ts) => ts.actions.length);
}
function genName(rooms, mask) {
  const who = listNames(rooms.map((r) => r.name)) || "Heating";
  return `${who} heating${mask === ALL ? "" : ` (${daysLabel(mask)})`}`;
}

/*
 * Save plan: give `prog` to every room in `targets` (helper entity ids) on every day in `days`,
 * and leave every other room-day as it is. Works schedule by schedule:
 *   - all of its rooms and all of its days are changing → its times are rewritten;
 *   - all of its rooms, some of its days → it keeps the other days;
 *   - some of its rooms → those rooms leave it (taking their old times for the days that don't
 *     change into a schedule of their own).
 * Whatever is still needed becomes new schedules, one per set of days. Schedules left with the
 * same rooms and the same times are merged, and a schedule whose rooms or days changed gets a
 * name that says so. Returns the service calls, in order: switch-ons, edits, adds, removes.
 */
function planSave(models, rooms, targets, days, prog) {
  const byEnt = new Map(rooms.map((r) => [r.schedule, r]));
  const inOrder = (set) => rooms.filter((r) => set.has(r.schedule));
  const items = models.map((s) => ({
    s, mask: s.mask, roomSet: new Set(s.rooms.keys()), slots: Array.isArray(s.raw.timeslots) ? s.raw.timeslots : [],
    plain: s.plain, other: s.other, touched: false, removed: false,
  }));
  const need = new Map([...targets].map((t) => [t, days]));
  for (const it of items) {
    const ra = new Set([...it.roomSet].filter((e) => targets.has(e)));
    const da = it.mask & days;
    if (!ra.size || !da) continue;
    const allRooms = ra.size === it.roomSet.size && !it.other;
    it.touched = true;
    if (allRooms && da === it.mask && it.plain) {
      it.slots = buildSlots(prog, inOrder(ra));
      for (const e of ra) need.set(e, need.get(e) & ~da);
    } else if (allRooms && da !== it.mask) {
      it.mask &= ~da;
    } else {
      const rest = it.mask & ~da;
      if (rest)
        items.push({ s: null, mask: rest, roomSet: new Set(ra), slots: filterRooms(it.slots, ra, byEnt, true), plain: it.plain, other: false,
          touched: true, removed: false });
      it.slots = filterRooms(it.slots, ra, byEnt, false);
      for (const e of ra) it.roomSet.delete(e);
      if (!it.slots.length) it.removed = true;
    }
  }
  const groups = new Map();
  for (const [e, m] of need) {
    if (!m) continue;
    if (!groups.has(m)) groups.set(m, new Set());
    groups.get(m).add(e);
  }
  for (const [m, set] of groups)
    items.push({ s: null, mask: m, roomSet: set, slots: buildSlots(prog, inOrder(set)), plain: true, other: false, touched: true, removed: false });

  // Merge schedules that now hold the same rooms and times on different days.
  const mergeable = (it) => !it.removed && it.plain && !it.other && it.roomSet.size > 0;
  const sig = (it) => `${[...it.roomSet].sort().join("|")}#${slotsSig(it.slots)}`;
  for (let again = true; again; ) {
    again = false;
    for (let i = 0; i < items.length && !again; i++)
      for (let j = i + 1; j < items.length && !again; j++) {
        const a = items[i];
        const b = items[j];
        if (!mergeable(a) || !mergeable(b) || !(a.touched || b.touched) || a.mask & b.mask || sig(a) !== sig(b)) continue;
        const [keep, drop] = !a.s && b.s ? [b, a] : a.s && b.s && bits(b.mask) > bits(a.mask) ? [b, a] : [a, b];
        keep.mask |= drop.mask;
        keep.touched = true;
        drop.removed = true;
        again = true;
      }
  }

  const ops = [];
  const adds = [];
  const removes = [];
  for (const it of items) {
    if (!it.s) {
      if (!it.removed)
        adds.push({ domain: "scheduler", service: "add", data: { name: genName(inOrder(it.roomSet), it.mask), weekdays: weekdaysOf(it.mask),
          timeslots: it.slots.map(sanitizeSlot), repeat_type: "repeat" } });
      continue;
    }
    if (it.removed) {
      if (it.touched) removes.push({ domain: "scheduler", service: "remove", data: { entity_id: it.s.entity } });
      continue;
    }
    if (!it.touched) continue;
    const data = {};
    if (it.mask !== it.s.mask) data.weekdays = weekdaysOf(it.mask);
    if (slotsSig(it.slots) !== slotsSig(it.s.raw.timeslots || [])) data.timeslots = it.slots.map(sanitizeSlot);
    const roomsChanged = it.roomSet.size !== it.s.rooms.size;
    if (!it.other && (roomsChanged || data.weekdays)) {
      const name = genName(inOrder(it.roomSet), it.mask);
      if (name !== it.s.name) data.name = name;
    }
    if (!Object.keys(data).length) continue;
    // Editing a schedule that is off turns it on: a schedule changed here is meant to run.
    if (!it.s.enabled) ops.push({ domain: "switch", service: "turn_on", data: { entity_id: it.s.entity } });
    ops.push({ domain: "scheduler", service: "edit",
      data: { entity_id: it.s.entity, ...data, start_date: it.s.raw.start_date ?? null, end_date: it.s.raw.end_date ?? null } });
  }
  return [...ops, ...adds, ...removes];
}

/* ---------- Styles ---------- */

const SEG_CSS = `
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: ${NEUTRAL(0.05)}; }
  .seg button { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: 0; min-height: 32px; padding: 0 6px; border-radius: 9px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 4px; text-align: center; font-size: 12px; line-height: 16px; font-weight: 500;
    color: var(--secondary-text-color); overflow-wrap: break-word; -webkit-tap-highlight-color: transparent; }
  .seg button[aria-pressed="true"] { background: var(--card-background-color, #fff); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
  .seg button:active { filter: brightness(.92); }
  .seg button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .seg button ha-icon { --mdc-icon-size: 16px; }
  .seg[hidden] { display: none; }
`;

/* A day bar: blocks in their mode's colour, each labelled with what fits. */
const BAR_CSS = `
  .bar { position: relative; height: 28px; border-radius: 6px; overflow: hidden; background: ${NEUTRAL(0.05)}; }
  .b { position: absolute; top: 0; bottom: 0; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 3px;
    overflow: hidden; white-space: nowrap; font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .2px; }
  .b + .b { border-left: 2px solid var(--card-background-color, #fff); }
  .b ha-icon { --mdc-icon-size: 14px; flex: none; }
  .b.none { background: ${NEUTRAL(0.04)}; color: var(--secondary-text-color); }
`;

const CSS = `
  /* Icons centre their glyph with flex. As a plain block, ha-icon lays its glyph out on a text line
     and it sits 0.4–3px low (design rule: glyphs are centred on their row, measured). */
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { display: block; }
  ha-card { padding: 10px; container-type: inline-size; }
  /* Label row, the same on every card: a 24px glyph in a 36px slot (decorative, so no circle), the
     title at edge + 46 like Mushroom, the summary under it. Moved out by the border width, as
     Mushroom's content overlaps the border (a margin, never a calc in the padding). */
  .label { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 0 8px; margin: 0 calc(-1 * var(--ha-card-border-width, 1px)); }
  .label > ha-icon { flex: 0 0 36px; height: 36px; --mdc-icon-size: 24px; color: ${C.grey}; }
  .lt { flex: 1; min-width: 0; }
  .lt > span { display: block; }
  .title { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .lt.one .title { position: relative; top: 1px; } /* alone, a 20px line reads ~1px high next to the glyph */
  .status { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .status:empty { display: none; }
  .p { white-space: nowrap; }
  .days { margin: 0 0 10px; }
  .days button[aria-current="date"]:not([aria-pressed="true"]) { color: ${tx(C.teal, 75)}; }
  /* Hours over the bars, on the bars' own left and right edges (inside the tiles' 10px). */
  .axis { position: relative; height: 16px; margin: 0 10px 4px; font-size: 11px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .axis span { position: absolute; top: 0; transform: translateX(-50%); }
  .axis span:first-child { transform: none; }
  .axis span:last-child { transform: translateX(-100%); }
  .rooms { display: grid; gap: 8px; }
  /* A tile per room; it glows orange while the room heats. */
  .room { box-sizing: border-box; min-width: 0; padding: 11px 10px; border-radius: 10px; cursor: pointer; background: ${NEUTRAL(0.04)};
    -webkit-tap-highlight-color: transparent; transition: background-color 180ms; }
  .room.heat { background: ${tint(C.orange, 10)}; }
  .head { display: flex; align-items: center; gap: 10px; }
  .shape { all: unset; box-sizing: border-box; flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center;
    justify-content: center; cursor: pointer; background: color-mix(in srgb, currentColor 20%, transparent); -webkit-tap-highlight-color: transparent; }
  .shape ha-icon { --mdc-icon-size: 24px; }
  .txt { flex: 1; min-width: 0; }
  .txt > span { display: block; }
  .nm { font-size: 14px; line-height: 20px; font-weight: 500; letter-spacing: .1px; color: var(--primary-text-color); overflow-wrap: break-word; }
  .nm .link { --mdc-icon-size: 14px; height: 20px; margin-left: 4px; vertical-align: top; color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent); }
  .sc { font-size: 12px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .sc .v { all: unset; cursor: pointer; border-radius: 4px; white-space: nowrap; }
  .sc .warn { color: ${tx(C.amber, 70)}; }
  /* Primary pill (36px = the icon circle), neutral, its icon teal: you can tap it. */
  .pill { all: unset; box-sizing: border-box; flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; padding: 0 14px 0 10px; border-radius: 18px; cursor: pointer; white-space: nowrap;
    font-size: 13px; font-weight: 600; letter-spacing: .2px; color: var(--primary-text-color); background: ${NEUTRAL(0.05)};
    -webkit-tap-highlight-color: transparent; }
  .pill ha-icon { --mdc-icon-size: 18px; color: ${C.teal}; }
  .pill[hidden] { display: none; }
  .pill[aria-disabled="true"] { opacity: .45; cursor: default; }
  .room .bar { margin-top: 10px; }
  .bar.off { opacity: .45; }
  .now { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--primary-text-color);
    box-shadow: 0 0 0 1px var(--card-background-color, #fff); pointer-events: none; }
  .now[hidden] { display: none; }
  /* filter, never transform: scaling moves the hit area mid-tap. */
  .room:active, .pill:active, .shape:active, .sc .v:active { filter: brightness(.92); }
  .room:focus-visible, .pill:focus-visible, .shape:focus-visible, .sc .v:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  ${SEG_CSS}
  ${BAR_CSS}
`;

/* The editor sheet (Bubble look). */
const SHEET_CSS = `
  ha-icon { display: inline-flex; align-items: center; justify-content: center; }
  ha-icon[hidden] { display: none; }
  :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
    font-family: var(--ha-font-family-body, Roboto, sans-serif); }
  .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px); animation: fade 160ms ease-out; }
  .dialog { position: relative; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto;
    overscroll-behavior: contain; padding: 25px 18px 18px; border-radius: 32px; color: var(--primary-text-color);
    background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25);
    animation: pop 180ms cubic-bezier(.2,.9,.3,1.2); }
  .row { display: flex; align-items: center; gap: 6px; padding-left: 8px; }
  .glyph { flex: 0 0 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  .glyph ha-icon { --mdc-icon-size: 24px; }
  .tt { flex: 1; min-width: 0; padding-left: 4px; }
  .title { font-size: 20px; line-height: 26px; font-weight: 600; overflow-wrap: break-word; }
  .sub { font-size: 15px; line-height: 21px; color: var(--secondary-text-color); }
  /* The big bar: drag the dividers. */
  .ebar { position: relative; margin: 22px 8px 0; touch-action: none; }
  .ebar .bar { height: 44px; border-radius: 10px; }
  .h { all: unset; position: absolute; top: -6px; bottom: -6px; width: 24px; margin-left: -12px; display: flex; justify-content: center;
    cursor: ew-resize; touch-action: none; -webkit-tap-highlight-color: transparent; }
  .h::before { content: ""; width: 4px; border-radius: 2px; background: var(--primary-text-color); box-shadow: 0 0 0 2px var(--card-background-color, #fff); }
  .h:focus-visible::before { background: var(--primary-color); }
  .h.drag::before { width: 6px; }
  .eaxis { position: relative; height: 16px; margin: 6px 8px 0; font-size: 11px; line-height: 16px; letter-spacing: .4px; color: var(--secondary-text-color); }
  .eaxis span { position: absolute; top: 0; transform: translateX(-50%); }
  .eaxis span:first-child { transform: none; }
  .eaxis span:last-child { transform: translateX(-100%); }
  .blocks { margin-top: 14px; display: grid; gap: 4px; }
  .blk { display: grid; gap: 6px; padding: 10px; border-radius: 16px; background: ${NEUTRAL(0.05)}; }
  .tm { display: flex; align-items: center; gap: 4px; min-height: 30px; }
  .t { min-width: 52px; text-align: center; font-size: 16px; line-height: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .to { flex: 1; font-size: 15px; line-height: 21px; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; padding-left: 4px; }
  .step, .del { all: unset; box-sizing: border-box; flex: none; width: 30px; height: 30px; border-radius: 15px; display: flex; align-items: center;
    justify-content: center; cursor: pointer; background: ${NEUTRAL(0.06)}; color: var(--primary-text-color); -webkit-tap-highlight-color: transparent; }
  .step ha-icon, .del ha-icon { --mdc-icon-size: 18px; }
  .step.first { visibility: hidden; }
  .del { background: none; color: var(--secondary-text-color); }
  .add { all: unset; box-sizing: border-box; margin-top: 8px; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px 0 8px;
    border-radius: 15px; cursor: pointer; font-size: 12px; font-weight: 600; letter-spacing: .2px; background: ${NEUTRAL(0.05)};
    -webkit-tap-highlight-color: transparent; }
  .add ha-icon { --mdc-icon-size: 16px; color: ${C.teal}; }
  .sec { margin-top: 18px; display: grid; gap: 8px; }
  .sec[hidden] { display: none; }
  .k { font-size: 12px; line-height: 16px; font-weight: 500; letter-spacing: .4px; color: var(--secondary-text-color); padding-left: 2px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { all: unset; box-sizing: border-box; flex: 1 1 0; min-width: max-content; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 30px; padding: 0 12px 0 8px; border-radius: 15px; cursor: pointer; white-space: nowrap; font-size: 12px; font-weight: 600; letter-spacing: .2px;
    color: var(--secondary-text-color); background: ${NEUTRAL(0.05)}; -webkit-tap-highlight-color: transparent; }
  .chip ha-icon { --mdc-icon-size: 16px; }
  .chip[aria-pressed="true"] { background: ${tint(C.teal, 18)}; color: ${tx(C.teal, 70)}; }
  .chip[aria-disabled="true"] { cursor: default; }
  .hint { font-size: 13px; line-height: 18px; color: var(--secondary-text-color); padding-left: 2px; }
  .hint:empty, .note:empty, .err:empty { display: none; }
  .note { margin-top: 16px; font-size: 13px; line-height: 18px; color: ${tx(C.amber, 70)}; padding-left: 2px; }
  .err { margin-top: 16px; font-size: 13px; line-height: 18px; color: ${tx(C.red, 85)}; padding-left: 2px; }
  .actions { margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--divider-color, rgba(0,0,0,.12)); display: grid;
    grid-template-columns: 1fr 1fr; gap: 8px; }
  .act { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; height: 56px; padding-left: 10px;
    border-radius: 28px; cursor: pointer; font-size: 16px; font-weight: 600; background: ${NEUTRAL(0.07)}; color: var(--primary-text-color);
    -webkit-tap-highlight-color: transparent; }
  .act .glyph { flex-basis: 36px; height: 36px; background: ${tint(C.grey, 20)}; }
  .act .glyph ha-icon { --mdc-icon-size: 22px; color: ${C.grey}; }
  .act.save { background: ${C.orange}; color: #fff; }
  .act.save .glyph { background: rgba(255,255,255,.2); }
  .act.save .glyph ha-icon { color: #fff; }
  /* Cancel – it only dismisses the confirmation – is full size like the confirm button, in a plain
     light grey: quiet beside the coloured choice, never black text on a mid grey (design tokens → Dialogs). */
  .act.dismiss { background: ${NEUTRAL(0.1)}; color: var(--primary-text-color); }
  .act.dismiss .glyph { background: ${NEUTRAL(0.08)}; }
  .act.dismiss .glyph ha-icon { color: var(--primary-text-color); }
  .act[aria-disabled="true"] { opacity: .6; cursor: default; }
  .step:active, .del:active, .add:active, .chip:active, .act:active { filter: brightness(.92); }
  .step:focus-visible, .del:focus-visible, .add:focus-visible, .chip:focus-visible, .act:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  ${SEG_CSS}
  ${BAR_CSS}
  @keyframes fade { from { opacity: 0; } }
  @keyframes pop { from { opacity: 0; transform: scale(.94); } }
`;

/* Ink alignment (design rule): every line of a text block starts on the title's vertical line,
   measured on ink rather than boxes. A leading letter has its own side bearing; each line gets the
   margin that puts its first ink under the title's first letter. */
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
    } else if (n.nodeType === 1 && inkVisible(n) && n.localName !== "ha-icon") {
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
function inkAlign(blocks) {
  for (const b of blocks) {
    const lines = [...b.children].filter(inkVisible);
    const t = lines.length > 1 ? inkLead(lines[0]) : null;
    if (!t) continue;
    const ref = inkText(t);
    if (ref === null) return;
    for (const line of lines.slice(1)) {
      const lead = inkLead(line);
      if (!lead) continue;
      const v = ref - inkText(lead);
      const px = Math.abs(v) > 0.2 ? `${v.toFixed(2)}px` : "";
      if (line.style.marginLeft !== px) line.style.marginLeft = px;
    }
  }
}
function inkSchedule(host, selector) {
  if (host._inkQueued) return;
  host._inkQueued = true;
  requestAnimationFrame(() => {
    host._inkQueued = false;
    if (host.shadowRoot) inkAlign(host.shadowRoot.querySelectorAll(selector));
  });
}

/* ---------- Card ---------- */

class HeatingScheduleCard extends HTMLElement {
  static getStubConfig(hass) {
    const S = hass?.states || {};
    const helpers = Object.keys(S).filter((e) => /^(input_)?select\./.test(e));
    const rooms = Object.keys(S)
      .filter((e) => e.startsWith("climate.") && "schedule_preset" in (S[e].attributes || {}))
      .map((climate) => {
        const base = climate.split(".")[1].replace(/_thermostat$/, "");
        const schedule =
          helpers.find((h) => h.split(".")[1] === `${base}_heating_schedule`) ||
          helpers.find((h) => h.includes(base) && (S[h].attributes?.options || []).map(keyOf).includes("comfort"));
        return schedule ? { climate, schedule } : null;
      })
      .filter(Boolean);
    return { rooms: rooms.length ? rooms : [{ climate: "climate.living_room", schedule: "input_select.living_room_heating_schedule" }] };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "rooms", required: true, selector: { object: {
          multiple: true,
          label_field: "name",
          description_field: "climate",
          fields: {
            climate: { label: "Thermostat", required: true, selector: { entity: { domain: "climate" } } },
            schedule: { label: "Schedule helper", required: true, selector: { entity: { domain: ["input_select", "select"] } } },
            name: { label: "Name", selector: { text: {} } },
            icon: { label: "Icon", selector: { icon: {} } },
          },
        } } },
      ],
      computeLabel: (s) => ({ title: "Title", rooms: "Rooms" })[s.name] ?? s.name,
      computeHelper: (s) =>
        ({
          rooms:
            "Each room's thermostat and the helper Scheduler sets for it (options such as comfort, night, away, frost_protection). Name and icon default to the room's area.",
        })[s.name],
    };
  }

  setConfig(config) {
    const rooms = config?.rooms;
    if (!Array.isArray(rooms) || !rooms.length)
      throw new Error("Set rooms: a list of { climate: climate.x, schedule: input_select.x_heating_schedule }");
    const seen = new Set();
    for (const r of rooms) {
      if (!r || typeof r.climate !== "string" || !r.climate.startsWith("climate."))
        throw new Error("Each room needs climate: its thermostat (a climate entity)");
      if (typeof r.schedule !== "string" || !/^(input_)?select\./.test(r.schedule))
        throw new Error(`${r.climate}: set schedule – the input_select (or select) Scheduler sets for this room`);
      if (seen.has(r.schedule)) throw new Error(`${r.schedule} is listed for two rooms; each room needs its own schedule helper`);
      seen.add(r.schedule);
    }
    if (config.modes !== undefined && (typeof config.modes !== "object" || Array.isArray(config.modes)))
      throw new Error("modes is a map from a helper option to { name, icon, color }");
    this._config = { ...config };
    this._built = false;
    this._models = null;
    this._modelKey = null;
    if (this._hass) this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first || !this._schedules) this._connect();
    this._render();
    if (this._sheet) this._paintSheet();
  }

  getCardSize() {
    return 2 + (this._config?.rooms?.length || 1) * 2;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto" };
  }

  connectedCallback() {
    clearInterval(this._timer);
    // The now line and "Night at 21:30" move with the clock; schedules are re-read when Scheduler
    // says they changed, and every 5 minutes if that subscription isn't available.
    this._timer = setInterval(() => {
      if (!this._unsub && Date.now() - (this._fetchedAt || 0) > 5 * 60e3) this._fetch();
      this._render();
    }, 30e3);
    this._observe();
    if (this._hass) {
      this._connect();
      this._render();
    }
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    this._timer = null;
    this._ro?.disconnect();
    this._closeSheet();
    this._disconnect();
  }

  _now() {
    return Date.now();
  }

  /* ----- Scheduler: read the schedules, and again whenever Scheduler says they changed. ----- */

  _connect() {
    const hass = this._hass;
    if (!hass || !this.isConnected) return;
    // Read now, unless the last read failed less than a minute ago (Scheduler not installed, or
    // Home Assistant restarting): a failing read is not retried on every state change.
    if (!this._schedules && !this._loading && Date.now() - (this._fetchedAt || 0) > (this._error ? 60e3 : 0)) this._fetch();
    if (this._subscribing || this._unsub || !hass.connection?.subscribeMessage) return;
    this._subscribing = true;
    const conn = hass.connection;
    Promise.resolve(conn.subscribeMessage(() => this._fetchSoon(), { type: "scheduler_updated" }))
      .then((unsub) => {
        this._subscribing = false;
        if (!this.isConnected) return typeof unsub === "function" && unsub();
        this._unsub = typeof unsub === "function" ? unsub : null;
        this._conn = conn;
        this._onReady = () => this._fetchSoon();
        conn.addEventListener?.("ready", this._onReady);
      })
      .catch(() => {
        this._subscribing = false;
      });
  }

  _disconnect() {
    try {
      this._unsub?.();
    } catch (e) {
      /* already closed */
    }
    this._unsub = null;
    if (this._conn && this._onReady) this._conn.removeEventListener?.("ready", this._onReady);
    this._conn = null;
  }

  _fetchSoon() {
    clearTimeout(this._fetchTimer);
    this._fetchTimer = setTimeout(() => this._fetch(), 250);
  }

  async _fetch() {
    if (!this._hass?.callWS) return;
    if (this._loading) {
      this._again = true;
      return;
    }
    this._loading = true;
    try {
      const list = await this._hass.callWS({ type: "scheduler" });
      this._schedules = Array.isArray(list) ? list : [];
      this._error = null;
    } catch (err) {
      this._error =
        err?.code === "unknown_command"
          ? "The Scheduler integration isn't installed (HACS: Scheduler component)."
          : `Couldn't read the schedules: ${err?.message || "no answer from Home Assistant"}`;
    } finally {
      this._loading = false;
      this._fetchedAt = Date.now();
      this._render();
      if (this._sheet) this._paintSheet();
      if (this._again) {
        this._again = false;
        this._fetch();
      }
    }
  }

  /* ----- Model ----- */

  _tz() {
    return this._hass?.config?.time_zone || undefined;
  }

  _rooms() {
    const hass = this._hass;
    return this._config.rooms.map((r, i) => {
      const reg = hass.entities?.[r.climate];
      const area = reg?.area_id ? hass.areas?.[reg.area_id] : reg?.device_id ? hass.areas?.[hass.devices?.[reg.device_id]?.area_id] : null;
      const st = hass.states[r.climate];
      const helper = hass.states[r.schedule];
      // Helper options by mode key ("Night" → night), so the card writes the helper's own spelling.
      const options = {};
      for (const o of helper?.attributes?.options || []) options[keyOf(o)] = o;
      return {
        i, climate: r.climate, schedule: r.schedule, options,
        name: r.name || area?.name || st?.attributes?.friendly_name || r.climate,
        icon: r.icon || area?.icon || "mdi:radiator",
      };
    });
  }

  _sun() {
    const s = this._hass.states["sun.sun"];
    if (!s) return null;
    const at = (iso) => {
      const t = Date.parse(iso ?? "");
      return Number.isFinite(t) ? zoned(t, this._tz()).min : null;
    };
    return { sunrise: at(s.attributes?.next_rising), sunset: at(s.attributes?.next_setting) };
  }

  _model() {
    const rooms = this._rooms();
    const key = [this._schedules, this._hass.states["sun.sun"], rooms.map((r) => r.schedule).join()];
    if (this._models && this._modelKey && key.every((k, i) => k === this._modelKey[i])) {
      this._models.rooms = rooms;
      return this._models;
    }
    const byEnt = new Map(rooms.map((r) => [r.schedule, r]));
    const sun = this._sun();
    const schedules = (this._schedules || []).map((raw) => parseSchedule(raw, byEnt, sun)).filter((s) => s.rooms.size);
    this._models = { rooms, schedules };
    this._modelKey = key;
    return this._models;
  }

  /* The schedules that set this room on this day; the first one switched on is the one that counts. */
  static cell(schedules, ent, dow) {
    const list = schedules.filter((s) => s.rooms.has(ent) && (s.mask >> dow) & 1);
    return { list, primary: list.find((s) => s.enabled) || list[0] || null, overlap: list.filter((s) => s.enabled).length > 1 };
  }

  _mode(key) {
    const k = keyOf(key);
    const base = MODES[k] || { name: capital(key), icon: "mdi:thermostat", color: "grey", preset: k };
    const o = this._config.modes?.[k] || this._config.modes?.[key] || {};
    return { key: k, preset: o.preset || base.preset, name: o.name || base.name, icon: o.icon || base.icon, color: colorOf(o.color || base.color) };
  }

  /* A room's temperature for a mode: the thermostat's own preset number (Roomstat: same device,
     translation key <preset>_target), else number.<thermostat>_<option>_temperature. */
  _temp(room, key) {
    const hass = this._hass;
    const mode = this._mode(key);
    const reg = hass.entities || {};
    // Which entity holds it is looked up once per registry (not on every state change).
    if (this._tempReg !== reg) {
      this._tempReg = reg;
      this._tempIds = new Map();
    }
    const ck = `${room.climate}|${mode.key}`;
    if (!this._tempIds.has(ck)) {
      const dev = reg[room.climate]?.device_id;
      let id = null;
      if (dev) {
        const hit = Object.values(reg).find((e) => e.device_id === dev && e.translation_key === `${mode.preset}_target` && e.entity_id?.startsWith("number."));
        if (hit) id = hit.entity_id;
      }
      if (!id) {
        const obj = room.climate.split(".")[1];
        id = [`number.${obj}_${mode.key}_temperature`, `number.${obj}_${mode.preset}_temperature`].find((e) => hass.states[e]) || null;
      }
      if (id || Object.keys(reg).length) this._tempIds.set(ck, id);
      if (!id) return null;
    }
    const id = this._tempIds.get(ck);
    return id ? num(hass.states[id]?.state) : null;
  }

  /* What a room does next on its schedule after `now`: { k (days ahead), s, m }, or null. */
  _next(schedules, room, now) {
    const progOn = (d) => {
      const p = HeatingScheduleCard.cell(schedules, room.schedule, d).primary;
      return p && p.enabled ? p.rooms.get(room.schedule) : null;
    };
    const today = progOn(now.dow);
    if (!today) return null;
    // A gap (nothing scheduled) is not a change: Scheduler does nothing there and the room keeps
    // its mode. So "now" is the last mode set at or before this minute.
    let cur = null;
    for (const b of today) if (b.s <= now.min && b.m !== null) cur = b.m;
    for (let k = 0; k < 8; k++) {
      const prog = k === 0 ? today : progOn((now.dow + k) % 7);
      if (!prog) return null;
      for (const b of prog) {
        if ((k === 0 && b.s <= now.min) || b.m === null) continue;
        if (b.m !== cur) return { k, s: b.s, m: b.m };
      }
    }
    return null;
  }

  _when(n, now) {
    if (!n) return "";
    if (n.k === 0 || (n.k === 1 && n.s <= now.min)) return `at ${hm(n.s)}`;
    if (n.k === 1) return `tomorrow at ${hm(n.s)}`;
    return `on ${DAY_SHORT[(now.dow + n.k) % 7]} at ${hm(n.s)}`;
  }

  /* ----- Render ----- */

  _build() {
    const root = this.shadowRoot || this.attachShadow({ mode: "open" });
    const rooms = this._config.rooms;
    root.innerHTML = `<style>${CSS}</style><ha-card>
      <div class="label"><ha-icon icon="${esc(this._config.icon || "mdi:calendar-clock")}"></ha-icon>
        <div class="lt"><span class="title">${esc(this._config.title ?? "Heating schedule")}</span><span class="status"></span></div></div>
      <div class="seg days" role="group" aria-label="Day" hidden>${DAY_SHORT.map((d, i) => `<button data-day="${i}" aria-pressed="false" aria-label="${DAY_LONG[i]}">${d}</button>`).join("")}</div>
      <div class="axis" aria-hidden="true"><span>00</span><span style="left:25%">06</span><span style="left:50%">12</span><span style="left:75%">18</span><span style="left:100%">24</span></div>
      <div class="rooms">${rooms
        .map((r, i) => `<div class="room" data-i="${i}" role="button" tabindex="0">
          <div class="head"><button class="shape" data-more="${i}"><ha-icon></ha-icon></button>
            <span class="txt"><span class="nm"><span class="n"></span><ha-icon class="link" icon="mdi:link-variant" hidden></ha-icon></span><span class="sc"></span></span>
            <button class="pill" hidden><ha-icon></ha-icon><span></span></button></div>
          <div class="bar"><div class="bk"></div><div class="now" hidden></div></div></div>`)
        .join("")}</div></ha-card>`;
    const card = root.querySelector("ha-card");
    card.addEventListener("click", (e) => this._click(e));
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("room")) {
        e.preventDefault();
        this._edit(Number(e.target.dataset.i));
      }
    });
    this._built = true;
    this._observe();
  }

  _observe() {
    const el = this.shadowRoot?.querySelector(".rooms");
    if (!el || typeof ResizeObserver === "undefined") return;
    this._ro = this._ro || new ResizeObserver(() => {
      const w = this.shadowRoot?.querySelector(".room .bar")?.getBoundingClientRect().width || 0;
      if (Math.abs(w - (this._barW || 0)) >= 1) {
        this._barW = w;
        this._render();
      }
    });
    this._ro.disconnect();
    this._ro.observe(el);
  }

  _click(e) {
    const t = e.target;
    const more = (id) => this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: id }, bubbles: true, composed: true }));
    const v = t.closest("[data-e]");
    if (v) return more(v.dataset.e);
    const shape = t.closest(".shape");
    if (shape) return more(this._config.rooms[Number(shape.dataset.more)].climate);
    const pill = t.closest(".pill");
    if (pill) return this._pill(Number(pill.closest(".room").dataset.i));
    const day = t.closest("[data-day]");
    if (day) {
      this._day = Number(day.dataset.day);
      return this._render();
    }
    const room = t.closest(".room");
    if (room) this._edit(Number(room.dataset.i));
  }

  /* The day on show: the one picked in the day strip, else today. */
  _viewDay(now) {
    return this._dayStrip && this._day !== undefined && this._day !== null ? this._day : now.dow;
  }

  _render() {
    if (!this._config || !this._hass) return;
    if (!this._built) this._build();
    const root = this.shadowRoot;
    const hass = this._hass;
    const set = (n, html) => {
      if (n && n._h !== html) {
        n.innerHTML = html;
        n._h = html;
      }
    };
    const attr = (n, k, v) => {
      if (v === null) {
        if (n.hasAttribute(k)) n.removeAttribute(k);
      } else if (n.getAttribute(k) !== v) n.setAttribute(k, v);
    };
    const now = zoned(this._now(), this._tz());
    const { rooms, schedules } = this._model();
    const ready = !!this._schedules;

    // The day strip shows when any room's day differs between days of the week.
    const differs = rooms.some((r) => {
      const progs = DAYS.map((_, d) => {
        const p = HeatingScheduleCard.cell(schedules, r.schedule, d).primary;
        return p ? JSON.stringify(p.rooms.get(r.schedule)) + p.enabled : "";
      });
      return progs.some((p) => p !== progs[0]);
    });
    this._dayStrip = ready && differs;
    const day = this._viewDay(now);
    const strip = root.querySelector(".days");
    if (strip.hidden !== !this._dayStrip) strip.hidden = !this._dayStrip;
    strip.querySelectorAll("button").forEach((b, i) => {
      attr(b, "aria-pressed", String(i === day));
      attr(b, "aria-current", i === now.dow ? "date" : null);
    });

    // Summary: the next change across the rooms.
    let sum = "";
    if (this._error) sum = esc(this._error);
    else if (!ready) sum = "Loading schedules…";
    else if (!schedules.length) sum = "No schedules yet – tap a room to make one";
    else {
      const nexts = rooms.map((r) => ({ r, n: this._next(schedules, r, now) })).filter((x) => x.n);
      if (!nexts.length) sum = this._dayStrip ? esc(daysLabel(bit(day))) : "Same every day";
      else {
        const abs = (n) => n.k * DAY_MIN + n.s;
        const first = Math.min(...nexts.map((x) => abs(x.n)));
        const at = nexts.filter((x) => abs(x.n) === first);
        const modes = new Set(at.map((x) => x.n.m));
        const when = this._when(at[0].n, now);
        if (modes.size > 1) sum = `Next change ${when}`;
        else {
          const mode = this._mode(at[0].n.m).name;
          const who =
            rooms.length === 1 ? "" : at.length === rooms.length ? "Every room" : at.length <= 2 ? listNames(at.map((x) => x.r.name)) : `${at.length} rooms`;
          sum = who ? `${esc(who)} to ${esc(mode)} ${when}` : `${esc(mode)} ${when}`;
        }
      }
    }
    set(root.querySelector(".status"), sum);
    root.querySelector(".lt").classList.toggle("one", !sum);

    const barW = this._barW || 0;
    rooms.forEach((room, i) => {
      const el = root.querySelectorAll(".room")[i];
      const st = hass.states[room.climate];
      const a = st?.attributes || {};
      const cell = HeatingScheduleCard.cell(schedules, room.schedule, day);
      const today = day === now.dow ? cell : HeatingScheduleCard.cell(schedules, room.schedule, now.dow);
      const prog = cell.primary ? cell.primary.rooms.get(room.schedule) : null;
      const shared = !!cell.primary && [...cell.primary.rooms.keys()].some((e) => e !== room.schedule);

      // Icon circle: the preset the room is in now, in that mode's colour.
      const live = st && LIVE(st.state);
      const off = !live || st.state === "off" || a.summer_mode_active;
      const preset = a.preset_mode;
      const color = off ? C.grey : colorOf(PRESET_COLORS[preset] || (preset ? "teal" : "grey"));
      const shape = el.querySelector(".shape");
      attr(shape, "style", `color:${color}`);
      attr(shape, "aria-label", `${room.name} thermostat`);
      attr(shape.querySelector("ha-icon"), "icon", room.icon);
      el.classList.toggle("heat", !!live && a.hvac_action === "heating");
      attr(el, "aria-label", `Edit ${room.name}'s schedule`);

      set(el.querySelector(".n"), esc(room.name));
      const link = el.querySelector(".link");
      if (link.hidden !== !shared) link.hidden = !shared;
      if (shared) {
        const others = rooms.filter((r) => r !== room && cell.primary.rooms.has(r.schedule)).map((r) => r.name);
        attr(link, "title", `Shares a schedule with ${listNames(others)}`);
      }

      // Status: temperature now → target, then what comes next or why the schedule isn't in charge.
      const cur = num(a.current_temperature);
      const target = num(a.temperature);
      const temp = live ? `<button class="v" data-e="${esc(room.climate)}">${deg(cur)}°${target !== null && st.state !== "off" ? ` → ${deg(target)}°` : ""}</button>` : "";
      let state = "";
      let pill = null;
      const tp = today.primary;
      const next = ready ? this._next(schedules, room, now) : null;
      if (!st) state = `${esc(room.climate)} not found`;
      else if (!live) state = "Unavailable";
      else if (a.summer_mode_active) state = "Summer · heating locked";
      else if (st.state === "off") state = "Heating off";
      else if (a.window_open_active) state = "Window open";
      else if (a.presence_away_active) state = "Away · nobody home";
      else if (a.schedule_override_active) {
        const name = PRESET_NAMES[preset] || (preset === undefined ? "Manual" : capital(preset));
        let until = "";
        const t = Date.parse(a.schedule_override_until ?? "");
        if (Number.isFinite(t)) until = ` until ${hm(zoned(t, this._tz()).min)}`;
        else if (!["away", "frost_protection"].includes(preset) && next) until = ` until ${hm(next.s)}`;
        state = `${esc(name)} by hand${until}`;
        if ((a.preset_modes || []).includes("schedule")) pill = { k: "resume", icon: "mdi:calendar-sync", label: "Resume" };
      } else if (!ready) state = "";
      else if (!tp) state = "No schedule today";
      else if (!tp.enabled) {
        state = "Schedule off";
        pill = { k: "on", icon: "mdi:calendar-check", label: "Turn on" };
      } else if (next) state = `${esc(this._mode(next.m).name)} ${this._when(next, now)}`;
      else {
        const m = modeAt(tp.rooms.get(room.schedule), now.min);
        state = m ? `${esc(this._mode(m).name)} all day` : "Nothing scheduled now";
      }
      const warn = ready && today.overlap ? `<span class="warn">${today.list.filter((s) => s.enabled).length} schedules overlap</span>` : "";
      set(el.querySelector(".sc"), join([temp, state, warn]));

      const p = el.querySelector(".pill");
      const pk = pill ? pill.k : "";
      if (p.hidden !== !pill) p.hidden = !pill;
      if (pill && p._k !== pk) {
        attr(p.querySelector("ha-icon"), "icon", pill.icon);
        p.querySelector("span").textContent = pill.label;
        p._k = pk;
      }
      attr(p, "aria-disabled", this._busy?.[i] ? "true" : null);

      // The day bar.
      const bar = el.querySelector(".bar");
      bar.classList.toggle("off", !!cell.primary && !cell.primary.enabled);
      set(bar.querySelector(".bk"), ready ? this._blocks(room, prog, barW) : "");
      const nowEl = bar.querySelector(".now");
      const showNow = day === now.dow;
      if (nowEl.hidden !== !showNow) nowEl.hidden = !showNow;
      attr(nowEl, "style", `left:${((now.min / DAY_MIN) * 100).toFixed(3)}%`);
    });

    inkSchedule(this, ".lt, .txt");
  }

  /* A programme's blocks, each labelled with what fits its width: icon, name and temperature;
     icon and temperature; temperature; icon; or nothing. */
  _blocks(room, prog, width, big = false) {
    if (!prog || !prog.length) return `<div class="b none" style="left:0;width:100%">${width >= 120 ? "No schedule" : ""}</div>`;
    const e = ends(prog);
    return prog
      .map((b, i) => {
        const frac = (e[i] - b.s) / DAY_MIN;
        const px = frac * width;
        const style = `left:${((b.s / DAY_MIN) * 100).toFixed(3)}%;width:${(frac * 100).toFixed(3)}%`;
        if (b.m === null) return `<div class="b none" style="${style}"></div>`;
        const mode = this._mode(b.m);
        const t = this._temp(room, b.m);
        const ts = t === null ? "" : `${deg(t)}°`;
        const icon = `<ha-icon icon="${esc(mode.icon)}"></ha-icon>`;
        const named = big ? 110 : 96;
        let label = "";
        if (px >= named) label = `${icon}${esc(mode.name)}${ts ? ` ${ts}` : ""}`;
        else if (px >= 44 && ts) label = `${icon}${ts}`;
        else if (px >= 28 && ts) label = ts;
        else if (px >= 18) label = icon;
        const grey = mode.color === colorOf("grey");
        const colors = grey ? `background:${NEUTRAL(0.08)};color:var(--secondary-text-color)` : `background:${tint(mode.color, 30)};color:${tx(mode.color, 45)}`;
        return `<div class="b" style="${style};${colors}" title="${esc(`${mode.name}${ts ? ` ${ts}` : ""} · ${hm(b.s)}–${hm(e[i])}`)}">${label}</div>`;
      })
      .join("");
  }

  async _pill(i) {
    const room = this._model().rooms[i];
    const now = zoned(this._now(), this._tz());
    const a = this._hass.states[room.climate]?.attributes || {};
    if (this._busy?.[i]) return;
    this._busy = { ...(this._busy || {}), [i]: true };
    this._render();
    try {
      if (a.schedule_override_active)
        await this._hass.callService("climate", "set_preset_mode", { entity_id: room.climate, preset_mode: "schedule" }, undefined, false);
      else {
        const p = HeatingScheduleCard.cell(this._model().schedules, room.schedule, now.dow).primary;
        if (p) await this._hass.callService("switch", "turn_on", { entity_id: p.entity }, undefined, false);
      }
    } catch (err) {
      this.dispatchEvent(new CustomEvent("hass-notification", {
        detail: { message: err?.message || `Couldn't ${a.schedule_override_active ? "resume the schedule" : "turn the schedule on"} for ${room.name}.` },
        bubbles: true, composed: true,
      }));
    } finally {
      this._busy = { ...this._busy, [i]: false };
      this._render();
    }
  }

  /* ----- Editor ----- */

  _edit(i) {
    if (this._sheet || !this._schedules) return;
    const { rooms, schedules } = this._model();
    const room = rooms[i];
    const now = zoned(this._now(), this._tz());
    const d = this._viewDay(now);
    const base = HeatingScheduleCard.cell(schedules, room.schedule, d).primary;
    const opts = Object.keys(room.options).length ? Object.keys(room.options) : Object.keys(MODES).filter((k) => k !== "eco");

    // The programme to start from: the room's on this day, gaps filled from the block before.
    let prog = base ? base.rooms.get(room.schedule).map((b) => ({ ...b })) : null;
    if (prog) {
      for (let k = 0; k < prog.length; k++) if (prog[k].m === null) prog[k].m = prog[k - 1]?.m ?? prog.find((b) => b.m !== null)?.m ?? null;
      prog = normProg(prog.filter((b) => b.m !== null));
    }
    if (!prog || !prog.length) {
      const cur = keyOf(this._hass.states[room.schedule]?.state);
      prog = [{ s: 0, m: opts.includes(cur) ? cur : opts[0] }];
    }

    // Rooms that share this schedule with the same times are edited together unless left out.
    const linked = base
      ? rooms.filter((r) => r.i !== i && base.rooms.has(r.schedule) && sameProg(base.rooms.get(r.schedule), base.rooms.get(room.schedule))).map((r) => r.i)
      : [];
    let covered = 0;
    for (const s of schedules) if (s.rooms.has(room.schedule)) covered |= s.mask;
    const startMask = base ? base.mask : covered ? ALL & ~covered : ALL;
    const group = (bit(d) & WORKDAYS ? WORKDAYS : WEEKEND);
    const masks = [];
    for (const m of [startMask, ALL, group, bit(d)]) if (m && !masks.includes(m)) masks.push(m);
    masks.sort((a, b) => bits(b) - bits(a));

    this._sheet = {
      i, d, base, baseProg: prog.map((b) => ({ ...b })), prog, opts, linked, sel: new Set([i, ...linked]), masks, mask: startMask,
      saving: false, error: "", dirty: false,
    };
    this._openSheet();
  }

  _openSheet() {
    const sh = this._sheet;
    const room = this._model().rooms[sh.i];
    const host = document.createElement("hsc-edit-sheet");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${SHEET_CSS}</style><div class="backdrop"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="${esc(room.name)} schedule">
        <div class="row"><div class="glyph" style="background:${tint(C.orange, 20)}"><ha-icon icon="${esc(room.icon)}" style="color:${C.orange}"></ha-icon></div>
          <div class="tt"><div class="title">${esc(room.name)}</div><div class="sub"></div></div></div>
        <div class="ebar"><div class="bar"><div class="bk"></div></div><div class="hs"></div></div>
        <div class="eaxis" aria-hidden="true"><span>00</span><span style="left:25%">06</span><span style="left:50%">12</span><span style="left:75%">18</span><span style="left:100%">24</span></div>
        <div class="blocks"></div>
        <button class="add"><ha-icon icon="mdi:plus"></ha-icon><span>Add a change</span></button>
        <div class="sec rooms-sec"><div class="k">Rooms</div><div class="chips"></div><div class="hint rooms-hint"></div></div>
        <div class="sec"><div class="k">Days</div><div class="seg dm" role="group" aria-label="Days"></div><div class="hint days-hint"></div></div>
        <div class="note"></div><div class="err" role="alert"></div>
        <div class="actions"><button class="act cancel dismiss"><span class="glyph"><ha-icon icon="mdi:close"></ha-icon></span>Cancel</button>
          <button class="act save"><span class="glyph"><ha-icon icon="mdi:check"></ha-icon></span>Save</button></div></div>`;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this._closeSheet();
      }
    };
    // A tap on the backdrop closes the sheet only while nothing has changed: edits are never lost
    // to a stray tap. Cancel and Escape always close.
    root.querySelector(".backdrop").addEventListener("click", () => !this._sheet?.dirty && this._closeSheet());
    root.querySelector(".dialog").addEventListener("click", (e) => this._sheetClick(e));
    const ebar = root.querySelector(".ebar");
    ebar.addEventListener("pointerdown", (e) => this._dragStart(e));
    ebar.addEventListener("pointermove", (e) => this._dragMove(e));
    ebar.addEventListener("pointerup", (e) => this._dragEnd(e));
    ebar.addEventListener("pointercancel", (e) => this._dragEnd(e));
    ebar.addEventListener("keydown", (e) => this._handleKey(e));
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(host);
    sh.host = host;
    sh.root = root;
    sh.onKey = onKey;
    if (typeof ResizeObserver !== "undefined") {
      sh.ro = new ResizeObserver(() => this._paintSheet());
      sh.ro.observe(ebar);
    }
    this._paintSheet();
    // Focus for the keyboard, without scrolling: on a phone the sheet is taller than the screen,
    // and scrolling Cancel into view would open it at the bottom with the room's name hidden.
    root.querySelector(".cancel").focus({ preventScroll: true });
    root.querySelector(".dialog").scrollTop = 0;
  }

  _closeSheet() {
    const sh = this._sheet;
    if (!sh) return;
    document.removeEventListener("keydown", sh.onKey, true);
    sh.ro?.disconnect();
    sh.host?.remove();
    this._sheet = null;
  }

  _paintSheet() {
    const sh = this._sheet;
    if (!sh?.root) return;
    const root = sh.root;
    const { rooms, schedules } = this._model();
    const room = rooms[sh.i];
    const set = (n, html) => {
      if (n && n._h !== html) {
        n.innerHTML = html;
        n._h = html;
      }
    };
    const prog = sh.prog;
    const e = ends(prog);
    root.querySelector(".sub").textContent = daysLabel(sh.mask);

    const w = root.querySelector(".ebar .bar").getBoundingClientRect().width || 0;
    set(root.querySelector(".ebar .bk"), this._blocks(room, prog, w, true));
    const hs = root.querySelector(".hs");
    const handles = prog
      .slice(1)
      .map((b, k) => `<button class="h${sh.drag === k + 1 ? " drag" : ""}" data-h="${k + 1}" role="slider" aria-label="Change at ${hm(b.s)}" aria-valuemin="0" aria-valuemax="${DAY_MIN}" aria-valuenow="${b.s}" aria-valuetext="${hm(b.s)}" style="left:${((b.s / DAY_MIN) * 100).toFixed(3)}%"></button>`)
      .join("");
    const focused = root.activeElement?.dataset?.h;
    if (hs._h !== handles) {
      hs.innerHTML = handles;
      hs._h = handles;
      if (focused) root.querySelector(`.h[data-h="${focused}"]`)?.focus();
    }

    set(
      root.querySelector(".blocks"),
      prog
        .map((b, k) => {
          const segs = sh.opts
            .map((o) => {
              const m = this._mode(o);
              return `<button data-b="${k}" data-mode="${esc(o)}" aria-pressed="${b.m === o}"><ha-icon icon="${esc(m.icon)}" style="color:${m.color}"></ha-icon>${esc(m.name)}</button>`;
            })
            .join("");
          return `<div class="blk"><div class="tm">
              <button class="step${k ? "" : " first"}" data-b="${k}" data-step="-${STEP}" aria-label="Earlier"${k ? "" : ' tabindex="-1" aria-hidden="true"'}><ha-icon icon="mdi:chevron-left"></ha-icon></button>
              <span class="t">${hm(b.s)}</span>
              <button class="step${k ? "" : " first"}" data-b="${k}" data-step="${STEP}" aria-label="Later"${k ? "" : ' tabindex="-1" aria-hidden="true"'}><ha-icon icon="mdi:chevron-right"></ha-icon></button>
              <span class="to">– ${hm(e[k])}</span>
              ${prog.length > 1 ? `<button class="del" data-del="${k}" aria-label="Remove the change at ${hm(b.s)}"><ha-icon icon="mdi:trash-can-outline"></ha-icon></button>` : ""}
            </div><div class="seg" role="group" aria-label="Mode from ${hm(b.s)}">${segs}</div></div>`;
        })
        .join(""),
    );

    // Rooms: this room always; rooms sharing the schedule picked; others to copy the times to.
    set(
      root.querySelector(".chips"),
      rooms
        .map((r) => `<button class="chip" data-room="${r.i}" aria-pressed="${sh.sel.has(r.i)}"${r.i === sh.i ? ' aria-disabled="true"' : ""}><ha-icon icon="${esc(r.icon)}"></ha-icon>${esc(r.name)}</button>`)
        .join(""),
    );
    root.querySelector(".rooms-sec").hidden = rooms.length < 2;
    const left = sh.linked.filter((k) => !sh.sel.has(k)).map((k) => rooms[k].name);
    const added = [...sh.sel].filter((k) => k !== sh.i && !sh.linked.includes(k)).map((k) => rooms[k].name);
    const hint = [];
    if (left.length) hint.push(`${listNames(left)} ${left.length > 1 ? "keep their" : "keeps its"} current times.`);
    if (added.length) hint.push(`${listNames(added)} ${added.length > 1 ? "get" : "gets"} these times too.`);
    if (!left.length && !added.length && sh.linked.length) hint.push("These rooms share a schedule. Leave one out to give it its own times.");
    set(root.querySelector(".rooms-hint"), esc(hint.join(" ")));

    set(
      root.querySelector(".dm"),
      sh.masks
        .map((m) => `<button data-mask="${m}" aria-pressed="${m === sh.mask}">${esc(bits(m) === 1 ? `${DAY_LONG[DAYS.findIndex((_, k) => (m >> k) & 1)]} only` : daysLabel(m))}</button>`)
        .join(""),
    );
    let dh = "";
    if (sh.base && (sh.mask & sh.base.mask) === sh.mask && sh.mask !== sh.base.mask) {
      const rest = sh.base.mask & ~sh.mask;
      dh = `${daysLabel(rest)} ${bits(rest) > 1 ? "keep" : "keeps"} the current times.`;
    } else {
      let others = 0;
      for (const s of schedules) if (s !== sh.base && [...sh.sel].some((k) => s.rooms.has(rooms[k].schedule))) others |= s.mask;
      const over = others & sh.mask;
      if (over) dh = `Replaces the current times ${onDays(over)}.`;
    }
    set(root.querySelector(".days-hint"), esc(dh));

    // What saving will do that the editor doesn't show.
    const affected = schedules.filter((s) => (s.mask & sh.mask) && [...sh.sel].some((k) => s.rooms.has(rooms[k].schedule)));
    const notes = [];
    if (affected.some((s) => !s.plain)) notes.push("A schedule here has conditions, sunrise or sunset times, or dates; saving replaces them with the times above.");
    if (affected.some((s) => !s.enabled)) notes.push("A schedule here is switched off; saving switches it on.");
    set(root.querySelector(".note"), esc(notes.join(" ")));
    set(root.querySelector(".err"), esc(sh.error));
    const save = root.querySelector(".save");
    const busy = sh.saving ? "true" : null;
    if (save.getAttribute("aria-disabled") !== busy) busy ? save.setAttribute("aria-disabled", busy) : save.removeAttribute("aria-disabled");
    const lbl = sh.saving ? "Saving…" : "Save";
    if (save.lastChild.textContent !== lbl) save.lastChild.textContent = lbl;
  }

  _changed() {
    const sh = this._sheet;
    sh.dirty = true;
    sh.error = "";
    this._paintSheet();
  }

  _sheetClick(e) {
    const sh = this._sheet;
    if (!sh) return;
    const t = e.target;
    if (t.closest(".cancel")) return this._closeSheet();
    if (t.closest(".save")) return this._save();
    if (sh.saving) return;
    const step = t.closest("[data-step]");
    if (step) {
      const k = Number(step.dataset.b);
      if (k > 0) this._moveBoundary(k, sh.prog[k].s + Number(step.dataset.step));
      return;
    }
    const seg = t.closest("[data-mode]");
    if (seg) {
      sh.prog[Number(seg.dataset.b)].m = seg.dataset.mode;
      return this._changed();
    }
    const del = t.closest("[data-del]");
    if (del) {
      const k = Number(del.dataset.del);
      if (sh.prog.length < 2) return;
      sh.prog.splice(k, 1);
      sh.prog[0].s = 0; // removing the first block: the next one starts the day
      return this._changed();
    }
    if (t.closest(".add")) return this._addChange();
    const chip = t.closest("[data-room]");
    if (chip) {
      const k = Number(chip.dataset.room);
      if (k === sh.i) return;
      if (sh.sel.has(k)) sh.sel.delete(k);
      else sh.sel.add(k);
      return this._changed();
    }
    const dm = t.closest("[data-mask]");
    if (dm) {
      sh.mask = Number(dm.dataset.mask);
      return this._changed();
    }
  }

  /* Split the longest block in the middle (on a quarter hour) with another mode. */
  _addChange() {
    const sh = this._sheet;
    const e = ends(sh.prog);
    let k = 0;
    sh.prog.forEach((b, j) => {
      if (e[j] - b.s > e[k] - sh.prog[k].s) k = j;
    });
    const len = e[k] - sh.prog[k].s;
    if (len < 2 * STEP) return;
    const mid = Math.min(e[k] - STEP, Math.max(sh.prog[k].s + STEP, Math.round((sh.prog[k].s + len / 2) / STEP) * STEP));
    const cur = sh.prog[k].m;
    const alt = sh.opts.find((o) => o !== cur && keyOf(o) === (cur === "comfort" ? "night" : "comfort")) || sh.opts.find((o) => o !== cur) || cur;
    sh.prog.splice(k + 1, 0, { s: mid, m: alt });
    this._changed();
  }

  /* Move the change at the start of block k, kept a quarter hour clear of its neighbours. */
  _moveBoundary(k, min) {
    const sh = this._sheet;
    const lo = sh.prog[k - 1].s + STEP;
    const hi = (k + 1 < sh.prog.length ? sh.prog[k + 1].s : DAY_MIN) - STEP;
    const v = Math.max(lo, Math.min(hi, Math.round(min / STEP) * STEP));
    if (v === sh.prog[k].s) return;
    sh.prog[k].s = v;
    this._changed();
  }

  _dragStart(e) {
    const sh = this._sheet;
    const h = e.target.closest?.("[data-h]");
    if (!sh || sh.saving || !h || (e.button !== undefined && e.button !== 0)) return;
    e.preventDefault();
    sh.drag = Number(h.dataset.h);
    const ebar = sh.root.querySelector(".ebar");
    try {
      ebar.setPointerCapture?.(e.pointerId);
    } catch (err) {
      /* synthetic event without a pointer */
    }
    this._paintSheet();
  }

  _dragMove(e) {
    const sh = this._sheet;
    if (!sh || !sh.drag) return;
    const r = sh.root.querySelector(".ebar .bar").getBoundingClientRect();
    if (!r.width) return;
    this._moveBoundary(sh.drag, ((e.clientX - r.left) / r.width) * DAY_MIN);
  }

  _dragEnd() {
    const sh = this._sheet;
    if (!sh || !sh.drag) return;
    sh.drag = null;
    this._paintSheet();
  }

  /* Dividers are sliders: arrows move them a quarter hour. */
  _handleKey(e) {
    const sh = this._sheet;
    const h = e.target.closest?.("[data-h]");
    if (!sh || !h) return;
    const d = { ArrowLeft: -STEP, ArrowDown: -STEP, ArrowRight: STEP, ArrowUp: STEP, PageDown: -60, PageUp: 60 }[e.key];
    if (!d) return;
    e.preventDefault();
    const k = Number(h.dataset.h);
    this._moveBoundary(k, sh.prog[k].s + d);
  }

  async _save() {
    const sh = this._sheet;
    if (!sh || sh.saving) return;
    const { rooms, schedules } = this._model();
    const prog = normProg(sh.prog);
    const targets = [...sh.sel].map((k) => rooms[k]);
    for (const r of targets) {
      const missing = prog.find((b) => Object.keys(r.options).length && !(b.m in r.options));
      if (missing) {
        sh.error = `${r.name}'s schedule helper has no "${missing.m}" option, so it can't take these times.`;
        return this._paintSheet();
      }
    }
    const ops = planSave(schedules, rooms, new Set(targets.map((r) => r.schedule)), sh.mask, prog);
    if (!ops.length) return this._closeSheet();
    sh.saving = true;
    sh.error = "";
    this._paintSheet();
    try {
      for (const op of ops) await this._hass.callService(op.domain, op.service, op.data, undefined, false);
      if (this._sheet === sh) this._closeSheet();
    } catch (err) {
      if (this._sheet === sh) {
        sh.saving = false;
        sh.error = err?.message ? `Couldn't save: ${err.message}` : "Couldn't save the schedule.";
        this._paintSheet();
      }
    } finally {
      this._fetch();
    }
  }
}

HeatingScheduleCard.plan = planSave;
HeatingScheduleCard.parse = parseSchedule;
HeatingScheduleCard.daysLabel = daysLabel;

async function registerHeatingScheduleCard() {
  await window.customElements.whenDefined("home-assistant");
  if (window.customElements.get(HSC_TAG)) return;
  window.customElements.define(HSC_TAG, HeatingScheduleCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: HSC_TAG,
    name: "Heating schedule",
    description: "Every room's heating day as a bar, with now, what's next and Resume; tap a room to change its times, rooms and days (Scheduler integration).",
  });
  console.info(`%c HEATING-SCHEDULE-CARD %c ${HSC_VERSION} `, "background:#ff9800;color:#fff", "");
}

registerHeatingScheduleCard();
