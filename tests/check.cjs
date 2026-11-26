const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(require('url').pathToFileURL(require('path').join(__dirname, '..', 'index.html')).href);
  assert.equal(await p.locator('#list tr').count(), 108);
  await p.fill('#q', 'S710001');
  assert.equal(await p.locator('#list tr').count(), 1);
  await p.click('[data-add="S710001"]'); await p.click('[data-add="S710001"]');
  await p.fill('#q', ''); await p.dispatchEvent('#q', 'input');
  await p.click('[data-add="S000000"]');
  await p.fill('[data-qty="S000000"]', '3'); await p.dispatchEvent('[data-qty="S000000"]', 'change');
  // 2 × 24480 + 3 × 919.80 = 51719.40
  assert.equal((await p.textContent('#total')).replace(/\s/g, ''), '51719,40');
  await p.reload();
  assert.equal(await p.locator('#cart-rows tr').count(), 2, 'cart survives reload');
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'tecespring-desk.png') });
  await p.setViewportSize({ width: 390, height: 844 }); await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'tecespring-phone.png') });
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390), 'no horizontal scroll');
  await p.emulateMedia({ media: 'print' }); await p.setViewportSize({ width: 800, height: 600 }); await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'tecespring-print.png') });
  assert.deepEqual(errs, []); console.log('OK'); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
