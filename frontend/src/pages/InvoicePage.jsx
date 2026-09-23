import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';

// Invoice types: /invoice/topup/:ref, /invoice/booking/:id, /invoice/payout/:id
export default function InvoicePage() {
  const { type, id } = useParams();
  const location = useLocation();
  const { session } = useApp();
  const token = session?.token;
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (location.state?.invoice) { setInv(location.state.invoice); return; }
    const path = type === 'topup' ? `/invoices/topup/${id}` : type === 'booking' ? `/invoices/booking/${id}` : `/invoices/payout/${id}`;
    api.get(path, token).then(setInv).catch((e) => setError(e.message));
  }, [type, id]);

  const downloadPdf = () => window.print();

  return (
    <Layout title="Invoice" subtitle={inv ? inv.invoice_number : 'Loading…'}
      actions={inv && <button className="btn" onClick={downloadPdf}>⬇ Download PDF (Print → Save as PDF)</button>}>
      {error && <div className="alert error">{error}</div>}
      {inv && (
        <div className="card" style={{ maxWidth: 700 }}>
          <div className="row spread" style={{ borderBottom: '2px solid var(--green)', paddingBottom: 12 }}>
            <div>
              <h2 style={{ color: 'var(--green-dark)' }}>Hunar<span style={{ color: 'var(--gold)' }}>.</span> Invoice</h2>
              <div className="muted">Verified Skill, Trusted Service — Lahore</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div><b>{inv.invoice_number}</b></div>
              <div className="muted">{String(inv.date || '').slice(0, 16)}</div>
              <span className="badge status">{inv.status}</span>
            </div>
          </div>

          <div className="kv mt" style={{ gridTemplateColumns: '140px 1fr' }}>
            <span className="k">Type</span><span>{inv.type}</span>
            <span className="k">From</span><span>{inv.from}</span>
            <span className="k">To</span><span>{inv.to}</span>
            <span className="k">Method</span><span>{inv.method}</span>
            <span className="k">Reference</span><span>{inv.reference}</span>
          </div>

          <table className="mt">
            <thead><tr><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {inv.items.map((it, i) => (
                <tr key={i}><td>{it.description}</td><td style={{ textAlign: 'right' }}>{fmt(it.amount)}</td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td><b>Subtotal</b></td><td style={{ textAlign: 'right' }}>{fmt(inv.subtotal)}</td></tr>
              {inv.fees !== 0 && <tr><td>Fees / Commission</td><td style={{ textAlign: 'right' }}>{fmt(inv.fees)}</td></tr>}
              <tr><td><b style={{ fontSize: 16 }}>Total</b></td><td style={{ textAlign: 'right' }}><b style={{ fontSize: 16 }}>{fmt(inv.total)}</b></td></tr>
            </tfoot>
          </table>

          <p className="muted mt" style={{ fontSize: 12 }}>
            Ye invoice Hunar platform par auto-generate hui hai. Escrow-protected payment — commission sirf release
            par deduct hoti hai. Support: admin@hunar.pk
          </p>
        </div>
      )}
    </Layout>
  );
}
