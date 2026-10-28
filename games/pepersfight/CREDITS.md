# Pepersfight asset credits

Started 2026-10-27 (3.7.25). Add a line whenever a third-party asset is added or put to a new use.

## Audio
- `Assets/ThirdParty/Kenney/Audio/*` (impact*, tick_001, explosion*, ...): Kenney (https://kenney.nl), audio packs released under CC0 1.0 (public domain, commercial redistribution allowed, no attribution required; credited anyway).
  - 3.7.25 hit-confirm layers (`Presentation/HitConfirmAudio.cs`): impactPunch_medium_00x (body), impactGlass_light_00x (shield), impactMetal_light_00x (headshot ding), impactBell_heavy_00x + impactPunch_heavy_00x (elimination), tick_001 (transient).
- `Assets/Pepers/Audio/sfx_*.wav` (except the gunshots below): original, generated procedurally by `HermesBridge/gen_sfx.py` (no third-party samples).
- 3.7.26 gunshots `Assets/Pepers/Audio/sfx_{pistol,rifle,smg,shotgun,sniper}.wav` + `_v1`/`_v2` takes: recorded crack and room tail from **The Free Firearm Sound Library** (Ben Jaszczak et al., http://freefirearmsfx.com, mirrored at https://opengameart.org/content/the-free-firearm-sound-library), released **CC0 1.0** ("may be used without royalty or credit ... for any application, personal or professional"; commercial redistribution allowed). Sources: Walther PPQ X_39P (pistol), AR-15 D_32P (rifle), Carl Gustav M45 G_31P (smg), Benelli Nova O_21P (shotgun), Tikka W_29P (sniper), near-distance takes. Mixed with the low end of the previous procedural shot (thump) by `HermesBridge/gen_gunshots.py`. `sfx_rocket` stays procedural.

## Other Kenney folders
- `Assets/ThirdParty/Kenney/Nature`, `Particles`, `Suburban`: Kenney asset packs, CC0 1.0.

## UI icons
- 3.7.30 ability HUD icons `Assets/Pepers/Resources/AbilityIcons/*.png` (white silhouettes, tinted per ability in `UI/HUD.cs`): from **game-icons.net** (https://game-icons.net, repo https://github.com/game-icons/icons), licensed **CC BY 3.0** (https://creativecommons.org/licenses/by/3.0/; commercial use and redistribution allowed with attribution). Rasterised to 128 px PNG by `HermesBridge/gen_ability_icons.py`.
  - Nectar Guard: "Shield" by Sbed, with "Drop" by Lorc cut out of it (modified).
  - Wingbeat: "Feathered wing" by Lorc.
  - Talon Dive: "Bird claw" by Lorc.
  - Spicy Shell: "Fire shield" by Lorc.
  - Hot Foot: "Sprint" by Lorc.
  - Pepper Gust: "Wind slap" by Lorc.
