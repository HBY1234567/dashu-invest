// pages/api/search.js
// 新浪股票搜索 API - 按代码或名称搜索股票
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '只支持 GET' });
  }

  const { q } = req.query;
  if (!q || q.trim().length < 1) {
    return res.status(200).json({ stocks: [] });
  }

  // 使用新浪股票搜索接口
  const url = `https://suggest3.sinajs.cn/suggest/type=11,12,13,14,15&key=${encodeURIComponent(q.trim())}&encoding=gb2312`;

  fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://finance.sina.com.cn',
    }
  })
  .then(r => r.text())
  .then(text => {
    // 格式: var suggestresult ="code,name,code,name,...",code,name,...
    const match = text.match(/="([^"]+)"/);
    if (!match) return res.status(200).json({ stocks: [] });

    const raw = match[1];
    // 每个股票用逗号分隔: code,name,type,code,name,type...
    const parts = raw.split(',');
    const stocks = [];

    for (let i = 0; i < parts.length - 2; i += 3) {
      const code = parts[i];
      const name = parts[i + 1];
      const type = parts[i + 2] || '';

      // 只保留 A 股 (sh=上海, sz=深圳, bj=北京)
      if (code && (code.startsWith('sh6') || code.startsWith('sz0') || code.startsWith('sz3') || code.startsWith('bj'))) {
        const pureCode = code.replace(/^(sh|sz|bj)/, '');
        stocks.push({ code, pureCode, name, market: code.startsWith('sh') ? 'sh' : code.startsWith('sz') ? 'sz' : 'bj' });
      }
    }

    res.status(200).json({ stocks });
  })
  .catch(err => {
    console.error('Search error:', err);
    res.status(500).json({ error: '搜索失败', detail: err.message });
  });
}
