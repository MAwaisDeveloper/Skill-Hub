import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api, saveSession } from '../api';
import { useApp } from '../context';
import { validateEmail } from '../validation';

const ROLE_HOME = { customer: '/customer', professional: '/professional', admin: '/admin' };

export default function Login() {
  const { login } = useApp();
  const navigate = useNavigate();
  const loc = useLocation();
  const [tab, setTab] = useState('password'); // password | admin | forgot
  const [form, setForm] = useState({ email: '', password: '' });
  const [otp, setOtp] = useState('');
  const [otpSentTo, setOtpSentTo] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [fieldErr, setFieldErr] = useState({});

  const setF = (k, sanitizer, max) => (e) => {
    let v = e.target.value;
    if (sanitizer) v = sanitizer(v);
    if (max) v = v.slice(0, max);
    setForm({ ...form, [k]: v });
    setFieldErr((f) => ({ ...f, [k]: '' }));
  };

  const go = (role) => {
    const from = loc.state?.from;
    if (from && role !== 'admin') navigate(from);
    else navigate(ROLE_HOME[role] || '/customer');
  };

  const wrap = async (fn) => {
    setError(''); setMsg(''); setBusy(true);
    try {
      return await fn();
    } catch (e) { setError(e.message); return null; }
    finally { setBusy(false); }
  };

  const passwordLogin = async () => {
    const emailErr = !form.email.trim() ? 'Email is required.' : validateEmail(form.email);
    const pwdErr = !form.password ? 'Password is required.' : '';
    setFieldErr({ email: emailErr, password: pwdErr });
    if (emailErr || pwdErr) return;
    const data = await wrap(() => api.post('/auth/password/login', { identifier: form.email.trim(), password: form.password }));
    if (data) { saveSession(data); login(data); go(data.user.role); }
  };

  const adminLogin = async () => {
    const idf = form.email.trim();
    const idErr = !idf ? 'Admin email is required.' : validateEmail(idf);
    const pwdErr = !form.password ? 'Password is required.' : '';
    setFieldErr({ email: idErr, password: pwdErr });
    if (idErr || pwdErr) return;
    const data = await wrap(() => api.post('/auth/admin/login', { email: idf, password: form.password }));
    if (data) { saveSession(data); login(data); go('admin'); }
  };

  const forgot = async () => {
    const emailErr = validateEmail(form.email);
    setFieldErr({ email: emailErr });
    if (emailErr) return;
    const res = await wrap(() => api.post('/auth/forgot', { email: form.email.trim() }));
    if (res) {
      setDevOtp(res.dev_otp || null);
      setOtpSentTo(res.sent_to || form.email.trim());
      setMsg('Reset code sent to your email. Enter it with a new password.');
    }
  };

  const reset = async () => {
    if (otp.length < 6) { setFieldErr({ otp: 'Enter the 6-digit code from your email.' }); return; }
    if (!form.password || form.password.length < 8) { setFieldErr({ password: 'New password must be at least 8 characters.' }); return; }
    setFieldErr({});
    const res = await wrap(() => api.post('/auth/reset', { email: form.email.trim(), otp, new_password: form.password }));
    if (res) {
      setMsg('✓ Password changed. Sign in with your email and new password.');
      setTab('password'); setDevOtp(null); setOtp('');
      setForm({ email: form.email, password: '' });
    }
  };

  const errMsg = (k) => (fieldErr[k] ? <p className="field-error">{fieldErr[k]}</p> : null);
  const Count = ({ v, min, max }) => (
    <span className={`char-count ${v.length > max || (min && v.length > 0 && v.length < min) ? 'over' : v.length ? 'ok' : ''}`}>{v.length}{max ? `/${max}` : ''}</span>
  );

  return (
    <div className="auth-split">
      {/* Left brand panel */}
      <div className="auth-brand">
        <div>
          <div className="auth-brand-logo"><span className="logo-dot" /> Hunar<span>.</span></div>
          <h1>Welcome back to your <em>Hunar</em> account.</h1>
          <p>Manage your bookings, wallet and service requests, all from one secure place, with escrow-protected payments every time.</p>
          <ul className="auth-points">
            <li><b>🔒 Escrow-protected payments</b><span>Money is released only when the work is done right</span></li>
            <li><b>✓ Verified professionals</b><span>Every professional passes CNIC + live selfie verification</span></li>
            <li><b>⚡ Instant JazzCash / Easypaisa</b><span>Add or withdraw money in seconds, not days</span></li>
          </ul>
        </div>
        <div className="auth-stats">
          <span className="chip">1000+ Verified professionals</span>
          <span className="chip">98% Satisfaction rate</span>
          <span className="chip">4.9★ Average rating</span>
        </div>
        <div className="auth-brand-foot">© 2026 Hunar · Lahore · Verified Skill, Trusted Service</div>
      </div>

      {/* Right form panel */}
      <div className="auth-form-wrap">
        <div className="auth-card">
          {tab === 'forgot' ? (
            <>
              <h1>Reset your password</h1>
              <p className="sub">Enter your registered email. We will send a one-time code, then you can set a new password and sign in.</p>
            </>
          ) : tab === 'admin' ? (
            <>
              <h1>Administrator sign in</h1>
              <p className="sub">Platform management access, by admin email</p>
            </>
          ) : (
            <>
              <h1>Sign In</h1>
              <p className="sub">Enter your email and password to access your dashboard</p>
            </>
          )}

          {error && <div className="alert error">{error}</div>}
          {msg && <div className="alert success">{msg}</div>}

          {tab !== 'forgot' && (
            <div className="tabs">
              <button className={`tab ${tab === 'password' ? 'active' : ''}`} onClick={() => { setTab('password'); setFieldErr({}); setError(''); setMsg(''); }}>Email & Password</button>
              <button className={`tab ${tab === 'admin' ? 'active' : ''}`} onClick={() => { setTab('admin'); setFieldErr({}); setError(''); setMsg(''); }}>Admin</button>
            </div>
          )}

          {tab === 'password' && (
            <>
              <div className="label-row"><label>Email Address</label><Count v={form.email} max={254} /></div>
              <input
                className={fieldErr.email ? 'invalid' : ''}
                value={form.email}
                onChange={setF('email', (v) => v.trim(), 254)}
                placeholder="ali@gmail.com"
                inputMode="email"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && passwordLogin()}
              />
              {errMsg('email')}

              <div className="label-row" style={{ marginTop: 8 }}><label>Password</label><Count v={form.password} min={8} max={64} /></div>
              <div className="pwd-wrap">
                <input
                  className={fieldErr.password ? 'invalid' : ''}
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={setF('password', null, 64)}
                  placeholder="Your password"
                  onKeyDown={(e) => e.key === 'Enter' && passwordLogin()}
                />
                <button type="button" className="pwd-eye" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? 'Hide password' : 'Show password'}>{showPwd ? '🙈' : '👁'}</button>
              </div>
              {errMsg('password')}

              <div className="row spread" style={{ margin: '2px 0 10px' }}>
                <a href="#" className="muted" style={{ fontSize: 13 }} onClick={(e) => { e.preventDefault(); setTab('forgot'); setFieldErr({}); setMsg(''); setError(''); }}>Forgot password?</a>
              </div>
              <button className="btn btn-block btn-lg" onClick={passwordLogin} disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
              <div className="alert info mt" style={{ fontSize: 13 }}>
                <b>Demo accounts:</b><br />
                Customer — <b>ali@example.com</b> / <b>Customer@123</b><br />
                Professional — <b>sajjad@example.com</b> / <b>Provider@123</b><br />
                Forgot your password? Use <b>Forgot password?</b> above: we email you a code, you set a new password.
              </div>
              <div className="auth-alt mt">
                <b>Don't have an account yet?</b>
                <span className="muted">Join thousands of verified users and get started today.</span>
                <Link to="/register" className="auth-alt-link">Create your free account →</Link>
              </div>
              <p className="muted auth-legal">By signing in, you agree to our <a href="/privacy">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.</p>
            </>
          )}

          {tab === 'admin' && (
            <>
              <div className="label-row"><label>Admin Email</label><Count v={form.email} max={254} /></div>
              <input
                className={fieldErr.email ? 'invalid' : ''}
                value={form.email}
                onChange={setF('email', (v) => v.trim(), 254)}
                placeholder="admin@hunar.pk"
                inputMode="email"
                autoFocus
              />
              {errMsg('email')}
              <div className="label-row" style={{ marginTop: 8 }}><label>Password</label><Count v={form.password} max={64} /></div>
              <input
                type="password"
                className={fieldErr.password ? 'invalid' : ''}
                value={form.password}
                onChange={setF('password', null, 64)}
                onKeyDown={(e) => e.key === 'Enter' && adminLogin()}
              />
              {errMsg('password')}
              <button className="btn btn-block btn-lg" onClick={adminLogin} disabled={busy}>{busy ? 'Signing in…' : 'Sign in as Administrator'}</button>
              <p className="muted mt">Demo: admin@hunar.pk / Admin@123</p>
            </>
          )}

          {tab === 'forgot' && (
            <>
              <div className="label-row"><label>Registered Email</label><Count v={form.email} max={254} /></div>
              <input
                className={fieldErr.email ? 'invalid' : ''}
                value={form.email}
                onChange={setF('email', (v) => v.trim(), 254)}
                placeholder="The email on your account"
                inputMode="email"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && !otpSentTo && forgot()}
              />
              {errMsg('email')}
              {!otpSentTo ? (
                <button className="btn btn-block btn-lg" onClick={forgot} disabled={busy || !form.email}>{busy ? 'Sending…' : 'Send Reset Code'}</button>
              ) : (
                <>
                  {devOtp && <div className="alert warn">Dev OTP: <b>{devOtp}</b> ({otpSentTo})</div>}
                  <div className="label-row" style={{ marginTop: 8 }}><label>OTP (sent to {otpSentTo})</label><Count v={otp} max={6} /></div>
                  <input
                    className={`otp-input ${fieldErr.otp ? 'invalid' : ''}`}
                    value={otp}
                    onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setFieldErr((f) => ({ ...f, otp: '' })); }}
                    placeholder="••••••"
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                  />
                  {errMsg('otp')}
                  <div className="label-row" style={{ marginTop: 8 }}><label>New Password (minimum 8 characters)</label><Count v={form.password} max={64} /></div>
                  <input
                    type="password"
                    className={fieldErr.password ? 'invalid' : ''}
                    value={form.password}
                    onChange={setF('password', null, 64)}
                    placeholder="••••••••"
                    onKeyDown={(e) => e.key === 'Enter' && reset()}
                  />
                  {errMsg('password')}
                  <button className="btn btn-block btn-lg" onClick={reset} disabled={busy}>{busy ? 'Resetting…' : 'Reset Password'}</button>
                  <p className="muted mt"><a href="#" onClick={(e) => { e.preventDefault(); setOtpSentTo(''); setOtp(''); setMsg(''); }}>← Change email / resend</a></p>
                </>
              )}
              <p className="muted mt"><a href="#" onClick={(e) => { e.preventDefault(); setTab('password'); setFieldErr({}); setError(''); setMsg(''); }}>← Back to sign in</a></p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
