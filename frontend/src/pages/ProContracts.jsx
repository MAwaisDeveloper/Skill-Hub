import React, { useEffect, useState } from 'react';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { Empty } from '../components/ui';

export default function ProContracts() {
  const { session } = useApp();
  const token = session?.token;
  const [contracts, setContracts] = useState([]);
  const [bidForm, setBidForm] = useState({});
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setContracts(await api.get('/professional/contracts', token));
    } catch (e) {
      setError(e.message);
    }
  };
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

  return (
    <Layout title="Contract Marketplace" subtitle="Bulk hiring requests matching your categories — submit your quote">
      <div className="card">
        <h2>How contracts pay</h2>
        <p className="muted">Customer selects your bid → 40% deposit escrow mein lock → baqi milestones par release. Total contract value par 10% commission lagti hai.</p>
      </div>
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      {contracts.length === 0 && <div className="card"><Empty icon="📑">No open contracts right now — check back soon.</Empty></div>}
      {contracts.map((c) => (
        <div className="card" key={c.id}>
          <div className="row spread">
            <h2>{c.contract_code} — {c.category_name}</h2>
            {c.my_bid_status && <span className="badge status">your bid: {c.my_bid_status}</span>}
          </div>
          <p>{c.description}</p>
          <p className="muted">
            Workers: {c.workers_needed} · Duration: {c.duration_days} days · Start: {c.start_date} · Budget: {fmt(c.budget_min)} – {fmt(c.budget_max)}
          </p>
          {!c.my_bid_status && (
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
