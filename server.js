// server.js — 大数投资代理服务器（内置模块，无需 npm）
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');
const PORT = process.env.PORT || 3000;
const MIME = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json'};
const GBK_DECODER = new TextDecoder('gbk');

// ── 硬编码热门股池（常见大市值A股）──────────────────────────────
const STOCKS = [
  // 银行
  {code:'sh601398',name:'工商银行'},{code:'sh601939',name:'建设银行'},{code:'sh601288',name:'农业银行'},
  {code:'sh601988',name:'中国银行'},{code:'sh600036',name:'招商银行'},{code:'sh600000',name:'浦发银行'},
  {code:'sh601166',name:'兴业银行'},{code:'sh600016',name:'民生银行'},{code:'sh600015',name:'华夏银行'},
  // 保险/券商
  {code:'sh601318',name:'中国平安'},{code:'sh601628',name:'中国人寿'},{code:'sh601601',name:'中国太保'},
  {code:'sh600030',name:'中信证券'},{code:'sh300059',name:'东方财富'},{code:'sh600570',name:'恒生电子'},
  // 能源
  {code:'sh601857',name:'中国石油'},{code:'sh600028',name:'中国石化'},{code:'sh600938',name:'中国海油'},
  {code:'sh601088',name:'中国神华'},{code:'sh600900',name:'长江电力'},
  // 白酒/消费
  {code:'sh600519',name:'贵州茅台'},{code:'sz000858',name:'五粮液'},{code:'sh600809',name:'山西汾酒'},
  {code:'sh600887',name:'伊利股份'},{code:'sh600690',name:'海尔智家'},{code:'sz000333',name:'美的集团'},
  {code:'sh600276',name:'恒瑞医药'},{code:'sz000651',name:'格力电器'},
  // 科技/互联网
  {code:'sh600050',name:'中国联通'},{code:'sh600941',name:'中国移动'},{code:'sh600588',name:'用友网络'},
  {code:'sh600570',name:'恒生电子'},{code:'sh601012',name:'隆基绿能'},
  // 地产/基建
  {code:'sz000002',name:'万科A'},{code:'sh600048',name:'保利发展'},{code:'sh601668',name:'中国建筑'},
  {code:'sh601186',name:'中国铁建'},{code:'sh601390',name:'中国中铁'},
  // 工业/制造
  {code:'sh600019',name:'宝钢股份'},{code:'sh601766',name:'中国中车'},{code:'sh600031',name:'三一重工'},
  {code:'sz000651',name:'格力电器'},{code:'sz000333',name:'美的集团'},
  // 汽车
  {code:'sh600104',name:'上汽集团'},{code:'sz002594',name:'比亚迪'},{code:'sh601633',name:'长城汽车'},
  {code:'sh600741',name:'华域汽车'},
  // 医药
  {code:'sz300760',name:'迈瑞医疗'},{code:'sh603259',name:'药明康德'},{code:'sz300015',name:'爱尔眼科'},
  // 有色/矿产
  {code:'sh601899',name:'紫金矿业'},{code:'sh603993',name:'洛阳钼业'},{code:'sh600362',name:'江西铜业'},
  // 化工
  {code:'sh600309',name:'万华化学'},{code:'sh600160',name:'浙江龙盛'},
  // 航运
  {code:'sh601919',name:'中远海控'},{code:'sh601872',name:'招商轮船'},
  // 航空
  {code:'sh601111',name:'中国国航'},{code:'sh600029',name:'南方航空'},{code:'sh600115',name:'东方航空'},
  // 食品/日化
  {code:'sh600887',name:'伊利股份'},{code:'sh600315',name:'上海家化'},{code:'sh600438',name:'通威股份'},
  // 军工
  {code:'sh600760',name:'中航沈飞'},{code:'sh000768',name:'中航西飞'},{code:'sh600893',name:'航发动力'},
  // ETF/指数（不支持 PE/PB，仅供参考）
  {code:'sh510300',name:'沪深300ETF'},{code:'sh510500',name:'中证500ETF'},{code:'sh510050',name:'上证50ETF'},
  {code:'sh159915',name:'创业板ETF'},{code:'sh512880',name:'证券ETF'},{code:'sh512660',name:'军工ETF'},
  {code:'sh518880',name:'黄金ETF'},{code:'sh513500',name:'标普500ETF'},
  // 造纸/轻工
  {code:'sh600308',name:'华泰股份'},{code:'sh601828',name:'美凯龙'},
  // 煤炭
  {code:'sh601225',name:'陕西煤业'},{code:'sh600188',name:'兖矿能源'},
  // 环保/新能源
  {code:'sh600905',name:'三峡能源'},{code:'sh600274',name:'阳光电源'},{code:'sz300274',name:'阳光电源'},
  {code:'sh601615',name:'明阳智能'},{code:'sh002459',name:'晶澳科技'},
  // 半导体/电子
  {code:'sh688981',name:'中芯国际'},{code:'sh603986',name:'兆易创新'},{code:'sz002475',name:'立讯精密'},
  // 游戏/传媒
  {code:'sz002555',name:'三七互娱'},{code:'sh600637',name:'东方明珠'},
  // 通信设备
  {code:'sh600487',name:'亨通光电'},{code:'sh601869',name:'长飞光纤'},{code:'sz300498',name:'温氏股份'},
];

