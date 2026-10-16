// Pepersfight ads (browser only). Off until "client" holds your AdSense publisher id.
// 1. Get AdSense approved for pepers.online (and pepers.lol / arcadecampushub.online if you
//    want ads there too) and apply for "H5 Games Ads" in AdSense.
// 2. Put the publisher id below (looks like ca-pub-1234567890123456) and, optionally, a display
//    ad unit id for the loading-screen banner. Set test: false when you go live.
// 3. Upload this file next to index.html. No game rebuild is needed.
window.PEPERS_ADS = {
  enabled: true,
  client: "",                 // "ca-pub-..."; empty = no ads at all
  test: true,                 // AdSense test ads (no revenue) while you check placement
  preroll: true,              // one ad while the game loads
  loaderSlot: "",             // display ad unit id for the 728x90 loading-screen banner
  interstitialEveryMatches: 1, // ad break after every Nth match the player finishes
  minSecondsBetween: 180,     // never two ad breaks closer than this
  frequencyHint: "180s"
};
