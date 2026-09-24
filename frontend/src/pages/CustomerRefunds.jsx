import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { DirBadge, Amt, Empty, StatusBadge } from '../components/ui';

// Refunds page — cancellation/dispute refunds customer ko dikhti hain, booking link ke sath.
export default function CustomerRefunds() {
  const { session } = useApp();
  const token = session?.token;
  const [refunds, setRefunds] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/customer/wallet/refunds', token).then(setRefunds).catch((e) => setError(e.message));
  }, []);

  return (
    <Layout title="My Refunds" subtitle="Cancellation aur dispute se wapas mile paise — sab yahan">
      {error && <div className="alert error">{error}</div>}
      <div className="card">
        {refunds.length === 0 && <Empty icon="↩">Koi refund record nahi. Booking cancel hoti hai to refund yahan show hoga.</Empty>}
        {refunds.length > 0 && (
          <table>
            <thead><tr><th>Date</th><th>Booking</th><th>Amount</th><th>Reason / Rule</th><th>Status</th></tr></thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.id}>
                  <td>{r.created_at?.slice(0, 16)}</td>
                  <td><Link to={`/bookings/${r.booking_id}`}><b>{r.booking_code}</b></Link></td>
                  <td><Amt value={r.amount} dir="in" /></td>
                  <td className="muted">{r.reason || '—'}</td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2>📋 Refund rules (yaad rakhein)</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.9 }}>
          <li>Professional ne accept <b>nahi</b> kiya tha → <b>100% refund</b> turant wallet mein</li>
          <li>Professional accept kar chuka tha → <b>85% refund</b> (15% cut: 10% professional compensation + 5% platform)</li>
          <li>Professional ne cancel kiya → <b>100% refund</b> + us par 10% penalty (agli payout se auto-cut)</li>
          <li>Dispute → paise escrow mein held rehte hain jab tak admin decide na kare</li>
        </ul>
      </div>
    </Layout>
  );
}
