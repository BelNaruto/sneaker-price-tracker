// Tiny zero-dependency proxy so your RapidAPI key never reaches the browser.
//   RAPIDAPI_KEY=xxx node server/proxy.js   -> then set "proxy URL" = http://localhost:8787 in ⚙️
// API: https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/kickscrew-sneakers-data · Support: Telegram @pintoflow
const http = require('node:http');
const HOST = 'kickscrew-sneakers-data.p.rapidapi.com';
const ALLOWED = ['/search/v2', '/product/description/byslugs', '/product/description', '/product/bycollection/v2'];
const cache = new Map(); // 5-minute cache saves quota

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOW_ORIGIN || '*');
  const url = new URL(req.url, 'http://x');
  if (!ALLOWED.includes(url.pathname)) { res.writeHead(404); return res.end('{"error":"not allowed"}'); }
  const hit = cache.get(req.url);
  if (hit && Date.now() - hit.t < 300000) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(hit.body); }
  const r = await fetch(`https://${HOST}${url.pathname}${url.search}`, { headers: { 'x-rapidapi-key': process.env.RAPIDAPI_KEY, 'x-rapidapi-host': HOST } });
  const body = await r.text();
  if (r.ok) cache.set(req.url, { t: Date.now(), body });
  res.writeHead(r.status, { 'Content-Type': 'application/json' });
  res.end(body);
}).listen(process.env.PORT || 8787, () => console.log('Proxy on http://localhost:' + (process.env.PORT || 8787)));
