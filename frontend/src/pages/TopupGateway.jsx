import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';

// Simulated JazzCash/Easypaisa hosted checkout. In production this page lives
// on the gateway's own domain; here we simulate it for the free dev setup.
export default function TopupGateway() {
  const { reference } = useParams();
  const navigate = useNavigate();
  const { session } = useApp();
  const token = session?.token;
  const [topup, setTopup] = useState(null);
  const [pin, setPin] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/customer/wallet/topup/${reference}`, token).then(setTopup).catch((e) => setError(e.message));
  }, [reference]);

  const pay = async () => {
    setProcessing(true);
    setError('');
    try {
      // Simulate gateway PIN check (any 4-5 digit PIN works in dev)
      if (!/^\d{4,5}$/.test(pin)) throw new Error('Enter a 4-5 digit demo PIN');
      await new Promise((r) => setTimeout(r, 800));
      const res = await api.post(`/customer/wallet/topup/${reference}/confirm`, { status: 'success' }, token);
      navigate('/customer', { state: { flash: `Top-up successful: Rs ${res.amount}` } });
    } catch (e) {
      setError(e.message);
      setProcessing(false);
    }
  };

  return (
    <Layout title="Secure Checkout" subtitle="Gateway-hosted payment page (simulated for dev)">
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
      <div className="card" style={{ borderTop: '4px solid var(--gold)' }}>
        <h1>{topup?.provider === 'easypaisa' ? 'Easypaisa' : 'JazzCash'} Secure Checkout</h1>
        <p className="muted">This is the payment gateway's own page (simulated). Your PIN is never shared with Hunar.</p>
        {error && <div className="alert error">{error}</div>}
        {topup && (
          <>
            <p>Reference: <b>{topup.gateway_transaction_ref}</b></p>
            <p>Amount: <b style={{ fontSize: 20 }}>Rs {Number(topup.amount).toLocaleString()}</b></p>
            <p>Mobile: <b>{topup.mobile_number}</b></p>
            <label>Demo PIN (any 4 digits)</label>
            <input type="password" maxLength={5} value={pin} onChange={(e) => setPin(e.target.value)} />
            <button className="btn" onClick={pay} disabled={processing}>{processing ? 'Processing…' : 'Confirm Payment'}</button>
          </>
        )}
      </div>
      </div>
    </Layout>
  );
}
