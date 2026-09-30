import React, { useEffect, useState } from 'react';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatusBadge, Empty } from '../components/ui';

export default function CustomerContracts() {
  const { session } = useApp();
  const token = session?.token;
  const [contracts, setContracts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bids, setBids] = useState({});
  const [form, setForm] = useState({ category_id: '', workers_needed: '', duration_days: '', start_date: '', budget_min: '', budget_max: '', description: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setContracts(await api.get('/customer/contracts', token));
      setCategories(await api.get('/customer/categories', token));
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = async () => {
    setError(''); setMsg('');
    try {
      await api.post('/customer/contracts', {
        ...form,
        category_id: Number(form.category_id),
        workers_needed: Number(form.workers_needed || 1),
        duration_days: Number(form.duration_days || 1),
        budget_min: Number(form.budget_min),
        budget_max: Number(form.budget_max),
      }, token);
      setMsg('Contract posted! Matching verified professionals have been notified — bids will appear below.');
      setForm({ category_id: '', workers_needed: '', duration_days: '', start_date: '', budget_min: '', budget_max: '', description: '' });
      await load();
    } catch (e) { setError(e.message); }
  };

  const openBids = async (contractId) => {
    try {
      const rows = await api.get(`/customer/contracts/${contractId}/bids`, token);
      setBids({ ...bids, [contractId]: rows });
    } catch (e) { setError(e.message); }
  };

  const award = async (contractId, bidId) => {
    setError(''); setMsg('');
    try {
      const res = await api.post(`/customer/contracts/${contractId}/award/${bidId}`, {}, token);
      setMsg(`Contract awarded! Deposit Rs ${res.deposit_held} held from wallet in escrow, ${res.milestones} milestones created.`);
      await load();
    } catch (e) { setError(e.message); }
  };

  const [milestones, setMilestones] = useState({});
  const [releasing, setReleasing] = useState(null);

  const openMilestones = async (contractId) => {
    setError('');
    try {
      const rows = await api.get(`/customer/contracts/${contractId}/milestones`, token);
      setMilestones({ ...milestones, [contractId]: rows });
    } catch (e) { setError(e.message); }
  };

  const releaseMs = async (contractId, no) => {
    setError(''); setMsg(''); setReleasing(no);
    try {
      const res = await api.post(`/customer/contracts/${contractId}/milestones/${no}/release`, {}, token);
      setMsg(`✓ Milestone ${no} released! Amount Rs ${Number(res.amount).toLocaleString()} — commission Rs ${Number(res.commission).toLocaleString()} (10%), the provider received Rs ${Number(res.pro_received).toLocaleString()}.${res.contract_status === 'completed' ? ' 🎉 Contract completed!' : ` Remaining milestones: ${res.milestones_left}`}`);
      await openMilestones(contractId);
      await load();
    } catch (e) { setError(e.message); }
    setReleasing(null);
  };

  return (
    <Layout title="Bulk / Contract Hiring" subtitle="Hire multiple verified professionals on contract — milestone-based payments">
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h2>Post a Contract</h2>
        <div className="grid cols-2">
          <div>
            <label>Category</label>
            <select value={form.category_id} onChange={set('category_id')}>
              <option value="">Select</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label>Workers Needed</label>
            <input type="number" value={form.workers_needed} onChange={set('workers_needed')} placeholder="e.g. 3" />
            <label>Duration (days)</label>
            <input type="number" value={form.duration_days} onChange={set('duration_days')} placeholder="e.g. 15" />
            <label>Start Date</label>
            <input type="date" value={form.start_date} onChange={set('start_date')} />
          </div>
          <div>
            <label>Budget Min (Rs)</label>
            <input type="number" value={form.budget_min} onChange={set('budget_min')} />
            <label>Budget Max (Rs)</label>
            <input type="number" value={form.budget_max} onChange={set('budget_max')} />
            <label>Work Details</label>
            <textarea rows={4} value={form.description} onChange={set('description')} placeholder="Describe the work, location, requirements…" />
            <button className="btn" onClick={create}>Post Contract (free: pay only when you award)</button>
          </div>
        </div>
      </div>

      {contracts.map((c) => (
        <div className="card" key={c.id}>
          <div className="row spread">
            <div>
              <h3>{c.contract_code} — {c.category_name} <StatusBadge status={c.status} /></h3>
              <p className="muted">
                {c.workers_needed} worker(s) · {c.duration_days} days from {c.start_date} · Budget {fmt(c.budget_min)}–{fmt(c.budget_max)} · {c.bid_count} bid(s)
              </p>
              <p>{c.description}</p>
            </div>
            <button className="btn small secondary" onClick={() => openBids(c.id)}>View Bids</button>
          </div>
          {bids[c.id] && (
            bids[c.id].length === 0
              ? <p className="muted mt">No bids yet.</p>
              : (
                <table className="mt">
                  <thead><tr><th>Professional</th><th>Rating</th><th>Quote</th><th>Timeline</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {bids[c.id].map((b) => (
                      <tr key={b.id}>
                        <td><b>{b.full_name}</b></td>
                        <td>★ {b.average_rating} ({b.completed_jobs} jobs)</td>
                        <td><b>{fmt(b.quoted_price)}</b></td>
                        <td>{b.quoted_timeline || '—'}</td>
                        <td><StatusBadge status={b.status} /></td>
                        <td>
                          {c.status === 'open' && b.status === 'submitted' && (
                            <button className="btn small" onClick={() => award(c.id, b.id)}>Award (40% deposit)</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
          )}

          {/* Milestones — awarded/in-progress contracts ke liye */}
          {['awarded', 'in_progress', 'completed'].includes(c.status) && (
            <div className="mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {!milestones[c.id] ? (
                <button className="btn small secondary" onClick={() => openMilestones(c.id)}>📋 View Milestones (release payments)</button>
              ) : (
                <>
                  <h3 style={{ marginBottom: 8 }}>📋 Milestones: confirm the work, only then is payment released to the professional</h3>
                  <table>
                    <thead><tr><th>#</th><th>Description</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                      {milestones[c.id].map((m) => (
                        <tr key={m.id}>
                          <td><b>{m.milestone_no}</b>{m.milestone_no === 1 ? ' (deposit)' : ''}</td>
                          <td>{m.description}{m.released_at && <div className="muted" style={{ fontSize: 12 }}>Released: {String(m.released_at).slice(0, 16)}</div>}</td>
                          <td><b>{fmt(m.amount)}</b></td>
                          <td><StatusBadge status={m.status === 'held' ? 'waiting_for_professional' : m.status} /></td>
                          <td>
                            {m.status !== 'released' && m.status !== 'disputed' && c.status !== 'completed' && (
                              <button
                                className="btn small"
                                disabled={releasing === m.milestone_no}
                                onClick={() => { if (window.confirm(`Confirm milestone ${m.milestone_no}? Rs ${Number(m.amount).toLocaleString()} will be released (0% service charges (free launch offer) deducted, 90% goes to the professional).`)) releaseMs(c.id, m.milestone_no); }}
                              >
                                {releasing === m.milestone_no ? '⏳…' : '✓ Confirm & Release'}
                              </button>
                            )}
                            {m.status === 'released' && <span className="badge verified">✓ Released</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="muted mt" style={{ fontSize: 13 }}>A 10% platform commission is deducted on each release: the remaining 90% goes to the professional's wallet. Milestones are released in order.</p>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {contracts.length === 0 && <div className="card"><Empty icon="📑">No contracts yet: post one above.</Empty></div>}
    </Layout>
  );
}
