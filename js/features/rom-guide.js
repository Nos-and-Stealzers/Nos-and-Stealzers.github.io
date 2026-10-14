/* Step-by-step help for the emulator entries: what file to get, how to
   patch a ROM hack onto it, and what to do when it won't run. Shown under
   the player on play.html for catalog entries with a `romGuide` field. */
(function () {
  "use strict";

  var SYSTEMS = [
    ["NES / Famicom", ".nes, .fds", "No"],
    ["Super Nintendo", ".sfc, .smc", "No"],
    ["Game Boy / Color", ".gb, .gbc", "No"],
    ["Game Boy Advance", ".gba", "Optional (gba_bios.bin)"],
    ["Nintendo DS", ".nds", "No"],
    ["Nintendo 64", ".z64, .n64, .v64", "No"],
    ["Genesis / Mega Drive", ".md, .gen, .smd, .bin", "No"],
    ["Master System / Game Gear", ".sms, .gg", "No"],
    ["Sega CD", ".cue + .bin (zipped), .chd", "Yes (bios_CD_U.bin etc.)"],
    ["PlayStation", ".cue + .bin (zipped), .chd, .pbp", "Optional (scph5501.bin)"],
    ["PC Engine / TurboGrafx", ".pce", "No"],
    ["Atari 2600 / 7800 / Lynx", ".a26, .a78, .lnx", "Lynx only (lynxboot.img)"],
    ["Arcade (FinalBurn Neo)", "romset .zip (exact name)", "Some (neogeo.zip)"]
  ];

  var COMMON = {
    get: {
      title: "1. Get a ROM file",
      body: [
        "A ROM is a copy of a game cartridge or disc as a file. For copyright reasons none are included here, and the site can't point you to copies of games you don't own.",
        "<b>Your own games:</b> copy (\"dump\") the cartridges you own with a cartridge reader such as the GB Operator, Retrode or Open Source Cartridge Reader. DS and 3DS games can be dumped on a modded console with GodMode9. PlayStation discs can be ripped on a PC as .bin/.cue or .chd.",
        "<b>Free, legal games:</b> lots of new homebrew games are free to download, for example from <a href=\"https://hh.gbdev.io/\" target=\"_blank\" rel=\"noopener\">Homebrew Hub</a> (Game Boy), <a href=\"https://pdroms.de/\" target=\"_blank\" rel=\"noopener\">PDRoms</a> and itch.io (search \"NES ROM\", \"GBA homebrew\").",
        "Keep the file as it is. Don't rename the extension: the player uses it to pick the right system."
      ]
    },
    systems: {
      title: "2. Which files work",
      table: true
    },
    hack: {
      title: "3. ROM hacks",
      body: [
        "A ROM hack (fan translation, Pokémon hack, Kaizo Mario...) usually comes as a <b>patch file</b>, not a game: <code>.ips</code>, <code>.ups</code>, <code>.bps</code>, or sometimes <code>.xdelta</code>. You apply it to the original game to make the hacked ROM.",
        "<b>Use the exact base ROM the hack names.</b> Its readme says which, for example \"Pokémon FireRed (USA) v1.0\" or \"Super Mario World (USA)\", often with a CRC32 or SHA-1 checksum. A different region or revision (Rev 1, Europe) usually breaks the hack: black screen, crash after the title, or garbled text.",
        "In the <b>ROM Player</b>, pick the ROM, then pick the patch. UPS and BPS patches are checked against the base ROM, and you're told if it's the wrong one. The ROM's CRC32 is shown so you can compare it with the readme. SNES ROMs with a 512-byte copier header are fixed automatically.",
        "Patch the plain ROM, not a .zip: unzip it first. For <code>.xdelta</code> and <code>.ppf</code> patches, use <a href=\"https://www.marcrobledo.com/RomPatcher.js/\" target=\"_blank\" rel=\"noopener\">Rom Patcher JS</a>, then load the patched file. \"Download patched ROM\" saves the result so you don't have to patch it again."
      ]
    },
    saves: {
      title: "4. Saving",
      body: [
        "<b>In-game saves</b> (the game's own save menu) are kept in this browser. The ROM Player writes them out every 30 seconds and when you leave the game.",
        "<b>Save states</b> (the emulator's menu, bottom bar) snapshot the exact moment. They're kept in this browser.",
        "Press the site's <b>Save</b> button to copy them to your account so they follow you to another device. To play there, load the same ROM file (same name, same patch): saves are matched to the ROM's name."
      ]
    },
    trouble: {
      title: "5. If it doesn't work",
      body: [
        "<b>Black screen or \"failed to start\":</b> wrong system picked, or the file is damaged. Check the file's extension and size.",
        "<b>Sega CD / Lynx won't boot:</b> they need a BIOS file (step 4 in the ROM Player).",
        "<b>PlayStation game with several files:</b> put the .cue and all .bin files in one .zip and load the zip. For multi-disc games, use an .m3u playlist or a .pbp.",
        "<b>Hack crashes or shows garbage:</b> almost always the wrong base ROM. Compare the CRC32 with the hack's readme.",
        "<b>Slow or choppy (N64, PlayStation):</b> close other tabs, use Chrome or Edge, and turn off the site's mod-menu effects.",
        "<b>Controls:</b> the emulator's menu (bottom bar, gamepad icon) shows and changes the keys. Controllers are detected when you press a button.",
        "<b>Not supported here:</b> PSP and DOS need browser features this site can't turn on; GameCube, Wii, 3DS and Switch can't run in a browser at all."
      ]
    }
  };

  var GUIDES = {
    "rom-player": {
      lead: "The ROM Player runs games you load from your device, with a built-in patcher for ROM hacks. Nothing is uploaded: the ROM stays in this browser, and the last few are listed under \"Recent\" so you don't have to pick them again.",
      steps: ["get", "systems", "hack", "saves", "trouble"]
    },
    emulatorjs: {
      lead: "This is the plain EmulatorJS page: drop a ROM on it and it starts. It can't apply ROM hack patches or take BIOS files, so for hacks, Sega CD or a missing system, use the <a href=\"play.html?id=original-rom-player\">ROM Player</a> instead.",
      extra: "Files it recognises by extension: .nes .sfc .smc .n64 .z64 .nds .gba .gb. For anything else (including .gbc, .md and .zip) it asks you to pick the system from a list.",
      steps: ["get", "systems", "hack", "saves", "trouble"]
    },
    webretro: {
      lead: "WebRetro is RetroArch in the browser. Pick the system's core first (or Autodetect), then load the ROM. Its own Saves menu has \"Save Game\" for in-game saves. It can't patch ROM hacks; patch first in the <a href=\"play.html?id=original-rom-player\">ROM Player</a> (\"Download patched ROM\"), then load that file here.",
      steps: ["get", "systems", "hack", "saves", "trouble"]
    },
    sm64ds: {
      lead: "Super Mario 64 DS needs your own .nds ROM of the game (USA or Europe both work). Load it from your device (the <a href=\"play.html?id=original-rom-player\">ROM Player</a> also runs it and remembers recent ROMs, so you don't have to pick the file every time). Hacks of SM64DS: patch them in the <a href=\"play.html?id=original-rom-player\">ROM Player</a> (pick Nintendo DS).",
      steps: ["get", "hack", "saves", "trouble"]
    }
  };

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function table() {
    var t = el("table", "rom-guide-table");
    var head = el("tr");
    ["System", "Files", "BIOS needed"].forEach(function (h) { head.appendChild(el("th", null, h)); });
    t.appendChild(head);
    SYSTEMS.forEach(function (row) {
      var tr = el("tr");
      row.forEach(function (c) { tr.appendChild(el("td", null, c)); });
      t.appendChild(tr);
    });
    return t;
  }

  /* `host` is an empty element; fills it and returns true when the game has a guide. */
  function render(game, host) {
    var g = game && GUIDES[game.romGuide];
    if (!g || !host) return false;
    host.innerHTML = "";
    host.appendChild(el("p", "dim rom-guide-lead", g.lead));
    if (g.extra) host.appendChild(el("p", "dim", g.extra));
    g.steps.forEach(function (key, i) {
      var step = COMMON[key];
      var d = el("details", "rom-guide-step");
      if (i === 0) d.open = true;
      d.appendChild(el("summary", null, step.title));
      if (step.table) d.appendChild(table());
      (step.body || []).forEach(function (p) { d.appendChild(el("p", null, p)); });
      host.appendChild(d);
    });
    return true;
  }

  window.RomGuide = { render: render, guides: GUIDES };
})();
