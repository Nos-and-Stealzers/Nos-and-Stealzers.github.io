"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

test("large catalogue favorites use membership indexing and preserve catalogue order", () => {
  const games = Array.from({length: 4000}, (_, i) => ({id: "game-" + i, title: "Game " + i, category: "arcade", source: "games/" + i + ".html", embed: "allowed"}));
  const favorites = games.filter((_, i) => i % 2 === 0).map(g => g.id);
  // An array scan inside each game's predicate makes this operation quadratic.
  favorites.indexOf = () => { throw new Error("favorite filtering must use indexed membership"); };
  const window = {
    GAME_CATALOG: games,
    SITE: {categories: {arcade: {label: "Arcade"}, other: {label: "Other"}}},
    Store: {favorites: () => favorites}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/features/catalog.js"), "utf8"), {window});
  const found = window.Catalog.filter({favoritesOnly: true});
  assert.equal(found.length, 2000);
  assert.equal(found[0].id, "game-0");
  assert.equal(found[found.length - 1].id, "game-3998");
  assert.equal(window.Catalog.all.length, 4000);
});
