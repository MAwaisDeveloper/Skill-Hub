import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, saveSession } from '../api';
import { useApp } from '../context';

export default function Login() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState('password'); // password | otp | admin | forgot
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const go = (role) => navigate(role === 'customer' ? '/customer' : role === 'professional' ? '/professional' : '/admin');

  const wrap = async (fn, okMsg) => {
    setError(''); setMsg(''); setBusy(true);
    try {
      const res = await fn();
      if (okMsg) setMsg(okMsg(res));
      return res;
    } catch (e) { setError(e.message); return null; }
    finally { setBusy(false); }
  };

  const passwordLogin = async () => {
    const data = await wrap(() => api.post('/auth/password/login', form));
    if (data) { saveSession(data); login(data); go(data.user.role); }
  };

  const requestOtp = async () => {
    const res = await wrap(() => api.post('/auth/otp/request', { phone }));
    if (res) { setDevOtp(res.dev_otp || null); setStep(2); setMsg('OTP bhej diya gaya — apna phone check karein.'); }
  };

  const verifyOtp = async () => {
    const data = await wrap(() => api.post('/auth/otp/verify', { phone, otp }));
    if (data) { saveSession(data); login(data); go(data.user.role); }
  };

  const adminLogin = async () => {
    const data = await wrap(() => api.post('/auth/admin/login', { phone, password: form.password }));
    if (data) { saveSession(data); login(data); go('admin'); }
  };

  const forgot = async () => {
    const res = await wrap(() => api.post('/auth/forgot', { identifier: form.identifier }));
    if (res) {
      setPhone(res.phone);
      setDevOtp(res.dev_otp || null);
      setMsg(`OTP bhej diya gaya ${res.phone} par — code enter karein.`);
      setStep(2);
    }
  };

  const reset = async () => {
    if (!form.password || form.password.length < 8) { setError('Naya password kam az kam 8 characters ka hona chahiye'); return; }
    const res = await wrap(() => api.post('/auth/reset', { phone, otp, new_password: form.password }));
    if (res) {
      setMsg('✓ Password change ho gaya — ab naye password se login karein.');
      setTab('password'); setStep(1); setDevOtp(null); setOtp('');
      setForm({ identifier: form.identifier, password: '' });
    }
  };

  return (
    <div className="auth-split">
      {/* Left brand panel */}
      <div className="auth-brand">
        <div>
          <div className="auth-brand-logo"><span className="logo-dot" /> Hunar<span>.</span></div>
          <h1>Verified Skill,<br />Trusted Service.</h1>
          <p>Ghar ke har kaam ke liye verified professionals — AC technician, electrician, plumber, painter aur mazeed.</p>
          <ul className="auth-points">
            <li>✓ Har professional CNIC + selfie verified</li>
            <li>✓ Paisa escrow mein — kaam confirm hone par hi release</li>
            <li>✓ Live location tracking + in-app chat</li>
            <li>✓ JazzCash / Easypaisa se foran payment</li>
          </ul>
        </div>
        <div className="auth-brand-foot">Lahore · Free-tier open-source platform</div>
      </div>

      {/* Right form panel */}
      <div className="auth-form-wrap">
        <div className="auth-card">
          <h1>{tab === 'forgot' ? '🔐 Password Reset' : 'Welcome back 👋'}</h1>
          <p className="sub">{tab === 'forgot' ? 'Apna registered email ya phone likhein — hum OTP bhejenge.' : 'Apne Hunar account mein login karein'}</p>

          {tab !== 'forgot' && (
            <div className="tabs">
              <button className={`tab ${tab === 'password' ? 'active' : ''}`} onClick={() => { setTab('password'); setError(''); setMsg(''); }}>Password Login</button>
              <button className={`tab ${tab === 'otp' ? 'active' : ''}`} onClick={() => { setTab('otp'); setStep(1); setError(''); setMsg(''); }}>OTP Login</button>
              <button className={`tab ${tab === 'admin' ? 'active' : ''}`} onClick={() => { setTab('admin'); setError(''); setMsg(''); }}>Admin</button>
            </div>
          )}

          {error && <div className="alert error">{error}</div>}
          {msg && <div className="alert success">{msg}</div>}

          {tab === 'password' && (
            <>
              <label>Email ya Phone</label>
              <input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} placeholder="ali@example.com ya 03001234567" autoFocus />
              <label>Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && passwordLogin()} />
              <button className="btn" style={{ width: '100%' }} onClick={passwordLogin} disabled={busy}>{busy ? '⏳ Logging in…' : 'Login'}</button>
              <p className="muted mt">
                <a href="#" onClick={(e) => { e.preventDefault(); setTab('forgot'); setStep(1); setMsg(''); setError(''); }}>Forgot password?</a>
                {' · '}New here? <Link to="/register"><b>Create an account</b></Link>
              </p>
              <p className="muted" style={{ fontSize: 12.5 }}>Demo: OTP tab se phone <b>03001234567</b> (customer) try karein.</p>
            </>
          )}

          {tab === 'otp' && (
            <>
              <label>Phone Number</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XXXXXXXXX" disabled={step === 2} autoFocus={step === 1} />
              {step === 1 && <button className="btn" style={{ width: '100%' }} onClick={requestOtp} disabled={busy || !phone}>{busy ? '⏳ Sending…' : 'Send OTP'}</button>}
              {step === 2 && (
                <>
                  {devOtp && <div className="alert warn">Dev OTP: <b>{devOtp}</b> (SMS gateway integration pending)</div>}
                  <label>Enter 6-digit OTP</label>
                  <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="••••••" maxLength={6} onKeyDown={(e) => e.key === 'Enter' && verifyOtp()} autoFocus />
                  <button className="btn" style={{ width: '100%' }} onClick={verifyOtp} disabled={busy}>{busy ? '⏳ Verifying…' : 'Verify & Login'}</button>
                  <p className="muted mt"><a href="#" onClick={(e) => { e.preventDefault(); setStep(1); setOtp(''); setMsg(''); }}>← Change number / resend</a></p>
                </>
              )}
              <p className="muted mt">Password login bhi available hai — upar tabs se switch karein. <Link to="/register">Register</Link></p>
            </>
          )}

          {tab === 'admin' && (
            <>
              <label>Admin Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03000000000" autoFocus />
              <label>Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && adminLogin()} />
              <button className="btn" style={{ width: '100%' }} onClick={adminLogin} disabled={busy}>{busy ? '⏳ Logging in…' : 'Login as Admin'}</button>
              <p className="muted mt">Demo: 03000000000 / Admin@123</p>
            </>
          )}

          {tab === 'forgot' && (
            <>
              {step === 1 && (
                <>
                  <label>Registered Email ya Phone</label>
                  <input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} placeholder="jis number/email par account hai" autoFocus onKeyDown={(e) => e.key === 'Enter' && forgot()} />
                  <button className="btn" style={{ width: '100%' }} onClick={forgot} disabled={busy || !form.identifier}>{busy ? '⏳ Sending…' : 'Send Reset OTP'}</button>
                </>
              )}
              {step === 2 && (
                <>
                  {devOtp && <div className="alert warn">Dev OTP: <b>{devOtp}</b> ({phone})</div>}
                  <label>OTP (bheja gaya {phone} par)</label>
                  <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" maxLength={6} autoFocus />
                  <label>Naya Password (min 8 characters)</label>
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && reset()} />
                  <button className="btn" style={{ width: '100%' }} onClick={reset} disabled={busy}>{busy ? '⏳ Resetting…' : 'Reset Password'}</button>
                  <p className="muted mt"><a href="#" onClick={(e) => { e.preventDefault(); setStep(1); setOtp(''); setMsg(''); }}>← Number change karein</a></p>
                </>
              )}
              <p className="muted mt"><a href="#" onClick={(e) => { e.preventDefault(); setTab('password'); setStep(1); setError(''); setMsg(''); }}>← Back to login</a></p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
