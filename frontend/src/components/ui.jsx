import React, { useEffect, useState } from 'react';
import { fmt } from '../api';

export function StatusBadge({ status }) {
  if (!status) return null;
  return <span className={`badge ${status}`}>{status.replaceAll('_', ' ')}</span>;
}

// JazzCash-style direction badge: incoming (green), outgoing (red), pending (amber)
export function DirBadge({ dir, label }) {
  const map = { in: ['in', '↑ Incoming'], out: ['out', '↓ Outgoing'], pending: ['pending', '◔ Pending'] };
  const [cls, text] = map[dir] || ['', label || ''];
  return <span className={`badge dir ${cls}`}>{label || text}</span>;
}

// Statement filters (JazzCash-style): direction, type, date-range
export function StatementFilters({ value, onChange, onReset }) {
  return (
    <div className="filters">
      <select value={value.direction} onChange={(e) => onChange({ ...value, direction: e.target.value, page: 1 })}>
        <option value="">All Directions</option>
        <option value="in">↑ Incoming (paisa aya)</option>
        <option value="out">↓ Outgoing (paisa gaya)</option>
      </select>
      <select value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value, page: 1 })}>
        <option value="">All Types</option>
        <option value="topup">Top-up</option>
        <option value="hold">Escrow Hold</option>
        <option value="release">Release</option>
        <option value="refund">Refund</option>
        <option value="payout">Payout</option>
        <option value="penalty">Penalty</option>
        <option value="commission">Commission</option>
      </select>
      <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value, page: 1 })} title="From date" />
      <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value, page: 1 })} title="To date" />
      <button className="btn small secondary" onClick={onReset}>Reset</button>
    </div>
  );
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.total_pages <= 1) return null;
  const { page, total_pages, total } = pagination;
  return (
    <div className="pagination">
      <button className="btn small secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
      <span className="muted">Page {page} / {total_pages} · {total} records</span>
      <button className="btn small secondary" disabled={page >= total_pages} onClick={() => onPage(page + 1)}>Next ›</button>
    </div>
  );
}

