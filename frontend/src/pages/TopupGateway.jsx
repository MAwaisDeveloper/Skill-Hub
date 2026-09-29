import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';

// Simulated JazzCash/Easypaisa hosted checkout — OTP/SMS flow (mobile-app style):
// user ke mobile account par OTP "SMS" jata hai, wahi code yahan enter hota hai.
// OTP sirf gateway ko milta hai; Hunar application use kabhi nahi dekhta.
export default function TopupGateway() {
  const { reference } = useParams();
  const navigate = useNavigate();
  const { session } = useApp();
  const token = session?.token;
  const [topup, setTopup] = useState(null);
  const [otpSent, setOtpSent] = useState(null); // { sent_to, message, dev_otp }
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState('');

  const isJazz = topup?.provider !== 'easypaisa';

  useEffect(() => {
    const base = session?.user?.role === 'professional' ? '/professional' : '/customer';
    api.get(`${base}/wallet/topup/${reference}`, token).then(setTopup).catch((e) => setError(e.message));
  }, [reference]);

  const sendOtp = async () => {
    setBusy(true); setError('');
    try {
      const base = session?.user?.role === 'professional' ? '/professional' : '/customer';
      const res = await api.post(`${base}/wallet/topup/${reference}/send-otp`, {}, token);
      setOtpSent(res);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const pay = async () => {
    setBusy(true); setError('');
    try {
      if (!/^\d{4,6}$/.test(otp)) throw new Error('Enter the OTP sent to your mobile account');
      const base = session?.user?.role === 'professional' ? '/professional' : '/customer';
      // Step 1: gateway verifies OTP and debits the mobile account
      const verified = await api.post(`${base}/wallet/topup/${reference}/verify-otp`, { otp }, token);
      // Step 2: gateway server callback credits the Hunar wallet
      const res = await api.post(`${base}/wallet/topup/${verified.reference}/confirm`, { status: 'success' }, token);
      setDone(res);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <Layout title="Secure Checkout" subtitle="Gateway-hosted payment page (simulated for dev)">
      <div style={{ maxWidth: 440, margin: '0 auto' }}>
        {done ? (
          <div className="card" style={{ textAlign: 'center', borderTop: '4px solid var(--green)' }}>
            <div style={{ fontSize: 54 }}>✅</div>
            <h1>Payment Successful</h1>
            <p className="muted">Rs {Number(done.amount).toLocaleString()} has been added to your Hunar wallet. The amount was deducted from your mobile account after OTP verification.</p>
            <div className="kv mt" style={{ textAlign: 'left' }}>
              <span className="k">Amount</span><span><b>{fmt(done.amount)}</b></span>
              <span className="k">Reference</span><span>{done.reference || reference}</span>
              <span className="k">Provider</span><span>{isJazz ? 'JazzCash' : 'Easypaisa'}</span>
              <span className="k">New Balance</span><span><b style={{ color: 'var(--green-dark)' }}>{fmt(done.balance ?? done.balance_after)}</b></span>
            </div>
            <div className="row mt" style={{ justifyContent: 'center' }}>
              <button className="btn" onClick={() => navigate('/customer/wallet')}>👛 Open Wallet</button>
              <button className="btn secondary" onClick={() => navigate('/book')}>➕ Book a Service</button>
            </div>
          </div>
        ) : (
          <div className={`card gateway ${isJazz ? 'gw-jazzcash' : 'gw-easypaisa'}`}>
            <div className={`gw-head ${isJazz ? 'gw-head-jazz' : 'gw-head-easy'}`}>
              <div className="gw-logo">{isJazz ? 'JazzCash' : 'easypaisa'}</div>
              <div className="gw-lock">🔒 SSL Secured</div>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>This is the secure {isJazz ? 'JazzCash' : 'Easypaisa'} page (simulated). We send an OTP to your mobile account — the code never reaches Hunar.</p>
            {error && <div className="alert error">{error}</div>}
            {topup && (
              <>
                <div className="gw-amount">Rs {Number(topup.amount).toLocaleString()}</div>
                <div className="kv">
                  <span className="k">To</span><span>Hunar Wallet</span>
                  <span className="k">From</span><span>{isJazz ? 'JazzCash' : 'Easypaisa'} · {topup.mobile_number}</span>
                  <span className="k">Reference</span><span>{topup.gateway_transaction_ref}</span>
                </div>
                {!otpSent ? (
                  <>
                    <button className={`btn ${isJazz ? 'gw-btn-jazz' : 'gw-btn-easy'}`} style={{ width: '100%', marginTop: 14 }} onClick={sendOtp} disabled={busy}>
                      {busy ? '⏳ Sending…' : `📱 Send OTP to ${isJazz ? 'JazzCash' : 'Easypaisa'} account`}
                    </button>
                    <p className="muted mt" style={{ fontSize: 12 }}>An OTP message will be sent to {topup.mobile_number} (the number of your {isJazz ? 'JazzCash' : 'Easypaisa'} mobile account). Enter it here to authorize Rs {Number(topup.amount).toLocaleString()}.</p>
                  </>
                ) : (
                  <>
                    <div className="alert success mt">{otpSent.message}</div>
                    {otpSent.dev_otp && <div className="alert warn">Dev OTP (SMS simulation): <b>{otpSent.dev_otp}</b></div>}
                    <label style={{ marginTop: 14 }}>Enter OTP</label>
                    <input
                      className="otp-input"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                      maxLength={6}
                      inputMode="numeric"
                      style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8 }}
                      onKeyDown={(e) => e.key === 'Enter' && pay()}
                      autoFocus
                    />
                    <button className={`btn ${isJazz ? 'gw-btn-jazz' : 'gw-btn-easy'}`} style={{ width: '100%' }} onClick={pay} disabled={busy}>
                      {busy ? '⏳ Verifying…' : `Pay Rs ${Number(topup.amount).toLocaleString()}`}
                    </button>
                    <p className="muted mt" style={{ fontSize: 12 }}>
                      <a href="#" onClick={(e) => { e.preventDefault(); setOtp(''); setOtpSent(null); setError(''); }}>← Resend OTP</a>
                      {' · '}By pressing pay you authorize the payment under {isJazz ? 'JazzCash' : 'Easypaisa'} terms. The amount is deducted from your mobile account and credited to your Hunar wallet instantly.
                    </p>
                  </>
                )}
              </>
            )}
            {!topup && !error && <p className="muted">Loading payment details…</p>}
          </div>
        )}
      </div>
    </Layout>
  );
}
