// Behaviour test for home-status-card (runs the real card in jsdom). Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const assert = require("assert");
const src = fs.readFileSync(require("path").join(__dirname, "..", "cards", "home-status-card", "home-status-card.js"), "utf8");
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ha.local/lovelace/0" });
const { window } = dom;
window.eval(src);
window.customElements.define("home-assistant", class extends window.HTMLElement {});
const { document } = window;
const tick = () => new Promise((r) => setTimeout(r, 0));

const pad = (n) => String(n).padStart(2, "0");
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
const calls = [];
function hass(over = {}) {
  const base = {
    "input_text.occ": "People detected in the Ground floor - LivingRoom.",
    "input_text.last": "Ground floor - Kitchen",
    "input_datetime.seen": local(new Date(Date.now() - 20 * 60000)),
    "input_boolean.alarm": "on",
    "sensor.door": "door_closed",
    "binary_sensor.tv": "on",
    "sensor.temp": "25.09",
    "input_text.ac": "AC Off",
    "sensor.epaper": " ",
  };
  const states = {};
  for (const [k, v] of Object.entries({ ...base, ...over })) states[k] = { entity_id: k, state: v, attributes: {} };
  return { states, callService: async (...a) => calls.push(a) };
}
const cfg = {
  name: "Greece",
  presence: { occupied: "input_text.occ", last_room: "input_text.last", last_seen: "input_datetime.seen", navigation_path: "/dashboard-cctv/0" },
  alarm: "input_boolean.alarm",
  door: "sensor.door",
  tv: { entity: "binary_sensor.tv", navigation_path: "/lovelace/greece-tv" },
  climate: { temperature: "sensor.temp", state: "input_text.ac", navigation_path: "/lovelace/greece-climate" },
  message: "sensor.epaper",
};