// Full JazzCash-style statement: summary cards + filters + paginated ledger
// fetcher(filters) must return { summary, rows, pagination }
export function StatementView({ fetcher, title = 'Statement', subtitle }) {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ direction: '', type: '', from: '', to: '', page: 1 });
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetcher(filters)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [filters]);

  const s = data?.summary;
  return (
    <>
      {error && <div className="alert error">{error}</div>}
      {s && (
        <div className="grid cols-4">
          <div className="card stat"><span className="value td-amt-in">+ {fmt(s.total_in)}</span><span className="label">Total Incoming</span><span className="hint">top-ups + refunds + payouts</span></div>
          <div className="card stat"><span className="value td-amt-out">− {fmt(s.total_out)}</span><span className="label">Total Outgoing</span><span className="hint">holds + releases + penalties</span></div>
          <div className="card stat"><span className="value" style={{ color: '#b7791f' }}>{s.pending_withdrawals ? `${s.pending_withdrawals} · ${fmt(s.pending_withdrawals_amount)}` : '0'}</span><span className="label">Pending Withdrawals</span><span className="hint">admin approval ka wait</span></div>
          <div className="card stat"><span className="value" style={{ color: s.pending_penalty > 0 ? 'var(--danger)' : 'inherit' }}>{s.pending_penalty > 0 ? fmt(s.pending_penalty) : '0'}</span><span className="label">Pending Penalty (owed)</span><span className="hint">agle payout se auto-cut</span></div>
        </div>
      )}
      <div className="card">
        <h2>{title}</h2>
        {subtitle && <p className="muted mb">{subtitle}</p>}
        <StatementFilters value={filters} onChange={setFilters} onReset={() => setFilters({ direction: '', type: '', from: '', to: '', page: 1 })} />
        {!data && <p className="muted">Loading statement…</p>}
        {data && data.rows.length === 0 && <Empty>No transactions match these filters.</Empty>}
        {data && data.rows.length > 0 && (
          <>
            <table>
              <thead>
                <tr><th>Date & Time</th><th>Direction</th><th>Type</th><th>Kis ke naam se</th><th>Booking</th><th>Service</th><th>Amount</th><th>Balance After</th><th>Note</th></tr>
              </thead>
              <tbody>
                {data.rows.map((t) => {
                  const dir = ['topup', 'refund', 'payout'].includes(t.type) ? 'in' : 'out';
                  return (
                    <tr key={t.id}>
                      <td>{t.created_at?.slice(0, 16)}</td>
                      <td><DirBadge dir={dir} label={dir === 'in' ? 'Incoming' : 'Outgoing'} /></td>
                      <td><span className={`badge ${t.type}`}>{t.type}</span></td>
                      <td>
                        {t.counterparty_role}
                        {t.counterparty_name ? <div className="muted"><b>{t.counterparty_name}</b></div> : null}
                      </td>
                      <td className="muted">{t.booking_code || '—'}</td>
                      <td className="muted">{t.category_name || '—'}</td>
                      <td><Amt value={t.amount} dir={dir} /></td>
                      <td>{fmt(t.balance_after)}</td>
                      <td className="muted">{t.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination pagination={data.pagination} onPage={(p) => setFilters({ ...filters, page: p })} />
          </>
        )}
      </div>
    </>
  );
}

// Cancel consequence modal: user cancel dabane se pehle exact breakdown dekhta hai
export function CancelPreviewModal({ preview, onConfirm, onClose, confirmLabel = 'Yes, Cancel Booking' }) {
  if (!preview) return null;
  const isCustomer = preview.you_are === 'customer';
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h2>⚠️ Cancellation Preview — Booking {preview.booking_code}</h2>
        {!preview.can_cancel && (
          <>
            <div className="alert warn">{preview.message}</div>
            <button className="btn secondary" onClick={onClose}>Close</button>
          </>
        )}
        {preview.can_cancel && (
          <>
            <p className="muted">Held (escrow) amount: <b>{fmt(preview.held_amount)}</b> · Professional accepted: <b>{preview.pro_has_accepted ? 'Yes' : 'No'}</b></p>
            {isCustomer ? (
              <table>
                <tbody>
                  <tr><td>Refund %</td><td><b>{preview.refund_percent}%</b></td></tr>
                  <tr><td>Aap ko wapas milega (wallet)</td><td className="td-amt-in">+ {fmt(preview.you_will_get_back)}</td></tr>
                  <tr><td>Cut hoga</td><td className="td-amt-out">− {fmt(preview.will_be_cut)}</td></tr>
                  {preview.cut_breakdown && (
                    <>
                      <tr><td>→ Professional compensation ({preview.cut_breakdown.professional_compensation.percent}%)</td><td>{fmt(preview.cut_breakdown.professional_compensation.amount)} <span className="muted">{preview.cut_breakdown.professional_compensation.goes_to}</span></td></tr>
                      <tr><td>→ Platform share ({preview.cut_breakdown.platform_share.percent}%)</td><td>{fmt(preview.cut_breakdown.platform_share.amount)}</td></tr>
                    </>
                  )}
                  <tr><td>Trust score impact</td><td>{preview.trust_score_impact}</td></tr>
                </tbody>
              </table>
            ) : (
              <table>
                <tbody>
                  <tr><td>Customer ko refund (100%)</td><td className="td-amt-in">+ {fmt(preview.customer_will_get_back)}</td></tr>
                  <tr><td>Aap ki penalty (owed)</td><td className="td-amt-out">− {fmt(preview.your_penalty)}</td></tr>
                  <tr><td>Trust score impact</td><td>{preview.trust_score_impact}</td></tr>
                </tbody>
              </table>
            )}
            <div className="alert warn mt">{preview.message}</div>
            <div className="row mt">
              <button className="btn danger" onClick={onConfirm}>{confirmLabel}</button>
              <button className="btn secondary" onClick={onClose}>Nahi, wapas jao</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Direction-aware amount cell for ledgers: 'in' (green +) or 'out' (red -)
export function Amt({ value, dir }) {
  const sign = dir === 'in' ? '+' : '−';
  return <span className={dir === 'in' ? 'td-amt-in' : 'td-amt-out'}>{sign} {fmt(value)}</span>;
}

// Horizontal money-flow diagram used in guide/explainer pages
export function MoneyFlow({ nodes }) {
  return (
    <div className="flow">
      {nodes.map((n, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="arrow">→</span>}
          <div className="node">
            <b>{n.title}</b>
            {n.sub}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

export function Steps({ steps, current }) {
  return (
    <div className="steps">
      {steps.map((s, i) => (
        <div key={s} className={`step ${i < current ? 'done' : i === current ? 'active' : ''}`}>
          {i + 1}. {s}
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon = '📭', children }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      {children}
    </div>
  );
}
