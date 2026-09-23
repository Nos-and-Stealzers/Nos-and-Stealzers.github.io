from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8791"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.add_init_script("""
      (() => {
        let full = null;
        Object.defineProperty(document, 'fullscreenElement', {get: () => full, configurable: true});
        HTMLElement.prototype.requestFullscreen = function () {
          full = this;
          document.dispatchEvent(new Event('fullscreenchange'));
          return Promise.resolve();
        };
        document.exitFullscreen = function () {
          full = null;
          document.dispatchEvent(new Event('fullscreenchange'));
          return Promise.resolve();
        };
        localStorage.setItem('ach:consent', JSON.stringify({version:'2026-09-10'}));
      })();
    """)
    page.goto(BASE + "/play.html?id=original-snake", wait_until="networkidle")
    page.locator("#a-play").click()
    page.evaluate("""() => {
      const r=document.createElement('div'); r.className='callroot'; document.body.appendChild(r);
    }""")
    page.locator("#a-full").click()
    page.wait_for_timeout(100)
    assert page.locator("#stage").evaluate("e => e.classList.contains('is-fullscreen')"), "stage must enter fullscreen UI state"
    assert page.locator("#a-full").inner_text().lower().find("exit") >= 0, "toolbar must offer Exit fullscreen"
    assert page.locator("#stage > .callroot").count() == 1, "active call UI must remain visible inside game fullscreen"
    assert page.locator("#stage .stage-fullscreen-controls").count() == 1, "fullscreen must provide an on-screen exit control"
    page.locator("#stage .stage-exit-fullscreen").click()
    page.wait_for_timeout(100)
    assert not page.locator("#stage").evaluate("e => e.classList.contains('is-fullscreen')"), "exit control must leave fullscreen"
    assert page.locator("body > .callroot").count() == 1, "call UI must return to the page after fullscreen"

    # Browsers without the Fullscreen API still get an immersive fixed stage.
    page.evaluate("""() => {
      document.exitFullscreen = undefined;
      HTMLElement.prototype.requestFullscreen = undefined;
      HTMLElement.prototype.webkitRequestFullscreen = undefined;
      HTMLElement.prototype.msRequestFullscreen = undefined;
    }""")
    page.locator("#a-full").click()
    assert page.locator("#stage").evaluate("e => e.classList.contains('is-pseudo-fullscreen')"), "fallback immersive mode must open"
    assert "exit" in page.locator("#a-full").inner_text().lower()
    page.keyboard.press("Escape")
    assert not page.locator("#stage").evaluate("e => e.classList.contains('is-pseudo-fullscreen')"), "Escape must leave fallback immersive mode"
    browser.close()
print("play fullscreen behavior: PASS")
