// pages/api/screener.js
// 大数投资筛选：PE<20 且 PB<2，按52周位置排序
// 数据来源：东方财富行情 + 新浪日线
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '只支持 GET' });
  }

  try {
    // 1. 获取沪深A股全量股票列表
    const listRes = await fetch(
      'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:1+t:2,m:1+t:23&fields=f12,f14,f3,f23,f57,f58',
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.eastmoney.com' } }
    );
    const listText = await listRes.text();
    let listData;
    try { listData = JSON.parse(listText); } catch(e) { return res.status(500).json({ error: '获取股票列表失败' }); }

    const allStocks = listData?.data?.diff || [];
    console.log('全量股票数量:', allStocks.length);

    // 2. 分批获取详细数据（腾讯批量接口，每次50个）
    const batchSize = 50;
    const validStocks = [];

    for (let i = 0; i < allStocks.length; i += batchSize) {
      const batch = allStocks.slice(i, i + batchSize);
      const codes = batch.map(s => {
        const c = s.f12;
        if (c.startsWith('6')) return 'sh' + c;
        return 'sz' + c;
      }).join(',');

      try {
        const batchRes = await fetch(`https://qt.gtimg.cn/q=${codes}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const batchText = await batchRes.text();
        const lines = batchText.split('\n').filter(l => l.trim() && l.includes('"'));

        for (const line of lines) {
          const raw = line.match(/"([^"]+)"/)?.[1] || '';
          const f = raw.split('~');
          if (!f[3] || !f[39]) continue;

          const price = parseFloat(f[3]) || 0;
          const pe = parseFloat(f[39]);   // 字段[39] = PE
          const pb = parseFloat(f[46]);   // 字段[46] = PB
          const high52 = parseFloat(f[41]) || null;
          const low52 = parseFloat(f[42]) || null;
          const name = f[40] || f[1] || '';
          const code = f[2] || '';

          // 大数投资核心条件：PE<=20 且 PB<=2
          if (pe > 0 && pe <= 20 && pb > 0 && pb <= 2) {
            let week52Pos = null;
            if (high52 && low52 && high52 > low52) {
              week52Pos = Math.round(((price - low52) / (high52 - low52)) * 1000) / 10;
            }

            const suggestion = week52Pos !== null
              ? (week52Pos < 30 ? 'buy' : week52Pos > 70 ? 'sell' : 'hold')
              : 'unknown';

            validStocks.push({
              code: code,
              name,
              price,
              pe: Math.round(pe * 100) / 100,
              pb: Math.round(pb * 100) / 100,
              high52,
              low52,
              week52Pos,
              suggestion,
              peOk: true,
              pbOk: true,
            });
          }
        }
      } catch(e) {
        console.error('Batch error at', i, e.message);
      }

      // 限速：每批间隔 200ms
      await new Promise(r => setTimeout(r, 200));
    }

    // 3. 按52周位置排序（越低越值得买）
    validStocks.sort((a, b) => {
      if (a.week52Pos === null && b.week52Pos === null) return 0;
      if (a.week52Pos === null) return 1;
      if (b.week52Pos === null) return -1;
      return a.week52Pos - b.week52Pos;
    });

    console.log('符合条件股票数量:', validStocks.length);

    res.status(200).json({
      total: validStocks.length,
      stocks: validStocks,
      peCriterion: 'PE ≤ 20',
      pbCriterion: 'PB ≤ 2',
    });
  } catch (err) {
    console.error('Screener error:', err);
    res.status(500).json({ error: '筛选失败', detail: err.message });
  }
}
