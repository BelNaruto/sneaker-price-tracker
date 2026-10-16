// Headless price tracker: record the price of your sizes to CSV and alert on drops.
// Run it with cron / GitHub Actions / Cloud Scheduler.
//
//   RAPIDAPI_KEY=xxx node tracker/track-prices.js            (uses tracker/watchlist.json)
//   DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... (optional alerts)
//
// API: https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/kickscrew-sneakers-data · Support: Telegram @pintoflow
const fs = require('node:fs');
const path = require('node:path');

const HOST = 'kickscrew-sneakers-data.p.rapidapi.com';
const KEY = process.env.RAPIDAPI_KEY;
const HOOK = process.env.DISCORD_WEBHOOK_URL;
const dir = __dirname;
const watchlist = JSON.parse(fs.readFileSync(path.join(dir, 'watchlist.json'), 'utf8'));
const csvFile = path.join(dir, 'prices.csv');
const lastFile = path.join(dir, 'last.json');
const last = fs.existsSync(lastFile) ? JSON.parse(fs.readFileSync(lastFile, 'utf8')) : {};

async function details(handle) {
  const res = await fetch(`https://${HOST}/product/description/byslugs?handle=${encodeURIComponent(handle)}&country=US`, {
    headers: { 'x-rapidapi-key': KEY, 'x-rapidapi-host': HOST },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()).data;
}

async function alert(text, d, handle) {
  console.log('🔔', text);
  if (!HOOK) return;
  await fetch(HOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [{ title: d.title, url: `https://www.kickscrew.com/products/${handle}`, description: text, color: 0x22c55e, thumbnail: { url: d.featuredImage?.url } }] }),
  });
}

(async () => {
  if (!fs.existsSync(csvFile)) fs.writeFileSync(csvFile, 'timestamp,handle,size,price,in_stock\n');
  const now = new Date().toISOString();
  for (const item of watchlist) {
    const d = await details(item.handle);
    for (const { node } of d.variants.edges) {
      const label = node.selectedOptions.find((o) => o.name === 'Size')?.value || '';
      const size = (label.match(/US\s*([\d.]+[YCK]?)/) || [])[1];
      if (!item.sizes.includes(size)) continue;
      const price = Number(node.price.amount);
      const key = `${item.handle}|${size}`;
      fs.appendFileSync(csvFile, `${now},${item.handle},${size},${price},${node.availableForSale}\n`);
      const prev = last[key];
      if (node.availableForSale && price > 0) {
        if (item.targetPrice && price <= item.targetPrice) await alert(`🎯 US ${size} is **$${price}** (target $${item.targetPrice})`, d, item.handle);
        else if (prev && price < prev.price) await alert(`📉 US ${size} dropped from $${prev.price} to **$${price}**`, d, item.handle);
        else if (prev && !prev.inStock) await alert(`✅ US ${size} is back in stock at **$${price}**`, d, item.handle);
      }
      last[key] = { price, inStock: node.availableForSale, at: now };
      console.log(`${d.title} · US ${size}: $${price} ${node.availableForSale ? '(in stock)' : '(sold out)'}`);
    }
  }
  fs.writeFileSync(lastFile, JSON.stringify(last, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
