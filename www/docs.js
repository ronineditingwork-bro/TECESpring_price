// 4976.5 -> "Четыре тысячи девятьсот семьдесят шесть рублей 50 копеек"
function rubToWords(amount) {
  const kop = Math.round(amount * 100);
  let rub = Math.floor(kop / 100);
  const ones = [['', 'один', 'два'], ['', 'одна', 'две']];
  const u = ['', '', '', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
  const plural = (n, f) => { n %= 100; if (n > 10 && n < 20) return f[2]; n %= 10; return n === 1 ? f[0] : n > 1 && n < 5 ? f[1] : f[2]; };
  const triad = (n, fem) => {
    const w = [hundreds[Math.floor(n / 100)]], t = n % 100;
    if (t >= 10 && t < 20) w.push(teens[t - 10]);
    else { w.push(tens[Math.floor(t / 10)]); const o = t % 10; w.push(o < 3 ? ones[fem ? 1 : 0][o] : u[o]); }
    return w.filter(Boolean).join(' ');
  };
  const scales = [[['', '', ''], 0], [['тысяча', 'тысячи', 'тысяч'], 1], [['миллион', 'миллиона', 'миллионов'], 0], [['миллиард', 'миллиарда', 'миллиардов'], 0]];
  const parts = [];
  for (let i = 0; rub > 0 && i < scales.length; i++, rub = Math.floor(rub / 1000)) {
    const n = rub % 1000;
    if (n) parts.unshift(triad(n, scales[i][1]) + (i ? ' ' + plural(n, scales[i][0]) : ''));
  }
  const r = Math.floor(kop / 100), k = kop % 100;
  const text = (parts.join(' ') || 'ноль') + ' ' + plural(r, ['рубль', 'рубля', 'рублей']) + ' ' + String(k).padStart(2, '0') + ' ' + plural(k, ['копейка', 'копейки', 'копеек']);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const money = n => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const escHtml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ruDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

// Одна страница A4 (794 CSS px = A4 при 96 dpi) в стиле заводской проформы: шапка с маркой и реквизитами продавца,
// сетка «номер / дата / срок», стороны сделки, таблица позиций на тонких линиях, разбивка НДС, платёжные реквизиты внизу.
// kind 'invoice' — «Счёт на оплату» (с банковскими реквизитами и главным бухгалтером), 'quote' — «Коммерческое предложение».
// buyer: { name, inn, kpp, address, phone }; lines: { name, art, qty, unit, price, img }; opts: { photos, arts, toolbar }.
// discount — скидка клиенту в %, на все позиции; НДС, сумма прописью и QR-код считаются от суммы со скидкой.
function buildDoc({ kind = 'invoice', seller, buyer = {}, comment = '', lines, no, date, validDays = 14, discount = 0, opts = {} }) {
  const e = escHtml, quote = kind === 'quote';
  const d = Math.min(Math.max(+discount || 0, 0), 99.99);
  const full = (l) => Math.round(l.qty * l.price * 100) / 100;
  const net = (l) => Math.round(l.qty * l.price * (100 - d)) / 100;  // сумма строки со скидкой, до копеек
  const gross = lines.reduce((s, l) => s + full(l), 0);
  const total = Math.round(lines.reduce((s, l) => s + net(l), 0) * 100) / 100;
  const vat = seller.vatRate ? Math.round(total * seller.vatRate / (100 + seller.vatRate) * 100) / 100 : 0;
  const docName = quote ? 'Коммерческое предложение' : 'Счёт на оплату';
  const title = `${docName} № ${e(no)} от ${ruDate(date)}`;
  const until = new Date(date + 'T00:00:00'); until.setDate(until.getDate() + (+validDays || 0));
  const req = seller.kpp ? `ИНН ${e(seller.inn)}, КПП ${e(seller.kpp)}, ОГРН ${e(seller.ogrn)}` : `ИНН ${e(seller.inn)}, ОГРНИП ${e(seller.ogrn)}`;
  const buyerLines = [buyer.name && `<b>${e(buyer.name)}</b>`, [buyer.inn && 'ИНН ' + e(buyer.inn), buyer.kpp && 'КПП ' + e(buyer.kpp)].filter(Boolean).join(', '),
    buyer.address && e(buyer.address), buyer.phone && 'Тел.: ' + e(buyer.phone)].filter(Boolean).join('<br>') || '—';
  const cols = 5 + (opts.photos ? 1 : 0) + (opts.arts ? 1 : 0);
  const rows = lines.map((l, i) => `<tr>
    <td class="c">${i + 1}</td>
    ${opts.photos ? `<td class="ph">${l.img ? `<img src="${e(l.img)}" alt="">` : ''}</td>` : ''}
    ${opts.arts ? `<td class="art">${e(l.art || '')}</td>` : ''}
    <td>${e(l.name)}</td>
    <td class="r">${l.qty}&nbsp;${e(l.unit || 'шт')}</td>
    <td class="r">${money(l.price)}</td>
    ${d ? `<td class="r">${String(d).replace('.', ',')}%</td>` : ''}
    <td class="r">${money(net(l))}</td></tr>`).join('');
  const purpose = `Оплата по счёту № ${no} от ${ruDate(date)}${seller.vatRate ? `, в том числе НДС ${seller.vatRate}% ${money(vat)} руб.` : ', НДС не облагается.'}`;
  const meta = [quote ? ['Действительно до', ruDate(until.toLocaleDateString('sv'))] : null, ['Валюта', 'RUB, российский рубль'], ['НДС', seller.vatRate ? `${seller.vatRate}%, включён в цены` : 'не облагается']].filter(Boolean);
  const sign = seller.director ? `<div><span>Руководитель</span><i></i><span>${e(seller.director)}</span></div>${quote ? '' : `<div><span>Главный бухгалтер</span><i></i><span>${e(seller.director)}</span></div>`}`
    : `<div><span>Индивидуальный предприниматель</span><i></i><span>${e(seller.short)}</span></div>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=794"><title>${title}</title><style>
  @font-face { font-family: "Golos"; src: url("fonts/golos-text-cyrillic-wght-normal.woff2") format("woff2"); font-weight: 400 900; unicode-range: U+0400-045F, U+2116; }
  @font-face { font-family: "Golos"; src: url("fonts/golos-text-latin-ext-wght-normal.woff2") format("woff2"); font-weight: 400 900; unicode-range: U+0100-02FF, U+20A0-20C0; }
  @font-face { font-family: "Golos"; src: url("fonts/golos-text-latin-wght-normal.woff2") format("woff2"); font-weight: 400 900; unicode-range: U+0000-00FF, U+2000-206F, U+20AC; }
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { font: 9.5pt/1.45 "Golos", Arial, sans-serif; font-feature-settings: "tnum" 1; color: #1e2329; margin: 0; padding: 44px 50px 40px; width: 794px; background: #fff; }
  .muted { color: #6a7380; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; padding-bottom: 18px; border-bottom: 2px solid #1e2329; }
  .mark { font-size: 21pt; letter-spacing: -.01em; line-height: 1; } .mark b { font-weight: 750; margin-right: 2px; }
  .mark small { display: block; font-size: 7.5pt; letter-spacing: .02em; color: #6a7380; margin-top: 6px; }
  .from { text-align: right; font-size: 8pt; line-height: 1.5; color: #6a7380; max-width: 360px; } .from b { color: #1e2329; font-size: 9pt; }
  .head { display: grid; grid-template-columns: 1fr 250px; gap: 28px; align-items: end; margin: 26px 0 22px; }
  h1 { font-size: 21pt; font-weight: 600; letter-spacing: -.015em; line-height: 1.1; margin: 0; } h1 span { display: block; font-size: 11pt; font-weight: 500; color: #6a7380; letter-spacing: 0; margin-top: 8px; }
  .meta { display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; font-size: 8.5pt; } .meta dt { color: #6a7380; } .meta dd { margin: 0; text-align: right; font-weight: 500; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-bottom: 20px; }
  .parties h2, .bank h2, .terms h2 { font-size: 7.5pt; font-weight: 600; color: #6a7380; letter-spacing: .03em; margin: 0 0 6px; padding-bottom: 5px; border-bottom: 1px solid #dce1e7; }
  .parties div { font-size: 8.5pt; line-height: 1.55; }
  .comment { margin: 0 0 18px; padding: 10px 14px; background: #f4f6f8; border-radius: 6px; font-size: 9pt; }
  table.items { width: 100%; border-collapse: collapse; }
  .items th { font-size: 7.5pt; font-weight: 600; color: #6a7380; text-align: left; padding: 7px 6px; background: #f4f6f8; border-top: 1px solid #1e2329; border-bottom: 1px solid #dce1e7; }
  .items td { padding: 8px 6px; border-bottom: 1px solid #dce1e7; vertical-align: middle; }
  .items .r { text-align: right; white-space: nowrap; } .items th.r { text-align: right; } .items .c { text-align: center; color: #6a7380; width: 26px; }
  .items .art { white-space: nowrap; color: #6a7380; font-size: 8.5pt; }
  .ph { width: ${quote ? 78 : 58}px; padding: 4px !important; } .ph img { width: ${quote ? 70 : 50}px; height: ${quote ? 70 : 50}px; object-fit: contain; display: block; margin: auto; }
  .sum { display: grid; grid-template-columns: 1fr 300px; gap: 28px; margin-top: 16px; align-items: start; }
  .words { font-size: 8.5pt; } .words b { display: block; font-weight: 500; color: #1e2329; margin-top: 2px; }
  .tot { display: grid; grid-template-columns: 1fr auto; row-gap: 4px; font-size: 9pt; } .tot dt { padding-right: 16px; } .tot dd { margin: 0; text-align: right; white-space: nowrap; }
  .tot .grand { font-size: 12.5pt; font-weight: 650; padding-top: 8px; margin-top: 4px; border-top: 2px solid #1e2329; }
  .terms, .bank { margin-top: 22px; font-size: 8.5pt; }
  .pay { display: grid; grid-template-columns: 1fr 150px; gap: 24px; align-items: start; }
  .qr { margin: 0; text-align: center; } .qr svg { width: 150px; height: 150px; display: block; }
  .qr figcaption { font-size: 7pt; color: #6a7380; margin-top: 4px; line-height: 1.3; }
  .bank dl { display: grid; grid-template-columns: 130px 1fr 130px 1fr; gap: 4px 12px; margin: 0; } .bank dt { color: #6a7380; } .bank dd { margin: 0; }
  .sign { margin-top: 34px; display: grid; gap: 18px; font-size: 9pt; }
  .sign div { display: grid; grid-template-columns: 200px 180px auto; gap: 12px; align-items: end; } .sign i { border-bottom: 1px solid #1e2329; height: 14px; }
  .foot { margin-top: 30px; padding-top: 8px; border-top: 1px solid #dce1e7; font-size: 7.5pt; color: #6a7380; display: flex; justify-content: space-between; }
  .bar { position: sticky; top: 0; display: flex; gap: 10px; margin: -44px -50px 28px; padding: 14px 50px; background: #1e2329; }
  .bar button { font: 600 17px "Golos", Arial, sans-serif; border: 0; border-radius: 24px; padding: 12px 22px; background: #fff; color: #1e2329; }
  .bar button + button { background: #0c4a8c; color: #fff; }
  @media print { .bar { display: none; } }
</style></head><body>${opts.toolbar ? `<div class="bar"><button onclick="history.back()">Назад</button><button onclick="print()">Сохранить PDF / Поделиться</button></div>` : ''}
<div class="top">
  <div class="mark"><b>TECE</b>spring<small>Инсталляции, панели смыва, санитарная керамика</small></div>
  <div class="from"><b>${e(seller.name)}</b><br>Тел.: ${e(seller.phone)}</div>
</div>
<div class="head">
  <h1>${docName}<span>№ ${e(no)} от ${ruDate(date)}</span></h1>
  <dl class="meta">${meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
</div>
<div class="parties">
  <section><h2>Поставщик</h2><div><b>${e(seller.name)}</b><br>${req}<br>${e(seller.address)}<br>Тел.: ${e(seller.phone)}</div></section>
  <section><h2>${quote ? 'Для' : 'Покупатель'}</h2><div>${buyerLines}</div></section>
</div>
${comment ? `<div class="comment">${e(comment).replace(/\n/g, '<br>')}</div>` : ''}
<table class="items"><thead><tr><th class="c">№</th>${opts.photos ? '<th></th>' : ''}${opts.arts ? '<th>Артикул</th>' : ''}<th>Наименование</th><th class="r">Кол-во</th><th class="r">Цена, ₽</th>${d ? '<th class="r">Скидка</th>' : ''}<th class="r">Сумма, ₽</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="sum">
  <div class="words muted">Всего наименований ${lines.length}, на сумму ${money(total)} руб.<b>${rubToWords(total)}</b></div>
  <dl class="tot">
    ${d ? `<dt>Сумма без скидки</dt><dd>${money(gross)}</dd><dt>Скидка ${String(d).replace('.', ',')}%</dt><dd>−${money(Math.round((gross - total) * 100) / 100)}</dd>` : ''}
    ${seller.vatRate ? `<dt>Сумма без НДС</dt><dd>${money(total - vat)}</dd><dt>НДС ${seller.vatRate}%</dt><dd>${money(vat)}</dd>` : `<dt>НДС</dt><dd>не облагается</dd>`}
    <dt class="grand">${quote ? 'Итого' : 'Итого к оплате'}, ₽</dt><dd class="grand">${money(total)}</dd>
  </dl>
</div>
${quote ? `<div class="terms"><h2>Условия</h2>Предложение действительно до ${ruDate(until.toLocaleDateString('sv'))} Цены указаны в рублях${seller.vatRate ? ' с НДС' : ''}.</div>`
  : `<div class="bank"><h2>Платёжные реквизиты</h2><div class="pay"><dl>
    <dt>Получатель</dt><dd>${e(seller.name)}</dd><dt>Банк</dt><dd>${e(seller.bank)}</dd>
    <dt>ИНН / КПП</dt><dd>${e(seller.inn)}${seller.kpp ? ' / ' + e(seller.kpp) : ''}</dd><dt>БИК</dt><dd>${e(seller.bik)}</dd>
    <dt>Расчётный счёт</dt><dd>${e(seller.account)}</dd><dt>Корр. счёт</dt><dd>${e(seller.ks)}</dd>
  </dl><figure class="qr">${payQr(seller, total, purpose)}<figcaption>Оплата по QR-коду в приложении банка</figcaption></figure></div>
  <p class="muted" style="margin:8px 0 0">Назначение платежа: ${e(purpose)}</p></div>`}
<div class="sign">${sign}</div>
<div class="foot"><span>${e(seller.name)}, ${req}</span><span>${docName} № ${e(no)}</span></div>
</body></html>`;
}

// Строка платежа по ГОСТ Р 56042-2014. ST00011 — кодировка Windows-1251: русская буква — один байт,
// поэтому QR-код проще и уверенно читается камерой с листа A4; её понимают приложения российских банков.
function paymentString(seller, total, purpose) {
  const clean = (v) => String(v ?? '').replace(/[|\u00a0\u202f]/g, ' ').trim();  // «|» — разделитель полей; неразрывные пробелы из сумм — в обычные
  return ['ST00011', `Name=${clean(seller.name)}`, `PersonalAcc=${clean(seller.account)}`, `BankName=${clean(seller.bank)}`,
    `BIC=${clean(seller.bik)}`, `CorrespAcc=${clean(seller.ks)}`, `PayeeINN=${clean(seller.inn)}`,
    seller.kpp && `KPP=${clean(seller.kpp)}`, `Purpose=${clean(purpose)}`, `Sum=${Math.round(total * 100)}`].filter(Boolean).join('|');
}

function cp1251(s) {
  const extra = { 0x401: 0xA8, 0x451: 0xB8, 0x2116: 0xB9, 0xAB: 0xAB, 0xBB: 0xBB, 0x2014: 0x97, 0x2013: 0x96, 0x2212: 0x2D };
  return Array.from(s, (ch) => {
    const c = ch.codePointAt(0);
    return c < 0x80 ? c : c >= 0x410 && c <= 0x44F ? c - 0x350 : extra[c] ?? 0x3F;  // А–я подряд с 0xC0; прочее — «?»
  });
}

function payQr(seller, total, purpose) {
  const lib = typeof qrcode !== 'undefined' ? qrcode : require('./qrcode.js');
  lib.stringToBytes = cp1251;
  const qr = lib(0, 'M');
  qr.addData(paymentString(seller, total, purpose), 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 6, scalable: true }); // белое поле вокруг — так QR уверенно читают банковские приложения
}

if (typeof module !== 'undefined') module.exports = { rubToWords, buildDoc, paymentString, cp1251 };
