import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context';
import { api } from '../api';

const MENUS = {
  customer: [
    { to: '/customer', label: 'Dashboard', ico: '⌂' },
    { to: '/book', label: 'Book a Service', ico: '➕' },
    { to: '/customer/bookings', label: 'My Bookings', ico: '🗂' },
    {
      label: 'My Wallet', ico: '👛', children: [
        { to: '/customer/wallet', label: 'Balance & Add Money' },
        { to: '/customer/wallet/statement', label: 'Transaction History' },
        { to: '/customer/wallet/topups', label: 'Top-ups (JazzCash/Easypaisa)' },
        { to: '/customer/wallet/refunds', label: 'Refunds' },
      ],
    },
    { to: '/customer/withdraw', label: 'Withdraw to JazzCash/Easypaisa', ico: '💸' },
    { to: '/customer/contracts', label: 'Bulk / Contract Hire', ico: '📑' },
    { to: '/customer/reviews', label: 'My Reviews', ico: '★' },
    { to: '/customer/notifications', label: 'Notifications', ico: '🔔' },
    { to: '/customer/profile', label: 'Profile & Addresses', ico: '👤' },
    { to: '/settings', label: 'Settings', ico: '⚙' },
    { to: '/guide', label: 'How Hunar Works', ico: '📘' },
  ],
  professional: [
    { to: '/professional', label: 'Dashboard', ico: '⌂' },
    { to: '/professional/jobs', label: 'Job Requests', ico: '🛠' },
    {
      label: 'My Wallet', ico: '👛', children: [
        { to: '/professional/wallet', label: 'Earnings & Withdraw' },
        { to: '/professional/wallet/statement', label: 'Transaction History' },
        { to: '/professional/wallet/payouts', label: 'Payouts' },
      ],
    },
    { to: '/professional/slots', label: 'Availability Slots', ico: '🗓' },
    { to: '/professional/contracts', label: 'Contract Marketplace', ico: '📑' },
    { to: '/professional/reviews', label: 'Reviews Received', ico: '★' },
    { to: '/professional/profile', label: 'Profile & Verification', ico: '✅' },
    { to: '/professional/notifications', label: 'Notifications', ico: '🔔' },
    { to: '/settings', label: 'Settings', ico: '⚙' },
    { to: '/guide', label: 'How Hunar Works', ico: '📘' },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', ico: '⌂' },
    { to: '/admin', label: 'Verifications', ico: '✅', tab: 'verifications' },
    { to: '/admin', label: 'Bookings', ico: '🗂', tab: 'bookings' },
    { to: '/admin', label: 'Disputes', ico: '⚖', tab: 'disputes' },
    { to: '/admin', label: 'Wallets', ico: '👛', tab: 'wallets' },
    { to: '/admin', label: 'Transactions', ico: '💳', tab: 'transactions' },
    { to: '/admin', label: 'Top-ups', ico: '⬆', tab: 'topups' },
    { to: '/admin', label: 'Withdrawals', ico: '💸', tab: 'payouts' },
    { to: '/admin', label: 'Penalties', ico: '⚠', tab: 'penalties' },
    { to: '/admin', label: 'Refunds', ico: '↩', tab: 'refunds' },
    { to: '/admin', label: 'Messages', ico: '💬', tab: 'messages' },
    { to: '/admin', label: 'Users', ico: '👥', tab: 'users' },
    { to: '/admin', label: 'Reports', ico: '📈', tab: 'reports' },
    { to: '/admin', label: 'Platform Settings', ico: '⚙', tab: 'settings' },
    { to: '/settings', label: 'My Profile & Password', ico: '🔧' },
  ],
};

// Expandable sidebar group (Wallet ▾ style)
function SideGroup({ item, onNavigate }) {
  const active = item.children.some((c) => window.location.pathname === c.to);
  const [open, setOpen] = useState(active);
  return (
    <div className="side-section">
      <button type="button" className={`side-link section-toggle ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
        <span className="ico">{item.ico}</span> {item.label}
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="side-sub">
          {item.children.map((c) => (
            <NavLink key={c.to + c.label} to={c.to} className={({ isActive }) => `side-link sub ${isActive ? 'active' : ''}`} onClick={onNavigate}>
              <span className="ico">·</span> {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children, title, subtitle, actions }) {
  const { session, logout } = useApp();
  const navigate = useNavigate();
  const role = session?.user?.role || 'customer';
  const menu = MENUS[role] || [];
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!session?.token) return;
    const endpoints = {
      customer: '/customer/notifications?unread_only=1',
      professional: '/professional/notifications?unread_only=1',
    };
    const ep = endpoints[role];
    if (!ep) return;
    const fetchUnread = () => api.get(ep, session.token).then((rows) => setUnread(Array.isArray(rows) ? rows.length : 0)).catch(() => {});
    fetchUnread();
    const t = setInterval(fetchUnread, 15000);
    return () => clearInterval(t);
  }, [session, role]);

  const name = session?.profile?.full_name || session?.user?.phone || 'User';
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const sidebar = (
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="side-label">{role === 'admin' ? 'Administration' : role === 'professional' ? 'Professional Panel' : 'Customer Panel'}</div>
      {menu.map((m) =>
        m.children ? (
          <SideGroup key={m.label} item={m} onNavigate={() => setMenuOpen(false)} />
        ) : (
          <NavLink
            key={m.to + m.label}
            to={m.to}
            state={m.tab ? { tab: m.tab } : undefined}
            className={({ isActive }) => `side-link ${isActive && !m.tab ? 'active' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            <span className="ico">{m.ico}</span> {m.label}
          </NavLink>
        )
      )}
      <div className="side-footer">
        Hunar Platform v2.0<br />Verified Skill, Trusted Service
      </div>
    </aside>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="row" style={{ gap: 12 }}>
          <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} title="Menu">☰</button>
          <NavLink to="/" className="brand">
            <span className="logo-dot" /> Hunar<span>.</span>
          </NavLink>
        </div>
        <div className="topbar-right">
          <button className="bell" title="Notifications" onClick={() => navigate(role === 'professional' ? '/professional/notifications' : role === 'admin' ? '/admin' : '/customer/notifications')}>
            🔔{unread > 0 && <span className="dot">{unread}</span>}
          </button>
          <div className="who">
            <div className="name">{name}</div>
            <div className="role">{role === 'professional' ? 'Service Professional' : role}</div>
          </div>
          <div className="avatar">{initials}</div>
          <button className="btn small secondary" onClick={() => { logout(); navigate('/login'); }}>Logout</button>
        </div>
      </header>

      <div className="shell-body">
        {sidebar}
        {menuOpen && <div className="side-overlay" onClick={() => setMenuOpen(false)} />}
        <main className="main">
          {(title || actions) && (
            <div className="page-head">
              <div>
                <h1>{title}</h1>
                {subtitle && <p className="sub">{subtitle}</p>}
              </div>
              <div className="row">{actions}</div>
            </div>
          )}
          {children}
        </main>
      </div>

      <footer className="footer">
        <span><b>Hunar</b> — Booking-to-payout marketplace for home services & skilled trades, Lahore</span>
        <span><a href="/privacy" style={{ color: '#b9cfc3' }}>Privacy Policy</a> · Escrow-protected payments · 10% commission · Manual CNIC verification</span>
      </footer>
    </div>
  );
}
