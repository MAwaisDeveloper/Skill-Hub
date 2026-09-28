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
    <Layout title="My Refunds" subtitle="Every amount returned to you from cancellations and disputes">
      {error && <div className="alert error">{error}</div>}
      <div className="card">
        {refunds.length === 0 && <Empty icon="↩">No refund records yet. If you cancel a booking, the refund will appear here.</Empty>}
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
        <h2>📋 Refund rules (good to know)</h2>
        <ul style={{ paddingLeft: 18, lineHeight: 1.9 }}>
          <li>Provider had <b>not</b> accepted yet → <b>100% refund</b>, instantly to your wallet</li>
          <li>Provider had already accepted → <b>85% refund</b> (15% cancellation cut: 10% provider compensation + 5% platform)</li>
          <li>Provider cancelled → <b>100% refund</b> + a 10% penalty is charged to the provider (auto-deducted from their next payout)</li>
          <li>Dispute → funds stay safely in escrow until an administrator decides the case</li>
        </ul>
      </div>
    </Layout>
  );
}
