// Loads every self-hosted original game HTML in jsdom, runs its scripts,
// fires a few basic interaction events, and reports any runtime errors.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dir = path.join(__dirname, '..', 'games', 'originals');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

let totalErrors = 0;
const results = [];

function testFile(file) {
  const full = path.join(dir, file);
  const html = fs.readFileSync(full, 'utf8');
  const errors = [];

  const dom = new JSDOM(html, {
    url: 'http://localhost:8899/games/originals/' + file,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: (() => {
      const vc = new (require('jsdom').VirtualConsole)();
      vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
      vc.on('error', (e) => errors.push('console.error: ' + (e && e.message ? e.message : e)));
      return vc;
    })()
  });

  dom.window.addEventListener('error', (e) => {
    errors.push('window.error: ' + (e.error ? e.error.message : e.message));
  });

  // Let scripts + any setTimeout(0) init run
  return new Promise((resolve) => {
    setTimeout(() => {
      // Fire a few generic interactions: click first button, press common keys
      try {
        const doc = dom.window.document;
        const btns = doc.querySelectorAll('button');
        if (btns.length) btns[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Enter'].forEach(k => {
          doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true }));
          doc.dispatchEvent(new dom.window.KeyboardEvent('keyup', { key: k, bubbles: true }));
        });
      } catch (e) {
        errors.push('interaction-error: ' + e.message);
      }
      setTimeout(() => {
        dom.window.close();
        resolve(errors);
      }, 150);
    }, 250);
  });
}

(async () => {
  for (const file of files) {
    try {
      const errors = await testFile(file);
      if (errors.length) {
        totalErrors += errors.length;
        results.push({ file, errors });
      }
    } catch (e) {
      totalErrors++;
      results.push({ file, errors: ['FATAL: ' + e.message] });
    }
  }
  console.log('Tested', files.length, 'games.');
  if (results.length) {
    console.log('\n=== FILES WITH ISSUES ===');
    for (const r of results) {
      console.log('\n' + r.file + ':');
      r.errors.forEach(e => console.log('  - ' + e));
    }
  } else {
    console.log('No runtime errors detected in any game.');
  }
  console.log('\nTotal error count:', totalErrors);
})();
