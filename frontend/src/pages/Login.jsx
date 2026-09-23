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

  const go = (role) => navigate(role === 'customer' ? '/customer' : role === 'professional' ? '/professional' : '/admin');

  const passwordLogin = async () => {
    setError(''); setMsg('');
    try {
      const data = await api.post('/auth/password/login', form);
      saveSession(data); login(data);
      go(data.user.role);
    } catch (e) { setError(e.message); }
  };

  const requestOtp = async () => {
    setError(''); setMsg('');
    try {
      const res = await api.post('/auth/otp/request', { phone });
      setDevOtp(res.dev_otp || null);
      setStep(2);
    } catch (e) { setError(e.message); }
  };

  const verifyOtp = async () => {
    setError('');
    try {
      const data = await api.post('/auth/otp/verify', { phone, otp });
      saveSession(data); login(data);
      go(data.user.role);
    } catch (e) { setError(e.message); }
  };

  const adminLogin = async () => {
    setError('');
    try {
      const data = await api.post('/auth/admin/login', { phone, password: form.password });
      saveSession(data); login(data);
      go('admin');
    } catch (e) { setError(e.message); }
  };

  const forgot = async () => {
    setError(''); setMsg('');
    try {
      const res = await api.post('/auth/forgot', { identifier: form.identifier });
      setPhone(res.phone);
      setDevOtp(res.dev_otp || null);
      setMsg(res.message);
      setStep(2);
    } catch (e) { setError(e.message); }
  };

  const reset = async () => {
    setError(''); setMsg('');
    try {
      const res = await api.post('/auth/reset', { phone, otp, new_password: form.password });
      setMsg(res.message + ' — you can sign in now.');
      setTab('password'); setStep(1); setDevOtp(null);
    } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ maxWidth: 460, margin: '40px auto' }}>
      <div className="card">
        <h1>Welcome back 👋</h1>
        <p className="sub">Hunar — Verified Skill, Trusted Service</p>
        <div className="tabs">
          <button className={`tab ${tab === 'password' ? 'active' : ''}`} onClick={() => { setTab('password'); setError(''); }}>Password Login</button>
          <button className={`tab ${tab === 'otp' ? 'active' : ''}`} onClick={() => { setTab('otp'); setStep(1); setError(''); }}>OTP Login</button>
          <button className={`tab ${tab === 'admin' ? 'active' : ''}`} onClick={() => { setTab('admin'); setError(''); }}>Admin</button>
        </div>
        {error && <div className="alert error">{error}</div>}
        {msg && <div className="alert success">{msg}</div>}

        {tab === 'password' && (
          <>
            <label>Email ya Phone</label>
            <input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} placeholder="ali@example.com ya 03001234567" />
            <label>Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" onKeyDown={(e) => e.key === 'Enter' && passwordLogin()} />
            <button className="btn" onClick={passwordLogin}>Login</button>
            <p className="muted mt">
              Forgot your password? <a href="#" onClick={(e) => { e.preventDefault(); setTab('forgot'); setStep(1); setMsg(''); }}>Reset it</a>
              {' · '}New here? <Link to="/register">Create an account</Link>
            </p>
            <p className="muted">First time? Demo: use the OTP tab with phone <b>03001234567</b> (customer).</p>
          </>
        )}

        {tab === 'otp' && (
          <>
            <label>Phone Number</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03XXXXXXXXX" />
            {step === 1 && <button className="btn" onClick={requestOtp}>Send OTP</button>}
            {step === 2 && (
              <>
                {devOtp && <div className="alert warn">Dev OTP: <b>{devOtp}</b> (SMS gateway integration pending)</div>}
                <label>Enter OTP</label>
                <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" />
                <button className="btn" onClick={verifyOtp}>Verify & Login</button>
              </>
            )}
            <p className="muted mt">Password login is also available — switch tabs above. <Link to="/register">Register</Link></p>
          </>
        )}

        {tab === 'admin' && (
          <>
            <label>Admin Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03000000000" />
            <label>Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button className="btn" onClick={adminLogin}>Login as Admin</button>
            <p className="muted mt">Demo: 03000000000 / Admin@123</p>
          </>
        )}

        {tab === 'forgot' && (
          <>
            <h2 style={{ marginTop: 0 }}>🔐 Password Reset</h2>
            {step === 1 && (
              <>
                <label>Registered Email ya Phone</label>
                <input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} placeholder="phone that will receive the OTP" />
                <button className="btn" onClick={forgot}>Send Reset OTP</button>
              </>
            )}
            {step === 2 && (
              <>
                {devOtp && <div className="alert warn">Dev OTP: <b>{devOtp}</b> ({phone})</div>}
                <label>OTP</label>
                <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" />
                <label>Naya Password (min 8)</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button className="btn" onClick={reset}>Reset Password</button>
              </>
            )}
            <p className="muted mt"><a href="#" onClick={(e) => { e.preventDefault(); setTab('password'); }}>← Back to login</a></p>
          </>
        )}
      </div>
    </div>
  );
}
