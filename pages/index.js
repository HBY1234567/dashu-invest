import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'dashu_invest_practice';

// 52周位置颜色
function weekPosColor(pos) {
  if (pos === null) return '#999';
  if (pos < 30) return '#22c55e';
  if (pos > 70) return '#ef4444';
  return '#f59e0b';
}

function weekPosLabel(pos) {
  if (pos === null) return '数据不足';
  if (pos < 30) return `🟢 ${pos}% (建议买入)`;
  if (pos > 70) return `🔴 ${pos}% (建议卖出)`;
  return `🟡 ${pos}% (持有)`;
}

function weekPosBadge(pos) {
  if (pos === null) return null;
  const color = weekPosColor(pos);
  return (
    <span style={{
      display: 'inline-block', background: color, color: '#fff',
      borderRadius: 12, padding: '2px 10px', fontSize: 12, fontWeight: 600,
    }}>
      {pos}%
    </span>
  );
}

// 计算实践表信号
function calcSignal(item, currentPrice) {
  if (!item.buyPrice || !currentPrice) return { signal: '持有', color: '#f59e0b' };
  const pos = item.week52PosAtBuy;
  if (pos === null || pos === undefined) return { signal: '持有', color: '#f59e0b' };
  if (pos < 30) return { signal: '买入', color: '#22c55e' };
  if (pos > 70) return { signal: '卖出', color: '#ef4444' };
  return { signal: '持有', color: '#f59e0b' };
}

