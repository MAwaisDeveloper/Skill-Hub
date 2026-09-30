import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, saveSession } from '../api';
import { useApp } from '../context';
import {
  validateName, validatePhone, validateEmail, validatePassword,
  passwordStrength, passwordChecks, NAME_MAX, PWD_MAX,
} from '../validation';

export default function Register() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('customer');
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '', confirm: '' });
  const [touched, setTouched] = useState({});
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCats, setSelectedCats] = useState([]);
  const [areas, setAreas] = useState('');
  const [proForm, setProForm] = useState({ cnic_number: '', experience_years: '', bio: '', payout_account: '', payout_provider: 'jazzcash' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    api.get('/customer/categories').then(setCategories).catch(() => {});
  }, []);

  const set = (k, sanitizer) => (e) => {
    const raw = e.target.value;
    const value = sanitizer ? sanitizer(raw) : raw;
    setForm({ ...form, [k]: value });
  };
  const setP = (k) => (e) => setProForm({ ...proForm, [k]: e.target.value });
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));

  // Live field errors (shown once a field is touched)
  const errors = {
    full_name: validateName(form.full_name),
    phone: validatePhone(form.phone),
    email: validateEmail(form.email),
    password: validatePassword(form.password),
    confirm: form.confirm && form.confirm !== form.password ? 'Passwords do not match.' : '',
  };
  const Count = ({ v, min, max }) => (
    <span className={`char-count ${v.length > max || (min && v.length > 0 && v.length < min) ? 'over' : v.length ? 'ok' : ''}`}>{v.length}{max ? `/${max}` : ''}</span>
  );
  const fieldError = (k) => (touched[k] ? errors[k] : '');
  const strength = passwordStrength(form.password);
  const checks = passwordChecks(form.password);
  const confirmMatches = form.confirm.length > 0 && form.confirm === form.password;

  const validStep1 = !errors.full_name && !errors.phone && !errors.email && !errors.password && form.confirm.length > 0 && confirmMatches;

  const register = async () => {
    setError('');
    setTouched({ full_name: true, phone: true, email: true, password: true, confirm: true });
    if (errors.full_name) { setError(errors.full_name); return; }
    if (errors.phone) { setError(errors.phone); return; }
    if (errors.email) { setError(errors.email); return; }
    if (errors.password) { setError(errors.password); return; }
    if (!form.confirm) { setError('Please confirm your password.'); return; }
    if (form.confirm !== form.password) { setError('Password and confirmation do not match.'); return; }
    setBusy(true);
    try {
      const res = await api.post('/auth/register', { ...form, role });
      setDevOtp(res.dev_otp || null);
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setError(''); setBusy(true);
    try {
      // OTP issued during registration; login via verify endpoint
      const data = await api.post('/auth/otp/verify', { phone: form.phone, otp });
      saveSession(data);
      login(data);
      if (role === 'professional') {
        setStep(3);
      } else {
        navigate('/customer');
      }
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const completePro = async () => {
    setError(''); setBusy(true);
    try {
      const session = JSON.parse(localStorage.getItem('hunar_session'));
      await api.post('/auth/professional/profile', {
        ...proForm,
        experience_years: Number(proForm.experience_years || 0),
        category_ids: selectedCats,
        areas: areas.split(',').map((a) => a.trim()).filter(Boolean),
      }, session.token);
      navigate('/professional');
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const stepMeta = step === 1 ? ['Create your account', 'Tell us who you are and set your login credentials.']
    : step === 2 ? ['Verify your phone', `We sent a 6-digit code to ${form.phone}.`]
    : ['Professional profile', 'Add your work details — an administrator verifies them before customers can book you.'];

  return (
    <div className="auth-split">
      <div className="auth-brand">
        <div>
          <div className="auth-brand-logo"><span className="logo-dot" /> Hunar<span>.</span></div>
          {role === 'customer' ? (
            <>
              <h1>Get things done, <em>worry-free.</em></h1>
              <p>Join thousands of customers who book verified service professionals with escrow-protected payments: money moves only when the work is done right.</p>
            </>
          ) : (
            <>
              <h1>Grow your professional business <em>with confidence.</em></h1>
              <p>Receive job requests, build your 5-star reputation and get paid directly to your mobile wallet: no chasing payments, ever.</p>
            </>
          )}
          <ul className="auth-points">
            {role === 'customer' ? (
              <>
                <li><b>✓ Escrow protection</b><span>Pay only when the work meets your expectations: the platform holds your money until you confirm</span></li>
                <li><b>✓ Instant wallet top-up</b><span>Add money via JazzCash / Easypaisa in seconds and book immediately</span></li>
                <li><b>✓ Verified professionals only</b><span>Every professional passes CNIC + live selfie verification before they can accept a single booking</span></li>
              </>
            ) : (
              <>
                <li><b>✓ Free professional verification</b><span>Upload your CNIC + selfie once: approval usually takes less than a day, no charges ever</span></li>
                <li><b>✓ 90% direct payout</b><span>Keep 90% of every completed job, credited straight to your wallet the moment work is confirmed</span></li>
                <li><b>✓ Fast withdrawals</b><span>Cash out to JazzCash / Easypaisa anytime: the gateway transfers automatically</span></li>
              </>
            )}
          </ul>
        </div>
        <div className="auth-brand-foot">© 2026 Hunar · Lahore · Verified Skill, Trusted Service</div>
      </div>

      <div className="auth-form-wrap">
        <div className="auth-card">
          {/* Steps indicator */}
          <div className="reg-steps">
            {['Account', 'Verify', role === 'professional' ? 'Profile' : 'Done'].map((label, i) => {
              const n = i + 1;
              const state = step > n ? 'done' : step === n ? 'current' : 'todo';
              const hidden = role === 'customer' && n === 3;
              if (hidden) return null;
              return (
                <React.Fragment key={label}>
                  {i > 0 && <span className={`reg-line ${step > i ? 'done' : ''}`} />}
                  <div className={`reg-step ${state}`}>
                    <span className="reg-dot">{step > n ? '✓' : n}</span>
                    <span className="reg-lbl">{label}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>

          <p className="reg-eyebrow">STEP {step} OF {role === 'professional' ? 3 : 2}</p>
          <h1>{stepMeta[0]}</h1>
          <p className="sub">{stepMeta[1]}</p>

          {error && <div className="alert error">{error}</div>}
          {devOtp && step === 2 && <div className="alert warn">Dev OTP: <b>{devOtp}</b> (SMS gateway integration pending)</div>}

          {step === 1 && (
            <>
              <label>I am a</label>
              <div className="role-cards">
                <button type="button" className={`role-card ${role === 'customer' ? 'active' : ''}`} onClick={() => setRole('customer')}>
                  <span className="rc-ico">🛒</span>
                  <b>Customer</b>
                  <span className="muted">I need a service</span>
                </button>
                <button type="button" className={`role-card ${role === 'professional' ? 'active' : ''}`} onClick={() => setRole('professional')}>
                  <span className="rc-ico">🛠</span>
                  <b>Professional</b>
                  <span className="muted">I provide services</span>
                </button>
              </div>

              <div className="label-row"><label>Full Name</label><Count v={form.full_name} min={3} max={NAME_MAX} /></div>
              <input
                className={fieldError('full_name') ? 'invalid' : touched.full_name && !errors.full_name && form.full_name ? 'valid' : ''}
                value={form.full_name}
                onChange={set('full_name', (v) => v.replace(/[^A-Za-z ]/g, '').replace(/\s{2,}/g, ' ').slice(0, NAME_MAX))}
                onBlur={blur('full_name')}
                placeholder="e.g. Ali Raza"
                autoFocus
              />
              {fieldError('full_name')
                ? <p className="field-error">{fieldError('full_name')}</p>
                : touched.full_name && form.full_name && !errors.full_name && <p className="field-ok">✓ Looks good</p>}

              <div className="label-row"><label>Phone Number</label><Count v={form.phone} min={11} max={11} /></div>
              <input
                className={fieldError('phone') ? 'invalid' : touched.phone && !errors.phone && form.phone ? 'valid' : ''}
                value={form.phone}
                onChange={set('phone', (v) => v.replace(/\D/g, '').slice(0, 11))}
                onBlur={blur('phone')}
                placeholder="03001234567"
                inputMode="numeric"
                maxLength={11}
              />
              {fieldError('phone')
                ? <p className="field-error">{fieldError('phone')}</p>
                : <p className="field-hint">{form.phone.length}/11 digits — digits only, starts with 03</p>}

              <div className="label-row"><label>Email Address</label><Count v={form.email} max={254} /></div>
              <input
                className={fieldError('email') ? 'invalid' : touched.email && form.email && !errors.email ? 'valid' : ''}
                value={form.email}
                onChange={set('email', (v) => v.trim(), 254)}
                onBlur={blur('email')}
                placeholder="ali@gmail.com (used to sign in and recover your password)"
                inputMode="email"
              />
              {fieldError('email') && <p className="field-error">{fieldError('email')}</p>}

              <div className="label-row"><label>Password</label><Count v={form.password} min={8} max={64} /></div>
              <div className="pwd-wrap">
                <input
                  className={fieldError('password') ? 'invalid' : ''}
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  onBlur={blur('password')}
                  placeholder="Create a strong password"
                  maxLength={PWD_MAX}
                />
                <button type="button" className="pwd-eye" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? 'Hide password' : 'Show password'}>{showPwd ? '🙈' : '👁'}</button>
              </div>
              {form.password && (
                <div className="strength">
                  <div className="strength-bars">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span key={i} className={`sbar ${i <= strength.score ? 'on' : ''}`} style={i <= strength.score ? { background: strength.color } : {}} />
                    ))}
                  </div>
                  <span className="strength-lbl" style={{ color: strength.color }}>{strength.label}</span>
                </div>
              )}
              <ul className="pwd-rules">
                <li className={checks.length ? 'ok' : ''}>{checks.length ? '✓' : '•'} 8–64 characters</li>
                <li className={checks.upper ? 'ok' : ''}>{checks.upper ? '✓' : '•'} Uppercase letter</li>
                <li className={checks.lower ? 'ok' : ''}>{checks.lower ? '✓' : '•'} Lowercase letter</li>
                <li className={checks.digit ? 'ok' : ''}>{checks.digit ? '✓' : '•'} Number</li>
                <li className={checks.symbol ? 'ok' : ''}>{checks.symbol ? '✓' : '•'} Symbol (recommended)</li>
              </ul>
              {fieldError('password') && <p className="field-error">{fieldError('password')}</p>}

              <div className="label-row"><label>Confirm Password</label><Count v={form.confirm} max={64} /></div>
              <div className="pwd-wrap">
                <input
                  className={fieldError('confirm') ? 'invalid' : confirmMatches ? 'valid' : ''}
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirm}
                  onChange={set('confirm')}
                  onBlur={blur('confirm')}
                  placeholder="Re-enter your password"
                  maxLength={PWD_MAX}
                  onKeyDown={(e) => e.key === 'Enter' && register()}
                />
                <button type="button" className="pwd-eye" onClick={() => setShowConfirm(!showConfirm)} aria-label={showConfirm ? 'Hide password' : 'Show password'}>{showConfirm ? '🙈' : '👁'}</button>
              </div>
              {fieldError('confirm')
                ? <p className="field-error">{fieldError('confirm')}</p>
                : confirmMatches && <p className="field-ok">✓ Passwords match</p>}

              <button className="btn btn-block btn-lg" onClick={register} disabled={busy || !validStep1} title={validStep1 ? '' : 'Complete every field correctly to continue'}>
                {busy ? 'Creating account…' : 'Create Account'}
              </button>
              <p className="muted mt">Already have an account? <Link to="/login"><b>Sign in</b></Link></p>
            </>
          )}

          {step === 2 && (
            <>
              <div className="label-row"><label>6-digit OTP (sent to {form.phone})</label><Count v={otp} max={6} /></div>
              <input className="otp-input" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} placeholder="••••••" maxLength={6} inputMode="numeric" autoFocus onKeyDown={(e) => e.key === 'Enter' && verify()} />
              <button className="btn btn-block btn-lg" onClick={verify} disabled={busy || otp.length < 6}>{busy ? 'Verifying…' : 'Verify & Continue'}</button>
              <p className="muted mt"><Link to="/login">← Back to sign in</Link></p>
            </>
          )}

          {step === 3 && (
            <>
              <label>CNIC Number (13 digits)</label>
              <input value={proForm.cnic_number} onChange={setP('cnic_number')} placeholder="3520212345671" maxLength={13} inputMode="numeric" autoFocus />
              <label>Experience (years)</label>
              <input type="number" value={proForm.experience_years} onChange={setP('experience_years')} min={0} max={60} />
              <label>Short Bio (shown to customers)</label>
              <textarea value={proForm.bio} onChange={setP('bio')} rows={3} placeholder="e.g. 8 years of experience in AC installation and repair" maxLength={500} />
              <label>Categories (the work you do)</label>
              <div className="row" style={{ rowGap: 6 }}>
                {categories.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      style={{ width: 'auto', margin: 0 }}
                      checked={selectedCats.includes(c.id)}
                      onChange={(e) =>
                        setSelectedCats(e.target.checked ? [...selectedCats, c.id] : selectedCats.filter((x) => x !== c.id))
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </div>
              <label>Areas Served (comma separated)</label>
              <input value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="Gulberg III, DHA Phase 5" />
              <label>Payout Account Number (JazzCash / Easypaisa)</label>
              <input value={proForm.payout_account} onChange={setP('payout_account')} placeholder="03XXXXXXXXX" inputMode="numeric" maxLength={11} />
              <label>Payout Provider</label>
              <select value={proForm.payout_provider} onChange={setP('payout_provider')}>
                <option value="jazzcash">JazzCash</option>
                <option value="easypaisa">Easypaisa</option>
              </select>
              <button className="btn btn-block btn-lg" onClick={completePro} disabled={busy || !proForm.cnic_number}>{busy ? 'Submitting…' : 'Submit for Verification'}</button>
              <p className="muted mt">An administrator manually reviews your CNIC + selfie. Until verified, customers cannot book you (system rule).</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
