/* Run with NODE_PATH pointing at a Playwright installation. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({channel:'msedge', headless:true});
  try {
    const page = await browser.newPage({ viewport: { width:1440,height:1000 }});
    await page.goto(process.env.UI_TEST_URL || 'http://127.0.0.1:8766/');
    await page.waitForSelector('#g-suggested .tile');
    const design = await page.evaluate(() => ({
      accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      gap:parseFloat(getComputedStyle(document.querySelector('.grid')).gap),
      radius:parseFloat(getComputedStyle(document.querySelector('.tile')).borderRadius),
      target:document.querySelector('.tile-star').getBoundingClientRect().height,
      primary:document.querySelectorAll('.rail-nav > a').length
    }));
    assert.equal(design.accent, '#75a7ff', 'default theme uses calm blue');
    assert.ok(design.gap >= 16, 'game cards have breathing room');
    assert.ok(design.radius >= 10, 'cards are clearly separated surfaces');
    assert.ok(design.target >= 44, 'pin buttons have touch-sized targets');
    assert.ok(design.primary <= 6, 'primary navigation stays focused');
    await page.locator('#home-search').fill('chess');
    await page.locator('#home-search').press('Enter');
    await page.waitForURL('**/browse.html?q=chess');
    for (const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:900});
      for (const route of ['index.html','browse.html','library.html','categories.html','settings.html','login.html']) {
        await page.goto('http://127.0.0.1:8766/'+route);
        await page.waitForTimeout(100);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), `${route} fits ${width}px`);
      }
    }
    console.log('PASS: blue tokens, card separation, touch targets, focused navigation, native search; six routes at four viewport widths.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