(async () => {
  await tick();
  assert(window.customElements.get("home-status-card"), "defined after home-assistant");
  // Visual editor schema: every option the card reads is editable.
  const Card = window.customElements.get("home-status-card");
  const form = Card.getConfigForm();
  const names = JSON.stringify(form.schema);
  for (const k of ["name", "presence", "occupied", "last_room", "last_seen", "alarm", "door", "tv", "climate", "temperature", "state", "message", "navigation_path"])
    assert(names.includes(`"name":"${k}"`), `editor field ${k}`);
  assert.strictEqual(form.computeLabel({ name: "alarm" }), "Alarm switch");

  const card = document.createElement("home-status-card");
  document.body.appendChild(card);
  card.setConfig(cfg);
  card.hass = hass();
  const r = card.shadowRoot;
  const txt = (s) => r.querySelector(s).textContent.trim();

  // Presence text exactly as stored; green when occupied (someone home, like Home Assistant).
  assert.strictEqual(txt(".detail"), "People detected in the Ground floor - LivingRoom.");
  assert(r.querySelector(".shape ha-icon").style.color.includes("--green-color"));
  assert(r.querySelector(".shape").style.backgroundColor.includes("20%"), "icon circle tint 20%");
  // Name · state: the dot stays with the name, the state word never splits.
  assert(r.querySelector(".name").innerHTML.includes("Greece<span class=\"state\">&nbsp;· <span class=\"w\">Occupied</span>"), r.querySelector(".name").innerHTML);
  // Empty: orange within the hour, red after; old-chip wording.
  card.hass = hass({ "input_text.occ": "" });
  assert(r.querySelector(".shape ha-icon").style.color.includes("--orange-color"));
  assert(/^A person was last seen in the Ground floor - Kitchen today at \d\d:\d\d$/.test(txt(".detail")), txt(".detail"));
  card.hass = hass({ "input_text.occ": "", "input_datetime.seen": local(new Date(Date.now() - 3 * 3600000)) });
  assert(r.querySelector(".shape ha-icon").style.color.includes("--red-color"));

  // Tiles: each label names its object ("Door closed", like "TV on").
  const labels = [...r.querySelectorAll(".tile span")].map((s) => s.textContent);
  assert.strictEqual(JSON.stringify(labels), JSON.stringify(["Door closed", "TV on", "25.1° · Off"]));

  // ePaper always visible; placeholder when blank, quoted text otherwise.
  assert.notStrictEqual(r.querySelector(".msg").style.display, "none");
  assert.strictEqual(txt(".msg span"), "ePaper screen is blank");
  card.hass = hass({ "sensor.epaper": "Back on Sunday" });
  assert.strictEqual(txt(".msg span"), "“Back on Sunday”");

  // Tap targets.
  const more = [];
  const navs = [];
  card.addEventListener("hass-more-info", (e) => more.push(e.detail.entityId));
  window.addEventListener("location-changed", () => navs.push(window.location.pathname));
  const tile = (k) => r.querySelector(`.tile[data-key="${k}"]`);
  tile("door").click();
  tile("tv").click();
  tile("climate").click();
  r.querySelector(".msg").click();
  r.querySelector(".name").click();
  await tick();
  assert.strictEqual(JSON.stringify(more), JSON.stringify(["sensor.door", "sensor.epaper"]));
  assert.strictEqual(JSON.stringify(navs), JSON.stringify(["/lovelace/greece-tv", "/lovelace/greece-climate", "/dashboard-cctv/0"]));

  // Alarm: dialog first; Cancel = no call; Confirm = turn_off (it is armed).
  r.querySelector(".alarm").click();
  let dlg = document.querySelector("hsc-confirm-dialog");
  assert(dlg, "dialog opened");
  assert.strictEqual(dlg.shadowRoot.querySelector(".title").textContent, "Disarm alarm");
  // Reference layout: one glyph (the title's), the text under the title, a rule above the
  // buttons; no second glyph, no home-name line, and the text doesn't name the home again.
  const ds = dlg.shadowRoot;
  assert(ds.querySelector(".text").textContent.includes("CCTV alarm system"));
  assert(!ds.textContent.includes("Greece"), "no home name in the dialog");
  assert(!ds.querySelector(".body, .primary, .secondary"), "no subject row");
  assert.strictEqual(ds.querySelectorAll(".dialog > .row").length, 1);
  assert.strictEqual(ds.querySelectorAll(".row .glyph ha-icon").length, 1, "no second glyph");
  assert(/\.buttons \{[^}]*border-top: 1px solid/.test(ds.querySelector("style").textContent), "1px rule above the buttons");
  assert.strictEqual(ds.querySelector(".confirm").textContent.trim(), "Disarm");
  // Red both ways: the Armed chip's colour.
  assert(ds.querySelector(".confirm").getAttribute("style").includes("--red-color"), "disarm dialog red");
  dlg.shadowRoot.querySelector(".cancel").click();
  await tick();
  assert.strictEqual(calls.length, 0);
  r.querySelector(".alarm").click();
  document.querySelector("hsc-confirm-dialog").shadowRoot.querySelector(".confirm").click();
  await tick();
  assert.strictEqual(JSON.stringify(calls.pop()), JSON.stringify(["input_boolean", "turn_off", { entity_id: "input_boolean.alarm" }]));
  // Arming: red too, and the same structure.
  card.hass = hass({ "input_boolean.alarm": "off" });
  assert.strictEqual(txt(".alarm .txt"), "Disarmed");
  r.querySelector(".alarm").click();
  dlg = document.querySelector("hsc-confirm-dialog");
  assert.strictEqual(dlg.shadowRoot.querySelector(".title").textContent, "Arm alarm");
  assert(dlg.shadowRoot.querySelector(".confirm").getAttribute("style").includes("--red-color"), "arm dialog red");
  assert(!dlg.shadowRoot.textContent.includes("Greece"));
  // A failed change: Home Assistant's message, else "Couldn't change the alarm."
  const toasts = [];
  card.addEventListener("hass-notification", (e) => toasts.push(e.detail.message));
  card.hass = { ...hass({ "input_boolean.alarm": "off" }), callService: async () => { throw {}; } };
  dlg.shadowRoot.querySelector(".confirm").click();
  await tick();
  assert.strictEqual(JSON.stringify(toasts), JSON.stringify(["Couldn't change the alarm."]));
  card.hass = hass();
  assert.strictEqual(txt(".alarm .txt"), "Armed");

  // Presence circle is a button: Enter / Space open the presence target.
  navs.length = 0;
  r.querySelector(".shape.who").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  r.querySelector(".shape.who").dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true }));
  await tick();
  assert.strictEqual(JSON.stringify(navs), JSON.stringify(["/dashboard-cctv/0", "/dashboard-cctv/0"]));

  // Unknown states read "–" and keep their object's name.
  card.hass = hass({ "sensor.door": "unavailable", "binary_sensor.tv": "unknown", "input_boolean.alarm": "unavailable" });
  assert.strictEqual(tile("door").querySelector("span").textContent, "Door –");
  assert.strictEqual(tile("tv").querySelector("span").textContent, "TV –");
  assert.strictEqual(txt(".alarm .txt"), "Alarm –");

  // Door open turns red; cooling turns blue – as "on" pills: tint 18%, label mixed 70%.
  card.hass = hass({ "sensor.door": "door_open", "input_text.ac": "AC Cooling 25C" });
  assert.strictEqual(tile("door").querySelector("span").textContent, "Door open");
  assert(tile("door").style.backgroundColor.includes("--red-color") && tile("door").style.backgroundColor.includes(" 18%"));
  assert(tile("door").style.color.includes("--red-color") && tile("door").style.color.includes("70%, var(--primary-text-color)"));
  assert(tile("climate").style.backgroundColor.includes("--blue-color"));
  assert.strictEqual(tile("climate").querySelector("span").textContent, "25.1° · Cool");
  card.hass = hass({ "input_text.ac": "AC Heating 21C" });
  assert(tile("climate").style.backgroundColor.includes("--red-color"), "heating stays red");
  assert(!tile("door").style.backgroundColor, "closed door: neutral");

  // Text and colour rules (design tokens): nothing clipped, flex button row, armed chip as an
  // "on" pill, tile gap 8px, the alarm word never hidden on a narrow card, press .92.
  const css = r.querySelector("style").textContent;
  assert(!/text-overflow:\s*ellipsis|line-clamp/.test(css), "no clipped text");
  assert(/\.tiles \{ display: flex; flex-wrap: wrap; gap: 8px; \}/.test(css), "flex row, 8px gap");
  assert(/\.tile \{[^}]*flex: 1 1 0; min-width: max-content;/.test(css), "a label keeps its width");
  assert(/\.alarm\.on \{ background: color-mix\(in srgb, var\(--red-color, #f44336\) 18%, transparent\); color: color-mix\(in srgb, var\(--red-color, #f44336\) 70%, var\(--primary-text-color\)\)/.test(css), "armed = on pill");
  assert(!/\.alarm \.txt \{ display: none/.test(css), "the alarm word always shows");
  assert(/\.detail \{[^}]*line-height: 16px;[^}]*secondary-text-color/.test(css));
  assert(/\.name \{[^}]*line-height: 20px/.test(css));
  assert(/\.shape\.who:focus-visible/.test(css));
  assert(/brightness\(\.92\)/.test(css) && !/brightness\(\.9\)/.test(css));

  console.log("ALL HOME-STATUS TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
