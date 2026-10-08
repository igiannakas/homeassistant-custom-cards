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
  const card = document.createElement("home-status-card");
  document.body.appendChild(card);
  card.setConfig(cfg);
  card.hass = hass();
  const r = card.shadowRoot;
  const txt = (s) => r.querySelector(s).textContent.trim();

  // Presence text exactly as stored; teal when occupied.
  assert.strictEqual(txt(".detail"), "People detected in the Ground floor - LivingRoom.");
  assert(r.querySelector(".shape ha-icon").style.color.includes("--teal-color"));
  // Empty: orange within the hour, red after; old-chip wording.
  card.hass = hass({ "input_text.occ": "" });
  assert(r.querySelector(".shape ha-icon").style.color.includes("--orange-color"));
  assert(/^A person was last seen in the Ground floor - Kitchen today at \d\d:\d\d$/.test(txt(".detail")), txt(".detail"));
  card.hass = hass({ "input_text.occ": "", "input_datetime.seen": local(new Date(Date.now() - 3 * 3600000)) });
  assert(r.querySelector(".shape ha-icon").style.color.includes("--red-color"));

  // Tiles.
  const labels = [...r.querySelectorAll(".tile span")].map((s) => s.textContent);
  assert.strictEqual(JSON.stringify(labels), JSON.stringify(["Closed", "TV on", "25.1° · Off"]));

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
  assert(dlg.shadowRoot.querySelector(".secondary").textContent.includes("CCTV alarm system"));
  dlg.shadowRoot.querySelector(".cancel").click();
  await tick();
  assert.strictEqual(calls.length, 0);
  r.querySelector(".alarm").click();
  document.querySelector("hsc-confirm-dialog").shadowRoot.querySelector(".confirm").click();
  await tick();
  assert.strictEqual(JSON.stringify(calls.pop()), JSON.stringify(["input_boolean", "turn_off", { entity_id: "input_boolean.alarm" }]));

  // Door open turns red; cooling turns blue.
  card.hass = hass({ "sensor.door": "door_open", "input_text.ac": "AC Cooling 25C" });
  assert(tile("door").style.backgroundColor.includes("--red-color"));
  assert(tile("climate").style.backgroundColor.includes("--blue-color"));
  assert.strictEqual(tile("climate").querySelector("span").textContent, "25.1° · Cool");

  console.log("ALL HOME-STATUS TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
