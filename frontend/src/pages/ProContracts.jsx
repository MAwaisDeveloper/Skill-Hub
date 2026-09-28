import React, { useEffect, useState } from 'react';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { Empty, StatusBadge } from '../components/ui';

export default function ProContracts() {
  const { session } = useApp();
  const token = session?.token;
  const [contracts, setContracts] = useState([]);
  const [bidForm, setBidForm] = useState({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    try {
      setContracts(await api.get(`/professional/contracts${showAll ? '?all=1' : ''}`, token));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, [showAll]);
  useEffect(() => { load(); }, []);

  const submitBid = async (contractId) => {
    setError(''); setMsg('');
    try {
      const { quoted_price, quoted_timeline } = bidForm[contractId] || {};
      await api.post(`/professional/contracts/${contractId}/bid`, { quoted_price: Number(quoted_price), quoted_timeline }, token);
      setMsg('Bid submitted');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const [msMap, setMsMap] = useState({});
  const openMilestones = async (contractId) => {
    setError('');
    try {
      const rows = await api.get(`/professional/contracts/${contractId}/milestones`, token);
      setMsMap({ ...msMap, [contractId]: rows });
    } catch (e) { setError(e.message); }
  };

  return (
    <Layout title="Contract Marketplace" subtitle="Bulk hiring requests matching your categories — submit your quote">
      <div className="card">
        <h2>How contracts pay</h2>
        <p className="muted">Customer selects your bid → 40% deposit escrow mein lock → baqi milestones par release. Total contract value par 0% service charges (free launch offer) lagti hai.</p>
      </div>
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
        Sab categories ke open contracts bhi dikhaao (browse-only: bid sirf matching category par)
      </label>
      {contracts.length === 0 && <div className="card"><Empty icon="📑">No open contracts right now: check back soon.</Empty></div>}
      {contracts.map((c) => (
        <div className="card" key={c.id}>
          <div className="row spread">
            <h2>{c.contract_code} — {c.category_name}</h2>
            <span>
              {c.my_bid_status && <span className="badge status">your bid: {c.my_bid_status}</span>}
              {c.status !== 'open' && <StatusBadge status={c.status} />}
            </span>
          </div>
          <p>{c.description}</p>
          <p className="muted">
            Workers: {c.workers_needed} · Duration: {c.duration_days} days · Start: {c.start_date} · Budget: {fmt(c.budget_min)} – {fmt(c.budget_max)}
          </p>
          {/* Awarded contract: release progress */}
          {c.status !== 'open' && (
            <div className="mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              {!msMap[c.id] ? (
                <button className="btn small secondary" onClick={() => openMilestones(c.id)}>📋 Milestones / release progress</button>
              ) : (
                <table>
                  <thead><tr><th>#</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
                  <tbody>
                    {msMap[c.id].map((m) => (
                      <tr key={m.id}>
                        <td><b>{m.milestone_no}</b>{m.milestone_no === 1 ? ' (deposit)' : ''}</td>
                        <td>{m.description}</td>
                        <td>{fmt(m.amount)}</td>
                        <td>{m.status === 'released' ? <span className="badge verified">✓ Released {m.released_at ? String(m.released_at).slice(0, 10) : ''}</span> : <StatusBadge status={m.status === 'held' ? 'waiting_for_professional' : m.status} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="muted mt" style={{ fontSize: 13 }}>The payout lands in your wallet once the customer confirms the milestone (90% after the 10% platform commission).</p>
            </div>
          )}
          {!c.my_bid_status && !c.matches_me && (
            <div className="alert warn">This contract is outside your category: browse only.</div>
          )}
          {!c.my_bid_status && c.matches_me !== 0 && (
            <div className="row">
              <input style={{ maxWidth: 160 }} type="number" placeholder="Your quote (Rs)"
                value={bidForm[c.id]?.quoted_price || ''}
                onChange={(e) => setBidForm({ ...bidForm, [c.id]: { ...bidForm[c.id], quoted_price: e.target.value } })} />
              <input style={{ maxWidth: 180 }} placeholder="Timeline (e.g. 5 days)"
                value={bidForm[c.id]?.quoted_timeline || ''}
                onChange={(e) => setBidForm({ ...bidForm, [c.id]: { ...bidForm[c.id], quoted_timeline: e.target.value } })} />
              <button className="btn small" onClick={() => submitBid(c.id)}>Submit Bid</button>
            </div>
          )}
        </div>
      ))}
    </Layout>
  );
}
