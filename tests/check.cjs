// Browser check of www/: node tests/check.cjs (needs Playwright with Chromium)
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const os = require('os');
const url = require('url').pathToFileURL(path.join(__dirname, '..', 'www', 'index.html')).href;
const shot = (name) => path.join(os.tmpdir(), `tecespring-${name}.png`);

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url);
  const total = await p.evaluate(() => window.PRICE.sections.reduce((n, s) => n + s.items.length, 0));
  assert.equal(await p.locator('.items li').count(), total);

  // остатки: фильтр «Только в наличии» и подпись у товара
  const inStock = await p.evaluate(() => window.PRICE.sections.flatMap((s) => s.items).filter((i) => window.STOCK.stores.some((s) => s.items[i.sku] > 0)).length);
  await p.check('#in-stock');
  assert.equal(await p.locator('.items li').count(), inStock);
  await p.uncheck('#in-stock');
  assert.match(await p.textContent('a[href="#p=S710001"]'), /Краснодар: 20 · Москва: 577 шт/);

  await p.fill('#q', 'S710001');
  assert.equal(await p.locator('.items li').count(), 1);
  await p.click('[data-add="S710001"]'); await p.click('[data-add="S710001"]');
  await p.fill('#q', '');

  // карточка товара: фото, описание, добавление в корзину
  await p.click('a[href="#p=S000000"]');
  await p.waitForSelector('#card h2'); // экран меняется по hashchange, асинхронно
  assert.ok(!(await p.isVisible('#catalog')));
  await p.click('#card [data-add="S000000"]');
  assert.equal(await p.textContent('#card-qty'), 'в корзине: 1');
  await p.screenshot({ path: shot('card'), fullPage: true });
  await p.goBack();
  await p.waitForSelector('#catalog', { state: 'visible' }); // «Назад» возвращает в каталог

  await p.click('#nav-cart');
  await p.waitForSelector('#cart', { state: 'visible' });
  await p.fill('[data-qty="S000000"]', '3'); await p.dispatchEvent('[data-qty="S000000"]', 'change');
  // 2 × 24480 + 3 × 919.80 = 51719.40
  assert.equal((await p.textContent('#total')).replace(/\s/g, ''), '51719,40');
  await p.reload();
  assert.equal(await p.locator('#cart-rows tr').count(), 2, 'cart survives reload');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
  await p.screenshot({ path: shot('cart') });

  await p.goto(url);
  await p.screenshot({ path: shot('list') });
  await p.emulateMedia({ media: 'print' }); await p.setViewportSize({ width: 800, height: 600 });
  assert.ok(await p.isVisible('#cart-rows'), 'print shows the quote from any screen');
  assert.ok(await p.evaluate(() => document.getElementById('cart').offsetWidth > innerWidth * 0.9), 'print: quote uses the full page width');
  assert.match(await p.textContent('#seller'), /ИНН 2308293988, КПП 616601001/, 'print: seller requisites');
  assert.equal((await p.textContent('#vat')).replace(/\s/g, ''), '9326,45', 'print: VAT 22% included');
  assert.match(await p.textContent('#sign'), /Директор .* Казачков А\. В\./);
  await p.screenshot({ path: shot('print') });

  // Z Fold 7 разложен: каталог и карточка рядом, складывание возвращает один экран
  await p.emulateMedia({ media: 'screen' });
  await p.setViewportSize({ width: 884, height: 820 });
  await p.goto(url + '#p=S710002');
  await p.waitForSelector('#card h2');
  assert.ok(await p.isVisible('#catalog') && await p.isVisible('#card') && !(await p.isVisible('#cart')), 'unfolded: list + card');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'unfolded: no horizontal scroll');
  await p.screenshot({ path: shot('fold-open') });
  await p.click('#nav-cart');
  await p.waitForSelector('#cart', { state: 'visible' });
  assert.ok(await p.isVisible('#catalog'), 'unfolded: list stays next to cart');
  const pane = await p.evaluate(() => { const c = document.getElementById('cart'); return [c.scrollWidth, c.clientWidth]; });
  assert.ok(pane[0] <= pane[1], `unfolded: quote fits its pane (${pane})`);
  await p.screenshot({ path: shot('fold-cart') });
  await p.setViewportSize({ width: 411, height: 900 }); // сложили: внешний экран
  await p.waitForFunction(() => document.getElementById('catalog').hidden);
  await p.emulateMedia({ media: 'print' });
  assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById('cart')).maxHeight), 'none', 'print not clipped');

  // в карточках не должно быть битых фото
  const broken = await p.evaluate(async () => {
    const srcs = Object.values(window.CATALOG).flatMap((c) => c.images);
    const bad = [];
    await Promise.all(srcs.map((s) => new Promise((ok) => { const i = new Image(); i.onload = ok; i.onerror = () => { bad.push(s); ok(); }; i.src = s; })));
    return bad;
  });
  assert.deepEqual(broken, []);
  assert.deepEqual(errs, []);
  console.log('OK, screenshots in', os.tmpdir());
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
