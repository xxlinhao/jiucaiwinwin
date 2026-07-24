const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const STOCKS = [
  { name: '中国平安', code: '601318', market: '1', divPerShare: 2.70, target: 50, role: '周期弹性' },
  { name: '招商银行', code: '600036', market: '1', divPerShare: 2.016, target: 37, role: '稳定底仓' },
  { name: '格力电器', code: '000651', market: '0', divPerShare: 3.00, target: 38, role: '高股息' },
  { name: '中国移动', code: '600941', market: '1', divPerShare: 4.70, target: 88, role: '波动缓冲' },
];

const POSITIONS = {
  '601318': { shares: 1000, cost: 50.88 },
  '600036': { shares: 700, cost: 36.41 },
  '000651': { shares: 500, cost: 39.38 },
  '600941': { shares: 0, cost: 0 },
};

const DIVIDEND_CALENDAR = [
  { stock: '格力电器', type: '年报', date: '2026-08', per10: 20 },
  { stock: '中国移动', type: '年报', date: '2026-09', per10: 22 },
  { stock: '中国平安', type: '中报', date: '2026-10', per10: 9.5 },
  { stock: '招商银行', type: '中报', date: '2027-01', per10: 10 },
];

function fetchStock(secid) {
  return new Promise((resolve, reject) => {
    const url = 'https://push2.eastmoney.com/api/qt/stock/get?secid=' + secid +
      '&fields=f43,f44,f45,f46,f48,f50,f60,f162,f167,f116,f169&invt=2&fltt=2';
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/' }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getAllStockData() {
  const results = [];
  for (const s of STOCKS) {
    try {
      const resp = await fetchStock(s.market + '.' + s.code);
      const d = (resp && resp.data) ? resp.data : {};
      const price = d.f43 || 0;
      const pos = POSITIONS[s.code] || { shares: 0, cost: 0 };

      results.push({
        code: s.code, name: s.name, role: s.role,
        price: price,
        prevClose: d.f60 || 0,
        changePct: ((d.f60 || 0) > 0) ? ((price - (d.f60 || 0)) / (d.f60 || 1) * 100) : 0,
        change: d.f169 || 0,
        high: d.f44 || 0,
        low: d.f45 || 0,
        open: d.f46 || 0,
        volume: d.f47 || 0,
        amount: d.f48 || 0,
        pe: d.f162 || 0,
        pb: d.f167 || 0,
        marketCap: (d.f116 || 0) / 1e8,
        divPerShare: s.divPerShare,
        divRate: price > 0 ? (s.divPerShare / price * 100) : 0,
        target: s.target,
        distanceToTarget: s.target > 0 ? ((price - s.target) / s.target * 100) : 0,
        position: pos,
        positionValue: (pos.shares || 0) * price,
        positionPnL: pos.shares > 0 ? pos.shares * (price - pos.cost) : 0,
        annualDiv: (pos.shares || 0) * s.divPerShare,
      });
    } catch (e) {
      console.error(s.name, 'API error:', e.message);
      results.push({ code: s.code, name: s.name, role: s.role, error: true });
    }
  }
  results.sort((a, b) => (a.distanceToTarget || 999) - (b.distanceToTarget || 999));
  return {
    stocks: results,
    totals: {
      marketValue: results.reduce((s, r) => s + (r.positionValue || 0), 0),
      totalPnL: results.reduce((s, r) => s + (r.positionPnL || 0), 0),
      annualDiv: results.reduce((s, r) => s + (r.annualDiv || 0), 0),
    },
    dividendCalendar: DIVIDEND_CALENDAR,
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

// Simple in-memory cache
let cacheData = null;
let cacheTime = 0;
const TTL = 15000;

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/api/stocks') {
    const now = Date.now();
    if (!cacheData || now - cacheTime > TTL) {
      cacheData = await getAllStockData();
      cacheTime = now;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(cacheData));
    return;
  }

  let fp = req.url === '/' ? '/index.html' : req.url;
  fp = path.join(__dirname, 'public', fp);
  const ext = path.extname(fp);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });

}).listen(3000, () => console.log('📊 http://localhost:3000'));
