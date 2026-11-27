// node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { rubToWords, buildDoc, paymentString, cp1251 } = require('../www/docs.js');
const seller = { name: 'ООО «Т»', short: 'Т', inn: '1', kpp: '2', ogrn: '3', address: 'Краснодар', phone: '+7', bank: 'Банк', bik: '4', ks: '5', account: '6', director: 'Д. Д.', vatRate: 22 };
const lines = [{ name: 'Смеситель <b>', art: 'XI1411CR', qty: 2, price: 18330, img: 'https://x/y.jpg' }];

test('rubToWords', () => {
  assert.strictEqual(rubToWords(36660), 'Тридцать шесть тысяч шестьсот шестьдесят рублей 00 копеек');
});

test('invoice has bank requisites, VAT and escaped names', () => {
  const h = buildDoc({ kind: 'invoice', seller, lines, no: 7, date: '2026-11-24', opts: { photos: true, arts: true } });
  assert.match(h, /Счёт на оплату<span>№ 7 от 24 ноября 2026/);
  assert.match(h, /БИК/);
  assert.match(h, /НДС 22%<\/dt><dd>6\s610,82/);
  assert.match(h, /Смеситель &lt;b&gt;/);
  assert.match(h, /Главный бухгалтер/);
});

test('quote has no bank block and shows validity date', () => {
  const h = buildDoc({ kind: 'quote', seller, lines, no: 3, date: '2026-11-24', validDays: 14, opts: { photos: false } });
  assert.match(h, /Коммерческое предложение<span>№ 3 от 24 ноября 2026/);
  assert.doesNotMatch(h, /БИК/);
  assert.match(h, /действительно до 8 декабря 2026 г\. Цены/);
  assert.doesNotMatch(h, /<td class="ph">/);
  assert.match(h, /<b>TECE<\/b>spring/);
});

test('discount: column, totals and VAT from the discounted sum', () => {
  const h = buildDoc({ kind: 'invoice', seller, lines, no: 8, date: '2026-11-24', discount: 10, opts: {} });
  assert.match(h, /<th class="r">Скидка<\/th>/);
  assert.match(h, /Сумма без скидки<\/dt><dd>36\s660,00/);
  assert.match(h, /Скидка 10%<\/dt><dd>−3\s666,00/);
  assert.match(h, /НДС 22%<\/dt><dd>5\s949,74/);
  assert.match(h, /Итого к оплате, ₽<\/dt><dd class="grand">32\s994,00/);
  assert.match(h, /Тридцать две тысячи девятьсот девяносто четыре рубля 00 копеек/);
  assert.doesNotMatch(buildDoc({ kind: 'invoice', seller, lines, no: 8, date: '2026-11-24', opts: {} }), /Скидка/);
});

test('payment QR: GOST R 56042 string in the invoice, none in the quote', () => {
  const s = paymentString(seller, 32994, 'Оплата по счёту № 8 | тест');
  assert.strictEqual(s, 'ST00011|Name=ООО «Т»|PersonalAcc=6|BankName=Банк|BIC=4|CorrespAcc=5|PayeeINN=1|KPP=2|Purpose=Оплата по счёту № 8   тест|Sum=3299400');
  assert.strictEqual(paymentString(seller, 1, 'НДС 12\u00a0164,83').split('|').at(-2), 'Purpose=НДС 12 164,83');
  assert.match(buildDoc({ kind: 'invoice', seller, lines, no: 8, date: '2026-11-24', opts: {} }), /<figure class="qr"><svg/);
  assert.doesNotMatch(buildDoc({ kind: 'quote', seller, lines, no: 8, date: '2026-11-24', opts: {} }), /<svg/);
});

test('cp1251 matches the Windows-1251 table', () => {
  const sample = 'Оплата по счёту № 8 «Т» — Ёж';
  assert.strictEqual(new TextDecoder('windows-1251').decode(Uint8Array.from(cp1251(sample))), sample);
});