// 去除重复（以 code 为准）
const STOCK_MAP = {};
STOCKS.forEach(s => { STOCK_MAP[s.code] = s; });
const STOCK_LIST = Object.values(STOCK_MAP);

// ── 实践表文件路径 ──────────────────────────────────────────────
const PRACTICE_FILE = path.join(__dirname, 'practice.json');
function loadPractice() {
  try {
    if (fs.existsSync(PRACTICE_FILE)) {
      const data = fs.readFileSync(PRACTICE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch(e) {}
  return [];
}
function savePractice(list) {
  fs.writeFileSync(PRACTICE_FILE, JSON.stringify(list, null, 2), 'utf8');
}

// ── HTTP 工具 ───────────────────────────────────────────────────
function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://gu.qq.com', ...(opts.headers||{}) }
    }, res => {
      const bufs = [];
      res.on('data', d => bufs.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(bufs);
        resolve({ status: res.statusCode, body: opts.raw ? buf : buf.toString(opts.encoding || 'utf8') });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ── 搜索：本地股池模糊匹配 ─────────────────────────────────────
function fuzzyMatch(stocks, q) {
  const ql = q.toLowerCase().trim();
  if (!ql) return [];
  const results = [];
  for (const s of stocks) {
    const name = s.name.toLowerCase();
    const code = s.code.toLowerCase();
    // 精确代码（含前缀）= 100分
    if (code === ql || code === 'sh'+ql || code === 'sz'+ql || code === ql.replace(/^(sh|sz)/,'')) {
      results.push({ ...s, _score: 100 });
      continue;
    }
    // 代码尾部匹配
    if (code.endsWith(ql) && ql.length >= 3) {
      results.push({ ...s, _score: 80 });
      continue;
    }
    // 名称包含 = 80分
    if (name.includes(ql)) {
      results.push({ ...s, _score: 80 });
      continue;
    }
    // 拼音首字母（粗略实现：取汉字首字符码值作比较）
    // 简化：名称前 n 个字匹配
    let matched = false;
    for (let n = 1; n <= name.length; n++) {
      if (name.startsWith(ql) && ql.length >= n) {
        results.push({ ...s, _score: 60 + n * 5 });
        matched = true; break;
      }
    }
  }
  results.sort((a, b) => b._score - a._score);
  return results.slice(0, 10).map(({_score, ...s}) => s);
}

// ── 股票详情（腾讯行情） ────────────────────────────────────────
async function apiStockDetail(code) {
  try {
    let secid = code;
    if (/^\d{6}$/.test(code)) secid = code.startsWith('6') ? 'sh' + code : 'sz' + code;
    const { body } = await fetch(`https://qt.gtimg.cn/q=${secid}`, { raw: true });
    const bodyStr = body.toString('binary');
    const dataMatch = bodyStr.match(/="([^"]+)"/);
    if (!dataMatch) return { error: '股票未找到' };
    const f = dataMatch[1].split('~');
    if (!f[3]) return { error: '数据解析失败' };

    const nameBuf = Buffer.from(f[1] || '', 'binary');
    const name = GBK_DECODER.decode(nameBuf);
    const price = parseFloat(f[3]) || 0;
    const pe = parseFloat(f[39]) || null;
    const pb = parseFloat(f[43]) || null;
    const high52 = parseFloat(f[33]) || null;
    const low52 = parseFloat(f[34]) || null;
    const peOk = pe !== null && pe > 0 && pe <= 20;
    const pbOk = pb !== null && pb > 0 && pb <= 2;
    let week52Pos = null;
    if (high52 && low52 && high52 > low52 && price) {
      week52Pos = Math.round(((price - low52) / (high52 - low52)) * 1000) / 10;
    }
    let suggestion = '⚪ 数据不足';
    if (week52Pos !== null) {
      suggestion = week52Pos < 30 ? '🟢 建议买入' : week52Pos > 70 ? '🔴 建议卖出' : '🟡 持有';
    }
    return {
      code, name, price,
      pe: pe !== null ? Math.round(pe * 100) / 100 : null,
      pb: pb !== null ? Math.round(pb * 100) / 100 : null,
      high52, low52, week52Pos, peOk, pbOk,
      peCriterion: '≤ 20', pbCriterion: '≤ 2',
      suggestion,
    };
  } catch(e) {
    return { error: '获取失败: ' + e.message };
  }
}

// ── 实践表 ──────────────────────────────────────────────────────
async function apiPractice() {
  return loadPractice();
}
async function apiAddPractice(payload) {
  const { code, name, buyPrice, shares } = payload;
  if (!code || !buyPrice || !shares) return { error: '参数不完整' };
  const list = loadPractice();
  const existing = list.findIndex(s => s.code === code);
  if (existing >= 0) {
    list[existing] = { ...list[existing], buyPrice, shares, updatedAt: new Date().toISOString() };
  } else {
    list.push({ code, name, buyPrice: parseFloat(buyPrice), shares: parseInt(shares), addedAt: new Date().toISOString() });
  }
  savePractice(list);
  return { success: true, list };
}
async function apiRemovePractice(code) {
  let list = loadPractice();
  const before = list.length;
  list = list.filter(s => s.code !== code);
  savePractice(list);
  return { success: true, removed: before - list.length };
}

// ── HTTP 服务器 ────────────────────────────────────────────────
function parseQuery(url) {
  const q = {};
  const idx = url.indexOf('?');
  if (idx === -1) return q;
  url.slice(idx + 1).split('&').forEach(part => {
    const eq = part.indexOf('=');
    if (eq === -1) return;
    const k = decodeURIComponent(part.slice(0, eq));
    const v = decodeURIComponent(part.slice(eq + 1));
    if (k) q[k] = v;
  });
  return q;
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj, null, 0));
}

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  try {
    // 搜索
    if (urlPath === '/api/search') {
      const q = parseQuery(req.url).q || '';
      const results = fuzzyMatch(STOCK_LIST, q);
      return sendJson(res, 200, { stocks: results });
    }
    // 股票详情
    if (urlPath.startsWith('/api/stock/')) {
      const code = decodeURIComponent(urlPath.replace('/api/stock/', ''));
      return sendJson(res, 200, await apiStockDetail(code));
    }
    // 实践表列表
    if (urlPath === '/api/practice') {
      return sendJson(res, 200, await apiPractice());
    }
    // 添加/更新实践股
    if (urlPath === '/api/practice/add') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      return sendJson(res, 200, await apiAddPractice(payload));
    }
    // 移除实践股
    if (urlPath.startsWith('/api/practice/remove/')) {
      const code = decodeURIComponent(urlPath.replace('/api/practice/remove/', ''));
      return sendJson(res, 200, await apiRemovePractice(code));
    }
    // 静态文件
    const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
    }
  } catch(e) {
    console.error('Server error:', e.message);
    sendJson(res, 500, { error: '服务器错误: ' + e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`大数投资已启动: http://localhost:${PORT}`));
