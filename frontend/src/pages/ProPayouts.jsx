import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { DirBadge, Amt, Empty, InvoiceModal } from '../components/ui';

// Payouts page (professional): released payouts per booking + withdrawal requests.
export default function ProPayouts() {
  const { session } = useApp();
  const token = session?.token;
  const [payouts, setPayouts] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/professional/payouts?per_page=100', token),
      api.get('/professional/wallet/withdrawals', token),
    ]).then(([p, w]) => { setPayouts(p.rows || p); setWithdrawals(w); }).catch((e) => setError(e.message));
  }, []);

  return (
    <Layout title="Payouts" subtitle="Har completed job ka payout + withdrawal requests — sab clear">
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h2>💰 Job Payouts (90% of each deal)</h2>
        {payouts.length === 0 && <Empty icon="💰">No payouts yet. Complete jobs: each release creates a payout here.</Empty>}
        {payouts.length > 0 && (
          <table>
            <thead><tr><th>Date</th><th>Booking</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id}>
                  <td>{p.created_at?.slice(0, 16)}</td>
                  <td className="muted">{p.booking_code || p.booking_id || '—'}</td>
                  <td><Amt value={p.amount} dir="in" /></td>
                  <td><DirBadge dir={p.status === 'released' ? 'in' : 'pending'} label={p.status} /></td>
                  <td><button className="btn small secondary" title="Invoice" onClick={() => setInvoice({ kind: 'payout', id: p.id })}>🧾</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>💸 Withdrawal Requests</h2>
        {withdrawals.length === 0 && <Empty icon="💸">No withdrawal requests yet. Request one from <b>My Wallet → Earnings &amp; Withdraw</b>.</Empty>}
        {withdrawals.length > 0 && (
          <table>
            <thead><tr><th>Date</th><th>To</th><th>Amount</th><th>Status</th><th>Admin Note</th><th></th></tr></thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id}>
                  <td>{w.created_at?.slice(0, 16)}</td>
                  <td><b>{w.account_title}</b><div className="muted">{w.provider} {w.account_number}</div></td>
                  <td><Amt value={w.amount} dir="out" /></td>
                  <td><DirBadge dir={w.status === 'pending' ? 'pending' : w.status === 'completed' ? 'in' : 'out'} label={w.status} /></td>
                  <td className="muted">{w.admin_note || '—'}</td>
                  <td><button className="btn small secondary" title="Invoice" onClick={() => setInvoice({ kind: 'withdrawal', id: w.id })}>🧾</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {invoice && <InvoiceModal kind={invoice.kind} id={invoice.id} onClose={() => setInvoice(null)} />}
      <p className="muted">Har payout 90% hota hai (10% platform commission minus). Full statement: <b>My Wallet → Transaction History</b>.</p>
    </Layout>
  );
}
