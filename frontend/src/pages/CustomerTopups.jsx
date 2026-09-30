import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { DirBadge, Amt, Empty, InvoiceModal } from '../components/ui';

// Top-ups (JazzCash/Easypaisa) page — customer ka poora top-up record with invoices.
export default function CustomerTopups() {
  const { session } = useApp();
  const token = session?.token;
  const [topups, setTopups] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/customer/wallet/topups', token).then(setTopups).catch((e) => setError(e.message));
  }, []);

  return (
    <Layout title="Top-ups — JazzCash / Easypaisa" subtitle="Complete record of every amount added to your wallet, with invoices">
      {error && <div className="alert error">{error}</div>}
      <div className="card">
        {topups.length === 0 && <Empty icon="⬆️">No top-ups yet. Start from <Link to="/customer/wallet">Add Money</Link>.</Empty>}
        {topups.length > 0 && (
          <table>
            <thead><tr><th>Date &amp; Time</th><th>Provider</th><th>Number</th><th>Reference</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {topups.map((t) => (
                <tr key={t.id}>
                  <td>{t.created_at?.slice(0, 16)}</td>
                  <td><span className={`badge status`}>{t.provider === 'jazzcash' ? 'JazzCash' : 'Easypaisa'}</span></td>
                  <td>{t.mobile_number}</td>
                  <td className="muted">{t.gateway_transaction_ref}</td>
                  <td><Amt value={t.amount} dir="in" /></td>
                  <td><DirBadge dir={t.status === 'success' ? 'in' : t.status === 'pending' ? 'pending' : 'out'} label={t.status} /></td>
                  <td><button className="btn small secondary" title="Invoice" onClick={() => setInvoice({ kind: 'topup', reference: t.gateway_transaction_ref })}>🧾</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {invoice && <InvoiceModal kind="topup" reference={invoice.reference} onClose={() => setInvoice(null)} />}
    </Layout>
  );
}
