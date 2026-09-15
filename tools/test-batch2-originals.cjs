const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "games", "originals");
const targets = ["nonogram", "light-cycles", "peg-solitaire", "same-game"];

function run(name) {
  const html = fs.readFileSync(path.join(dir, name + ".html"), "utf8");
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://arcadecampushub.online/",
    beforeParse(win) {
      win.requestAnimationFrame = () => 0;
      win.cancelAnimationFrame = () => {};
      // minimal canvas 2d stub
      win.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => ({}) });
      win.onerror = (msg) => errors.push(String(msg));
    },
  });
  const win = dom.window, doc = win.document;

  function fire(el, type, opts) {
    if (!el) return;
    const evt = new win.Event(type, Object.assign({ bubbles: true, cancelable: true }, opts || {}));
    try { el.dispatchEvent(evt); } catch (e) { errors.push(type + ": " + e.message); }
  }
  function key(code) {
    win.dispatchEvent(new win.KeyboardEvent("keydown", { key: code, code, bubbles: true }));
  }

  const checks = {};
  try {
    if (name === "nonogram") {
      checks.cells = doc.querySelectorAll("#wrap .cell").length; // 25
      checks.clues = doc.querySelectorAll("#wrap .clue").length; // 10
      doc.querySelectorAll("#wrap .cell").forEach((c, i) => { if (i < 6) fire(c, "click"); });
      fire(doc.getElementById("mode"), "click");
      fire(doc.querySelector("#wrap .cell"), "click");
      fire(doc.getElementById("new"), "click");
    } else if (name === "light-cycles") {
      checks.canvas = !!doc.getElementById("c");
      key("ArrowUp"); key("ArrowLeft"); key(" ");
      fire(doc.getElementById("start"), "click");
      fire(doc.getElementById("pause"), "click");
    } else if (name === "peg-solitaire") {
      checks.pegs = doc.querySelectorAll("#board .hole.peg").length; // 32
      checks.holes = doc.querySelectorAll("#board .hole").length;    // 49
      const peg = doc.querySelector("#board .hole.peg");
      fire(peg, "click");
      const tgt = doc.querySelector("#board .hole.target");
      if (tgt) fire(tgt, "click");
      fire(doc.getElementById("undo"), "click");
      fire(doc.getElementById("new"), "click");
    } else if (name === "same-game") {
      checks.cells = doc.querySelectorAll("#board .cell.tap").length; // up to 120
      const cell = doc.querySelector("#board .cell.tap");
      fire(cell, "mouseenter");
      fire(cell, "mouseleave");
      fire(cell, "click");
      fire(doc.getElementById("new"), "click");
    }
  } catch (e) {
    errors.push("exec: " + e.message);
  }
  return { name, errors, checks };
}

let ok = true;
for (const t of targets) {
  const r = run(t);
  const status = r.errors.length ? "FAIL" : "PASS";
  if (r.errors.length) ok = false;
  console.log(`[${status}] ${r.name}  ${JSON.stringify(r.checks)}` + (r.errors.length ? "  ERR=" + JSON.stringify(r.errors) : ""));
}
console.log(ok ? "\nALL GAMES PASSED" : "\nSOME GAMES FAILED");
process.exit(ok ? 0 : 1);
