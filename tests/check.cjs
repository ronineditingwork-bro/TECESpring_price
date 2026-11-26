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
  assert.equal(await p.locator('.tile').count(), total);

  // остатки: фильтр «Только в наличии» и подпись у товара
  const inStock = await p.evaluate(() => window.PRICE.sections.flatMap((s) => s.items).filter((i) => window.STOCK.stores.some((s) => s.items[i.sku] > 0)).length);
  await p.check('#in-stock');
  assert.equal(await p.locator('.tile').count(), inStock);
  await p.uncheck('#in-stock');
  assert.match(await p.textContent('a[href="#p=S710001"]'), /Ростов 20\s*Москва 577/);

  await p.fill('#q', 'S710001');
  assert.equal(await p.locator('.tile').count(), 1);
  await p.click('[data-add="S710001"]'); await p.click('[data-add="S710001"]');
  await p.fill('#q', '');

  // карточка товара: фото, описание, добавление в корзину
  await p.click('a[href="#p=S000000"]');
  await p.waitForSelector('#card h1'); // экран меняется по hashchange, асинхронно
  assert.ok(!(await p.isVisible('#catalog')));
  assert.ok(await p.isVisible('#back'), 'back button on inner screens');
  await p.click('#addBtn');
  assert.equal(await p.textContent('#card-qty'), 'В корзине 1 м');
  await p.screenshot({ path: shot('card'), fullPage: true });
  await p.click('#back'); // кнопка «Назад» в шапке возвращает на предыдущий экран
  await p.waitForSelector('#catalog', { state: 'visible' });
  assert.ok(!(await p.isVisible('#back')), 'no back button on the catalog');

  await p.click('#nav-cart');
  await p.waitForSelector('#cart', { state: 'visible' });
  await p.fill('[data-qty="S000000"]', '3'); await p.dispatchEvent('[data-qty="S000000"]', 'change');
  // 2 × 24480 + 3 × 919.80 = 51719.40
  assert.equal((await p.textContent('.summary .tot b')).replace(/\s/g, ''), '51719,40₽');
  await p.click('[data-inc="S000000"]'); await p.click('[data-dec="S000000"]');
  assert.equal(await p.inputValue('[data-qty="S000000"]'), '3', 'steppers');
  await p.reload();
  assert.equal(await p.locator('#cart .line').count(), 2, 'cart survives reload');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
  await p.screenshot({ path: shot('cart') });

  await p.goto(url);
  await p.screenshot({ path: shot('list') });

  // КП: та же форма, что в WHITECROSS/MAPEI — продавец из общего списка, клиент, PDF с фото товаров
  await p.goto(url + '#cart');
  await p.click('[data-go="doc/quote"]');
  await p.waitForSelector('#doc #seller');
  await p.click('#back'); await p.waitForSelector('#cart', { state: 'visible' }); // «Назад» из документа — в корзину
  await p.click('[data-go="doc/quote"]');
  await p.waitForSelector('#doc #seller');
  const sellers = await p.locator('#seller option').allTextContents();
  assert.ok(sellers.length >= 4 && sellers.some((x) => x.includes('КЕРБЕР-ЮГ')), 'seller list: ' + sellers);
  await p.selectOption('#seller', { label: sellers.find((x) => x.includes('КЕРБЕР-ЮГ')) });
  await p.fill('#b_name', 'ООО «Клиент»');
  await p.screenshot({ path: shot('doc-form'), fullPage: true });
  await p.click('#pdfBtn');
  await p.waitForURL(/doc\.html$/); await p.waitForSelector('h1');
  const doc = await p.textContent('body');
  assert.match(doc, /Коммерческое предложение№ 1 от/);
  assert.match(doc, /ИНН 2308293988, КПП 616601001/);
  assert.match(doc, /Для\s*ООО «Клиент»/);
  assert.match(doc, /НДС 22%\s*9\s326,45/);
  assert.match(doc, /Сумма без НДС\s*42\s392,95/);
  assert.match(doc, /Пятьдесят одна тысяча семьсот девятнадцать рублей 40 копеек/);
  const pics = await p.evaluate(() => [...document.querySelectorAll('td.ph img')].map((i) => i.complete && i.naturalWidth > 0));
  assert.deepEqual(pics, [true, true], 'quote shows a picture for every line');
  assert.match(await p.textContent('.items'), /3\s*м/, 'unit from the price list');
  await p.screenshot({ path: shot('quote'), fullPage: true });

  await p.goto(url + '#doc/invoice');
  await p.waitForSelector('#doc #seller');
  assert.match(await p.inputValue('#seller'), /\d/);
  await p.click('#pdfBtn');
  await p.waitForURL(/doc\.html$/); await p.waitForSelector('h1');
  const inv = await p.textContent('body');
  assert.match(inv, /Счёт на оплату№ 1 от/);
  assert.match(inv, /044525593/, 'invoice: bank requisites of the chosen seller');
  assert.match(inv, /Главный бухгалтер/);
  await p.screenshot({ path: shot('invoice'), fullPage: true });

  // Z Fold 7 разложен: каталог и карточка рядом, складывание возвращает один экран
  await p.emulateMedia({ media: 'screen' });
  await p.setViewportSize({ width: 884, height: 820 });
  await p.goto(url + '#p=S710002');
  await p.waitForSelector('#card h1');
  assert.ok(await p.isVisible('#catalog') && await p.isVisible('#card') && !(await p.isVisible('#cart')), 'unfolded: list + card');
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'unfolded: no horizontal scroll');
  await p.screenshot({ path: shot('fold-open') });
  await p.click('#cart-top');
  await p.waitForSelector('#cart', { state: 'visible' });
  assert.ok(await p.isVisible('#catalog'), 'unfolded: list stays next to cart');
  const pane = await p.evaluate(() => { const c = document.getElementById('cart'); return [c.scrollWidth, c.clientWidth]; });
  assert.ok(pane[0] <= pane[1], `unfolded: cart fits its pane (${pane})`);
  await p.screenshot({ path: shot('fold-cart') });
  await p.click('[data-go="doc/quote"]');
  await p.waitForSelector('#doc #seller');
  assert.ok(await p.isVisible('#catalog') && !(await p.isVisible('#cart')), 'unfolded: list + quote form');
  await p.screenshot({ path: shot('fold-doc') });
  await p.setViewportSize({ width: 411, height: 900 }); // сложили: внешний экран
  await p.waitForFunction(() => document.getElementById('catalog').hidden);

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