export default function Home() {
  const [tab, setTab] = useState('search'); // 'search' | 'practice'
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [practice, setPractice] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ code: '', name: '', buyPrice: '', shares: '', note: '' });
  const [livePrices, setLivePrices] = useState({}); // code -> {price, pe, pb, week52Pos, suggestion}

  const searchTimer = useRef(null);
  const pricesTimer = useRef(null);

  // 加载本地实践表
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setPractice(JSON.parse(saved));
    } catch(e) {}
  }, []);

  // 保存实践表
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(practice));
    } catch(e) {}
  }, [practice]);

  // 搜索防抖
  const handleSearchChange = (val) => {
    setQuery(val);
    clearTimeout(searchTimer.current);
    if (!val.trim()) { setSearchResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        const d = await r.json();
        setSearchResults(d.stocks?.slice(0, 20) || []);
      } catch(e) { setSearchResults([]); }
      setSearching(false);
    }, 350);
  };

  // 查看股票详情
  const viewStock = async (stock) => {
    setSelectedStock(stock);
    setLoadingDetail(true);
    try {
      const r = await fetch(`/api/stock/${stock.code}`);
      const d = await r.json();
      setSelectedStock(d);
      // 更新实践表中的实时价格
      setLivePrices(prev => ({ ...prev, [stock.code]: d }));
    } catch(e) {}
    setLoadingDetail(false);
  };

  // 加入实践表
  const addToPractice = (stock) => {
    setAddForm({
      code: stock.pureCode || stock.code?.replace(/^(sh|sz|bj)/, ''),
      name: stock.name,
      buyPrice: stock.price || '',
      shares: '',
      note: '',
      week52PosAtBuy: stock.week52Pos,
      peAtBuy: stock.pe,
      pbAtBuy: stock.pb,
    });
    setShowAddModal(true);
  };

  const submitAdd = () => {
    if (!addForm.code || !addForm.name) return;
    const item = {
      id: Date.now(),
      code: addForm.code,
      name: addForm.name,
      buyPrice: parseFloat(addForm.buyPrice) || null,
      shares: parseFloat(addForm.shares) || null,
      note: addForm.note,
      week52PosAtBuy: addForm.week52PosAtBuy,
      peAtBuy: addForm.peAtBuy,
      pbAtBuy: addForm.pbAtBuy,
      addedAt: new Date().toISOString(),
    };
    setPractice(p => [...p, item]);
    setShowAddModal(false);
  };

  // 刷新实践表实时价格
  const refreshLivePrices = useCallback(async () => {
    if (practice.length === 0) return;
    const codes = practice.map(p => {
      const code = p.code;
      if (code.startsWith('6')) return 'sh' + code;
      if (code.startsWith(('0'||'3'))) return 'sz' + code;
      return 'sz' + code;
    });
    try {
      const r = await fetch(`/api/screener`);
      const d = await r.json();
      // 从筛选结果中匹配
      const map = {};
      for (const s of (d.stocks || [])) {
        map[s.code] = s;
      }
      const newPrices = {};
      for (const item of practice) {
        const found = map[item.code] || livePrices[item.code];
        if (found) newPrices[item.code] = found;
      }
      setLivePrices(prev => ({ ...prev, ...newPrices }));
    } catch(e) {}
  }, [practice]);

  useEffect(() => {
    if (tab === 'practice' && practice.length > 0) {
      refreshLivePrices();
      pricesTimer.current = setInterval(refreshLivePrices, 30000);
    }
    return () => clearInterval(pricesTimer.current);
  }, [tab, practice.length, refreshLivePrices]);

  const removeFromPractice = (id) => setPractice(p => p.filter(i => i.id !== id));

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0', fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif' }}>
      {/* 顶部标题 */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)', padding: '20px 16px 16px', borderBottom: '1px solid #1e293b' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 2 }}>📈 大数投资</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>PE≤20 · PB≤2 · 52周位置排序</div>
      </div>

      {/* Tab 切换 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', background: '#1e293b' }}>
        {[
          { key: 'search', label: '🔍 股票查询', icon: '🔍' },
          { key: 'practice', label: `📋 实践表${practice.length ? ` (${practice.length})` : ''}`, icon: '📋' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '14px 0', background: 'none', border: 'none',
            color: tab === t.key ? '#60a5fa' : '#64748b',
            borderBottom: tab === t.key ? '2px solid #60a5fa' : '2px solid transparent',
            fontSize: 15, fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer',
            transition: 'all 0.2s',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {/* ====== 查询页面 ====== */}
        {tab === 'search' && (
          <div>
            {/* 搜索框 */}
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input
                value={query}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="输入股票代码或名称，如 600519、茅台"
                style={{ width: '100%', padding: '12px 40px 12px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 10, color: '#e2e8f0', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#60a5fa'}
                onBlur={e => e.target.style.borderColor = '#334155'}
              />
              {searching && <span style={{ position: 'absolute', right: 14, top: 12, color: '#60a5fa', fontSize: 14 }}>搜索中…</span>}
            </div>

            {/* 搜索结果 */}
            {searchResults.length > 0 && (
              <div style={{ background: '#1e293b', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                {searchResults.map(s => (
                  <div key={s.code} onClick={() => viewStock(s)} style={{
                    padding: '12px 14px', borderBottom: '1px solid #0f172a', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.code.replace(/^(sh|sz|bj)/, '').toUpperCase()}</div>
                    </div>
                    <div style={{ color: '#64748b', fontSize: 13 }}>查看 →</div>
                  </div>
                ))}
              </div>
            )}

            {/* 详情卡片 */}
            {selectedStock && (
              <div style={{ background: '#1e293b', borderRadius: 14, padding: 20, border: '1px solid #334155' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{selectedStock.name}</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{selectedStock.code?.replace('.', '')}</div>
                  </div>
                  {loadingDetail ? (
                    <span style={{ color: '#60a5fa', fontSize: 14 }}>加载中…</span>
                  ) : (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>{selectedStock.price ? `¥${selectedStock.price}` : '—'}</div>
                      {selectedStock.pe !== undefined && selectedStock.pe !== null && (
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>涨跌幅 {selectedStock.pe}</div>
                      )}
                    </div>
                  )}
                </div>

                {!loadingDetail && (
                  <>
                    {/* PE PB 指标 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                      {[
                        { label: '市盈率 PE', value: selectedStock.pe !== null ? selectedStock.pe : '—', ok: selectedStock.peOk, criterion: '≤ 20', field: 'pe' },
                        { label: '市净率 PB', value: selectedStock.pb !== null ? selectedStock.pb : '—', ok: selectedStock.pbOk, criterion: '≤ 2', field: 'pb' },
                      ].map(m => (
                        <div key={m.field} style={{ background: '#0f172a', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{m.label}</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: m.value !== '—' ? (m.ok ? '#22c55e' : '#ef4444') : '#64748b' }}>
                            {m.value !== '—' ? m.value : '—'}
                          </div>
                          <div style={{ fontSize: 10, color: m.value !== '—' ? (m.ok ? '#22c55e' : '#ef4444') : '#64748b', marginTop: 2 }}>
                            {m.value !== '—' ? (m.ok ? '✅ 符合' : '❌ 不符合') : '数据不足'}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 52周位置 */}
                    <div style={{ background: '#0f172a', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: '#64748b' }}>52周价格位置</span>
                        {weekPosBadge(selectedStock.week52Pos)}
                      </div>
                      {selectedStock.high52 && selectedStock.low52 && (
                        <div style={{ fontSize: 11, color: '#475569', marginBottom: 6 }}>
                          52周最高 ¥{selectedStock.high52} · 52周最低 ¥{selectedStock.low52}
                        </div>
                      )}
                      {/* 位置条 */}
                      {selectedStock.week52Pos !== null && (
                        <div style={{ background: '#1e293b', borderRadius: 6, height: 10, position: 'relative', overflow: 'hidden' }}>
                          <div style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0,
                            width: `${selectedStock.week52Pos}%`,
                            background: weekPosColor(selectedStock.week52Pos),
                            transition: 'width 0.3s',
                          }} />
                          <div style={{
                            position: 'absolute', left: '30%', top: 0, bottom: 0,
                            width: 1, background: 'rgba(255,255,255,0.3)',
                          }} />
                          <div style={{
                            position: 'absolute', left: '70%', top: 0, bottom: 0,
                            width: 1, background: 'rgba(255,255,255,0.3)',
                          }} />
                        </div>
                      )}
                      {selectedStock.week52Pos !== null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#475569', marginTop: 4 }}>
                          <span>最低</span>
                          <span style={{ color: '#22c55e' }}>←买入线 30%</span>
                          <span>持有</span>
                          <span style={{ color: '#ef4444' }}>卖出线 70%→</span>
                          <span>最高</span>
                        </div>
                      )}
                    </div>

                    {/* 信号 */}
                    {selectedStock.week52Pos !== null && (
                      <div style={{
                        textAlign: 'center', padding: '12px', borderRadius: 10,
                        background: weekPosColor(selectedStock.week52Pos) + '22',
                        border: `1px solid ${weekPosColor(selectedStock.week52Pos)}44`,
                        fontSize: 15, fontWeight: 700,
                        color: weekPosColor(selectedStock.week52Pos),
                        marginBottom: 14,
                      }}>
                        {weekPosLabel(selectedStock.week52Pos)}
                      </div>
                    )}

                    {/* 加入实践表按钮 */}
                    <button onClick={() => addToPractice(selectedStock)} style={{
                      width: '100%', padding: '13px', background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                      border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                    }}>
                      ➕ 加入实践表
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ====== 实践表 ====== */}
        {tab === 'practice' && (
          <div>
            {practice.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#475569' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>实践表是空的</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>去「股票查询」里找股票加入吧</div>
              </div>
            ) : (
              <div>
                {practice.map(item => {
                  const live = livePrices[item.code] || {};
                  const currentPrice = live.price || item.buyPrice;
                  const { signal, color } = calcSignal(item, currentPrice);
                  const gain = item.buyPrice && currentPrice ? (((currentPrice - item.buyPrice) / item.buyPrice) * 100).toFixed(2) : null;

                  return (
                    <div key={item.id} style={{ background: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10, border: '1px solid #334155' }}>
                      {/* 股票名称 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{item.name}</div>
                          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{item.code}</div>
                        </div>
                        <button onClick={() => removeFromPractice(item.id)} style={{
                          background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18,
                        }}>✕</button>
                      </div>

                      {/* 买入信息 */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                        {[
                          { label: '买入价', value: item.buyPrice ? `¥${item.buyPrice}` : '未填' },
                          { label: '数量', value: item.shares ? `${item.shares}股` : '未填' },
                          { label: '当前价', value: currentPrice ? `¥${currentPrice}` : '加载中…' },
                        ].map(m => (
                          <div key={m.label} style={{ background: '#0f172a', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{m.label}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginTop: 2 }}>{m.value}</div>
                          </div>
                        ))}
                      </div>

                      {/* 盈亏 */}
                      {gain !== null && (
                        <div style={{ textAlign: 'center', fontSize: 14, color: parseFloat(gain) >= 0 ? '#ef4444' : '#22c55e', marginBottom: 8 }}>
                          {parseFloat(gain) >= 0 ? '+' : ''}{gain}% ({parseFloat(gain) >= 0 ? '+' : ''}¥{((currentPrice - item.buyPrice) * (item.shares || 1)).toFixed(0)})
                        </div>
                      )}

                      {/* 信号 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, background: '#0f172a', color: '#64748b', padding: '2px 8px', borderRadius: 6 }}>
                            PE {item.peAtBuy || '?'}→{live.pe || '?'}
                          </span>
                          <span style={{ fontSize: 11, background: '#0f172a', color: '#64748b', padding: '2px 8px', borderRadius: 6 }}>
                            PB {item.pbAtBuy || '?'}→{live.pb || '?'}
                          </span>
                          <span style={{ fontSize: 11, background: '#0f172a', color: '#64748b', padding: '2px 8px', borderRadius: 6 }}>
                            52周 {item.week52PosAtBuy ? `${item.week52PosAtBuy}%` : '?'}→{live.week52Pos ? `${live.week52Pos}%` : '?'}
                          </span>
                        </div>
                        <div style={{
                          padding: '4px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                          background: color + '22', color: color,
                        }}>
                          {signal}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* 底部说明 */}
            {practice.length > 0 && (
              <div style={{ textAlign: 'center', padding: '12px', fontSize: 11, color: '#475569' }}>
                数据每30秒自动刷新 · 买卖规则：52周位置&lt;30%买入，30%-70%持有，&gt;70%卖出
              </div>
            )}
          </div>
        )}
      </div>

      {/* 添加弹窗 */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100,
          display: 'flex', alignItems: 'flex-end',
        }} onClick={e => e.target === e.currentTarget && setShowAddModal(false)}>
          <div style={{
            background: '#1e293b', borderRadius: '16px 16px 0 0', padding: 24, width: '100%',
            border: '1px solid #334155',
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 16 }}>加入实践表</div>
            {[
              { label: '股票代码', key: 'code', placeholder: '如 600519', disabled: true },
              { label: '股票名称', key: 'name', placeholder: '如 贵州茅台', disabled: true },
              { label: '买入价格（元）', key: 'buyPrice', placeholder: '填你计划/实际的买入价', type: 'number' },
              { label: '买入数量（股）', key: 'shares', placeholder: '填买入多少股', type: 'number' },
              { label: '备注', key: 'note', placeholder: '选填，如「计划买入」' },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>{field.label}</div>
                <input
                  value={addForm[field.key]}
                  onChange={e => setAddForm(f => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  disabled={field.disabled}
                  type={field.type || 'text'}
                  style={{
                    width: '100%', padding: '10px 12px', background: '#0f172a', border: '1px solid #334155',
                    borderRadius: 8, color: field.disabled ? '#64748b' : '#e2e8f0', fontSize: 14,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowAddModal(false)} style={{
                flex: 1, padding: '12px', background: '#0f172a', border: '1px solid #334155',
                borderRadius: 10, color: '#94a3b8', fontSize: 15, cursor: 'pointer',
              }}>取消</button>
              <button onClick={submitAdd} style={{
                flex: 2, padding: '12px', background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              }}>确认添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
