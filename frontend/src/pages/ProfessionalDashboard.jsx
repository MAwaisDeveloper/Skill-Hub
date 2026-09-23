import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';

export default function ProfessionalDashboard() {
  const { session } = useApp();
  const token = session?.token;
  const [data, setData] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [slots, setSlots] = useState([]);
  const [newSlot, setNewSlot] = useState({ slot_date: '', start_time: '', end_time: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setData(await api.get('/professional/me/dashboard', token));
      setBookings(await api.get('/professional/bookings', token));
      setWallet(await api.get('/professional/wallet', token));
      setSlots(await api.get('/professional/me/slots', token));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const act = async (id, path, body) => {
    setError(''); setMsg('');
    try {
      const res = await api.post(`/professional/bookings/${id}/${path}`, body || {}, token);
      setMsg(res.status ? `Status: ${res.status.replaceAll('_', ' ')}` : 'Done');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const addSlot = async () => {
    setError(''); setMsg('');
    try {
      await api.post('/professional/me/slots', newSlot, token);
      setMsg('Slot added');
      setNewSlot({ slot_date: '', start_time: '', end_time: '' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const nextAction = (b) => {
    switch (b.status) {
      case 'waiting_for_professional': return <>
        <button className="btn small" onClick={() => act(b.id, 'accept')}>Accept</button>
        <button className="btn small danger" onClick={() => act(b.id, 'reject')}>Reject</button>
      </>;
      case 'accepted': return <button className="btn small" onClick={() => act(b.id, 'status', { status: 'on_the_way' })}>On The Way</button>;
      case 'on_the_way': return <button className="btn small" onClick={() => act(b.id, 'status', { status: 'arrived' })}>Arrived</button>;
      case 'work_started': return <button className="btn small" onClick={() => act(b.id, 'status', { status: 'work_completed' })}>Complete Job</button>;
      default: return <Link to={`/professional/bookings/${b.id}`} className="btn small secondary">View</Link>;
    }
  };

  if (!data) return <p className="muted">{error || 'Loading…'}</p>;
  const { profile, stats } = data;

  return (
    <>
      <div className="row spread">
        <div>
          <h1>Professional Workspace</h1>
          <p className="sub">
            {profile.full_name}{' '}
            <span className={`badge ${profile.verification_status}`}>{profile.verification_status}</span>
          </p>
        </div>
        <Link to="/professional/contracts" className="btn secondary">Contract Jobs</Link>
      </div>

      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert success">{msg}</div>}
      {profile.verification_status !== 'verified' && (
        <div className="alert warn">
          Your account is <b>{profile.verification_status}</b>. Customers cannot book you until admin verifies your CNIC + selfie.
        </div>
      )}
      {Number(stats.outstanding_penalties) > 0 && (
        <div className="alert warn">Outstanding penalty: <b>{fmt(stats.outstanding_penalties)}</b> — will be auto-deducted from your next payout.</div>
      )}

      <div className="grid cols-3">
        <div className="card stat"><span className="value">{stats.new_requests}</span><span className="label">New Requests</span></div>
        <div className="card stat"><span className="value">{stats.active_jobs}</span><span className="label">Active Jobs</span></div>
        <div className="card stat"><span className="value">{fmt(stats.total_earned)}</span><span className="label">Total Earned</span></div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Wallet</h2>
          <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--green-dark)' }}>{fmt(wallet?.balance)}</p>
          <p className="muted">Payout account: {profile.payout_account || 'not set'} ({profile.payout_provider || '—'})</p>
        </div>
        <div className="card">
          <h2>Availability (next slots)</h2>
          <div className="row mb">
            {slots.filter((s) => !s.is_booked).slice(0, 8).map((s) => (
              <span key={s.id} className="badge status">{s.slot_date} {s.start_time.slice(0, 5)}</span>
            ))}
          </div>
          <div className="row">
            <input type="date" value={newSlot.slot_date} onChange={(e) => setNewSlot({ ...newSlot, slot_date: e.target.value })} style={{ maxWidth: 160 }} />
            <input type="time" value={newSlot.start_time} onChange={(e) => setNewSlot({ ...newSlot, start_time: e.target.value + ':00' })} style={{ maxWidth: 120 }} />
            <input type="time" value={newSlot.end_time} onChange={(e) => setNewSlot({ ...newSlot, end_time: e.target.value + ':00' })} style={{ maxWidth: 120 }} />
            <button className="btn small" onClick={addSlot}>Add Slot</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Job Requests</h2>
        <table>
          <thead><tr><th>Code</th><th>Category</th><th>Customer</th><th>When</th><th>Price</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td><Link to={`/professional/bookings/${b.id}`}>{b.booking_code}</Link></td>
                <td>{b.category_name}</td>
                <td>{b.customer_name}</td>
                <td>{b.scheduled_date} {b.scheduled_slot?.slice(0, 5)}</td>
                <td>{fmt(b.final_price)}</td>
                <td><span className="badge status">{b.status.replaceAll('_', ' ')}</span></td>
                <td><div className="row">{nextAction(b)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
