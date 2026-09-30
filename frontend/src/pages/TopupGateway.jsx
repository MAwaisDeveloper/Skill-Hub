import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';

// Simulated JazzCash/Easypaisa hosted checkout. Production mein ye page gateway
// ke apne domain par hota hai; free dev setup mein hum simulate karte hain.
// IMPORTANT: PIN sirf isi page par enter hota hai — Hunar ko PIN kabhi nahi milta.
export default function TopupGateway() {
  const { reference } = useParams();
  const navigate = useNavigate();
  const { session } = useApp();
  const token = session?.token;
  const [topup, setTopup] = useState(null);
  const [pin, setPin] = useState('');
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');

  const isJazz = topup?.provider !== 'easypaisa';

  useEffect(() => {
    api.get(`/customer/wallet/topup/${reference}`, token).then(setTopup).catch((e) => setError(e.message));
  }, [reference]);

  const pay = async () => {
    setProcessing(true);
    setError('');
    try {
      if (!/^\d{4,5}$/.test(pin)) throw new Error('Apna 4-5 digit PIN enter karein');
      await new Promise((r) => setTimeout(r, 900));
      const res = await api.post(`/customer/wallet/topup/${reference}/confirm`, { status: 'success' }, token);
      setDone(res);
    } catch (e) {
      setError(e.message);
      setProcessing(false);
    }
  };

  return (
    <Layout title="Secure Checkout" subtitle="Gateway-hosted payment page (simulated for dev)">
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        {done ? (
          <div className="card" style={{ textAlign: 'center', borderTop: '4px solid var(--green)' }}>
            <div style={{ fontSize: 54 }}>✅</div>
            <h1>Payment Successful</h1>
            <p className="muted">Rs {Number(done.amount).toLocaleString()} aap ke Hunar wallet mein add ho gaye.</p>
            <div className="kv mt" style={{ textAlign: 'left' }}>
              <span className="k">Amount</span><span><b>{fmt(done.amount)}</b></span>
              <span className="k">Reference</span><span>{reference}</span>
              <span className="k">Provider</span><span>{isJazz ? 'JazzCash' : 'Easypaisa'}</span>
              <span className="k">New Balance</span><span><b style={{ color: 'var(--green-dark)' }}>{fmt(done.balance ?? done.balance_after)}</b></span>
            </div>
            <div className="row mt" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => navigate('/customer/wallet')}>👛 Wallet kholen</button>
              <button className="btn secondary" onClick={() => navigate('/book')}>➕ Book a Service</button>
            </div>
          </div>
        ) : (
          <div className={`card gateway ${isJazz ? 'gw-jazzcash' : 'gw-easypaisa'}`}>
            <div className={`gw-head ${isJazz ? 'gw-head-jazz' : 'gw-head-easy'}`}>
              <div className="gw-logo">{isJazz ? 'JazzCash' : 'easypaisa'}</div>
              <div className="gw-lock">🔒 SSL Secured</div>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>Ye {isJazz ? 'JazzCash' : 'Easypaisa'} ka apna secure page hai (simulated). Aap ka PIN Hunar ko kabhi nahi milta.</p>
            {error && <div className="alert error">{error}</div>}
            {topup && (
              <>
                <div className="gw-amount">Rs {Number(topup.amount).toLocaleString()}</div>
                <div className="kv">
                  <span className="k">To</span><span>Hunar Wallet</span>
                  <span className="k">From</span><span>{isJazz ? 'JazzCash' : 'Easypaisa'} · {topup.mobile_number}</span>
                  <span className="k">Reference</span><span>{topup.gateway_transaction_ref}</span>
                </div>
                <label style={{ marginTop: 14 }}>MPIN (4-5 digits: demo mein koi bhi chalega)</label>
                <input type="password" inputMode="numeric" maxLength={5} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="• • • •" style={{ textAlign: 'center', fontSize: 22, letterSpacing: 10 }} onKeyDown={(e) => e.key === 'Enter' && pay()} />
                <button className={`btn ${isJazz ? 'gw-btn-jazz' : 'gw-btn-easy'}`} style={{ width: '100%' }} onClick={pay} disabled={processing}>
                  {processing ? '⏳ Processing…' : `Pay Rs ${Number(topup.amount).toLocaleString()}`}
                </button>
                <p className="muted mt" style={{ fontSize: 12 }}>Dabaane se aap {isJazz ? 'JazzCash' : 'Easypaisa'} terms par payment authorize karte hain. Paisa foran Hunar wallet mein credit ho jayega.</p>
              </>
            )}
            {!topup && !error && <p className="muted">Loading payment details…</p>}
          </div>
        )}
      </div>
    </Layout>
  );
}
