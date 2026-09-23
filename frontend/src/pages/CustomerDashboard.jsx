import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';

export default function CustomerDashboard() {
  const { session } = useApp();
  const navigate = useNavigate();
  const token = session?.token;
  const [wallet, setWallet] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [txs, setTxs] = useState([]);
  const [topup, setTopup] = useState({ provider: 'jazzcash', mobile_number: '', amount: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setWallet(await api.get('/customer/wallet', token));
      setBookings(await api.get('/customer/bookings', token));
      setTxs(await api.get('/customer/wallet/transactions', token));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, []);

  const startTopup = async () => {
    setError('');
    try {
      const res = await api.post('/customer/wallet/topup', {
        ...topup,
        amount: Number(topup.amount),
      }, token);
      navigate(res.redirect_url);
    } catch (e) {
      setError(e.message);
    }
  };

  const statusBadge = (s) => <span className="badge status">{s.replaceAll('_', ' ')}</span>;

  return (
    <>
      <div className="row spread">
        <div>
          <h1>My Dashboard</h1>
          <p className="sub">Welcome back, {session?.profile?.full_name || 'Customer'}</p>
        </div>
        <Link to="/book" className="btn">+ Book a Service</Link>
      </div>

      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert success">{msg}</div>}

      <div className="grid cols-3">
        <div className="card stat">
          <span className="value">{fmt(wallet?.balance)}</span>
          <span className="label">Wallet Balance</span>
        </div>
        <div className="card stat">
          <span className="value">{fmt(wallet?.held_amount)}</span>
          <span className="label">Held (Escrow)</span>
        </div>
        <div className="card stat">
          <span className="value">{bookings.length}</span>
          <span className="label">Total Bookings</span>
        </div>
      </div>

      <div className="card">
        <h2>Add Money to Wallet</h2>
        <p className="muted">You'll be redirected to JazzCash/Easypaisa secure page — PIN is entered there, never on Hunar.</p>
        <div className="row">
          <select style={{ maxWidth: 160 }} value={topup.provider} onChange={(e) => setTopup({ ...topup, provider: e.target.value })}>
            <option value="jazzcash">JazzCash</option>
            <option value="easypaisa">Easypaisa</option>
          </select>
          <input style={{ maxWidth: 200 }} placeholder="Mobile number" value={topup.mobile_number}
            onChange={(e) => setTopup({ ...topup, mobile_number: e.target.value })} />
          <input style={{ maxWidth: 140 }} type="number" placeholder="Amount" value={topup.amount}
            onChange={(e) => setTopup({ ...topup, amount: e.target.value })} />
          <button className="btn" onClick={startTopup}>Add Money</button>
        </div>
      </div>

      <div className="card">
        <h2>My Bookings</h2>
        {bookings.length === 0 && <p className="muted">No bookings yet. <Link to="/book">Book your first service</Link>.</p>}
        {bookings.length > 0 && (
          <table>
            <thead>
              <tr><th>Code</th><th>Category</th><th>Professional</th><th>When</th><th>Price</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td>{b.booking_code}</td>
                  <td>{b.category_name}</td>
                  <td>{b.professional_name}</td>
                  <td>{b.scheduled_date} {b.scheduled_slot?.slice(0, 5)}</td>
                  <td>{fmt(b.final_price)}</td>
                  <td>{statusBadge(b.status)}</td>
                  <td><Link to={`/bookings/${b.id}`} className="btn small secondary">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Wallet Ledger</h2>
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance After</th><th>Note</th></tr></thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t.id}>
                <td>{t.created_at?.slice(0, 16)}</td>
                <td>{t.type}</td>
                <td>{fmt(t.amount)}</td>
                <td>{fmt(t.balance_after)}</td>
                <td className="muted">{t.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
