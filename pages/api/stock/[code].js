// pages/api/stock/[code].js
// 获取股票详情：PE、PB、52周位置、当前价等
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '只支持 GET' });
  }

  const { code } = req.query;
  if (!code) return res.status(400).json({ error: '缺少股票代码' });

  // 标准化代码
  let secid = code;
  if (/^\d{6}$/.test(code)) {
    if (code.startsWith('6')) secid = '1.' + code;
    else if (code.startsWith('0') || code.startsWith('3')) secid = '0.' + code;
    else if (code.startsWith('4') || code.startsWith('8')) secid = '0.' + code;
    else secid = '1.' + code;
  } else if (code.startsWith('sh')) secid = '1.' + code.replace('sh', '');
  else if (code.startsWith('sz')) secid = '0.' + code.replace('sz', '');
  else if (code.startsWith('bj')) secid = '0.' + code.replace('bj', '');

  try {
    // 并行请求：当前行情 + 52周日线数据
    const [quoteRes, klineRes] = await Promise.all([
      fetch(
        `https://push2.eastmoney.com/api/qt/stock/get?ut=fa5fd1943c7b386f172d6893dbfba10b&invt=2&fltt=2&fields=f57,f58,f43,f44,f45,f46,f47,f48,f50,f51,f52,f53,f54,f55,f116,f117,f162,f163,f167,f168,f169,f170,f171&secid=${secid}`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.eastmoney.com' } }
      ),
      // 52周按月线 (约44根月线)
      fetch(
        `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=102&fqt=1&beg=20240101&end=20991231&smplmt=44&lmt=44`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.eastmoney.com' } }
      )
    ]);

    const quoteText = await quoteRes.text();
    const klineText = await klineRes.text();

    let quote = null;
    try { quote = JSON.parse(quoteText); } catch(e) {}

    let klineData = null;
    try { klineData = JSON.parse(klineText); } catch(e) {}

    const data = quote?.data;
    if (!data) {
      // fallback: 用腾讯接口
      return fetch(`https://qt.gtimg.cn/q=${secid.replace('.', '')}`)
        .then(r => r.text())
        .then(text => {
          const raw = text.match(/"([^"]+)"/)?.[1] || '';
          const f = raw.split('~');
          if (!f[3]) return res.status(404).json({ error: '股票未找到' });
          const price = parseFloat(f[3]) || 0;
          const pe = parseFloat(f[39]) || null;
          const pb = parseFloat(f[46]) || null;
          const high52 = parseFloat(f[41]) || null;
          const low52 = parseFloat(f[42]) || null;
          const week52Pos = (high52 && low52 && high52 > low52)
            ? ((price - low52) / (high52 - low52)) * 100 : null;
          return res.status(200).json({
            code: secid, name: f[40] || f[1] || '', price, pe, pb,
            high52, low52, week52Pos,
            suggestion: week52Pos !== null
              ? (week52Pos < 30 ? '🟢 建议买入' : week52Pos > 70 ? '🔴 建议卖出' : '🟡 持有')
              : '⚪ 数据不足',
          });
        });
    }

    const name = data.f58 || data.f57 || '';
    const price = data.f43 || 0;
    const pe = data.f162 || null;
    const pb = data.f167 || null;
    const high52 = data.f168 || null;
    const low52 = data.f169 || null;

    // 计算52周位置
    let week52Pos = null;
    if (high52 && low52 && high52 > low52 && price) {
      week52Pos = ((price - low52) / (high52 - low52)) * 100;
    }

    // 如果东方财富没有52周数据，尝试用月线计算
    if (week52Pos === null && klineData?.data?.klines) {
      const klines = klineData.data.klines;
      const highs = klines.map(k => parseFloat(k.split(',')[2])).filter(v => v > 0);
      const lows = klines.map(k => parseFloat(k.split(',')[3])).filter(v => v > 0);
      const calcHigh = Math.max(...highs);
      const calcLow = Math.min(...lows);
      if (calcHigh > calcLow && price) {
        const calcPos = ((price - calcLow) / (calcHigh - calcLow)) * 100;
        week52Pos = calcPos;
      }
    }

    const suggestion = week52Pos !== null
      ? (week52Pos < 30 ? '🟢 建议买入' : week52Pos > 70 ? '🔴 建议卖出' : '🟡 持有')
      : '⚪ 数据不足';

    res.status(200).json({
      code: secid,
      name,
      price: parseFloat(price),
      pe: pe ? parseFloat(pe) : null,
      pb: pb ? parseFloat(pb) : null,
      high52: high52 ? parseFloat(high52) : null,
      low52: low52 ? parseFloat(low52) : null,
      week52Pos: week52Pos !== null ? Math.round(week52Pos * 10) / 10 : null,
      suggestion,
      peOk: pe ? parseFloat(pe) <= 20 : null,
      pbOk: pb ? parseFloat(pb) <= 2 : null,
      peCriterion: 'PE ≤ 20',
      pbCriterion: 'PB ≤ 2',
    });
  } catch (err) {
    console.error('Stock detail error:', err);
    res.status(500).json({ error: '获取数据失败', detail: err.message });
  }
}
