import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context';
import { api } from '../api';

const MENUS = {
  customer: [
    { to: '/customer', label: 'Overview', ico: '⌂' },
    { to: '/book', label: 'Book a Service', ico: '➕' },
    { to: '/customer/bookings', label: 'My Bookings', ico: '🗂' },
    { to: '/customer/wallet', label: 'Wallet & Statement', ico: '👛' },
    { to: '/customer/contracts', label: 'Bulk / Contract Hire', ico: '📑' },
    { to: '/customer/profile', label: 'Profile & Addresses', ico: '👤' },
    { to: '/customer/notifications', label: 'Notifications', ico: '🔔' },
    { to: '/settings', label: 'Settings & Profile', ico: '⚙' },
    { to: '/guide', label: 'How Hunar Works', ico: '📘' },
  ],
  professional: [
    { to: '/professional', label: 'Overview', ico: '⌂' },
    { to: '/professional/jobs', label: 'Job Requests', ico: '🛠' },
    { to: '/professional/wallet', label: 'Wallet & Earnings', ico: '👛' },
    { to: '/professional/slots', label: 'Availability Slots', ico: '🗓' },
    { to: '/professional/contracts', label: 'Contract Marketplace', ico: '📑' },
    { to: '/professional/profile', label: 'Profile & Verification', ico: '✅' },
    { to: '/professional/notifications', label: 'Notifications', ico: '🔔' },
    { to: '/settings', label: 'Settings & Profile', ico: '⚙' },
    { to: '/guide', label: 'How Hunar Works', ico: '📘' },
  ],
  admin: [
    { to: '/admin', label: 'Overview', ico: '⌂' },
    { to: '/admin', label: 'Verifications', ico: '✅', tab: 'verifications' },
    { to: '/admin', label: 'Bookings & Filters', ico: '🗂', tab: 'bookings' },
    { to: '/admin', label: 'Wallets & Statements', ico: '👛', tab: 'wallets' },
    { to: '/admin', label: 'Top-ups', ico: '⬆', tab: 'topups' },
    { to: '/admin', label: 'Penalties', ico: '⚠', tab: 'penalties' },
    { to: '/admin', label: 'Refunds', ico: '↩', tab: 'refunds' },
    { to: '/admin', label: 'Disputes', ico: '⚖', tab: 'disputes' },
    { to: '/admin', label: 'Messages', ico: '💬', tab: 'messages' },
    { to: '/admin', label: 'Payouts & Withdrawals', ico: '💸', tab: 'payouts' },
    { to: '/admin', label: 'Users (All Roles)', ico: '👥', tab: 'users' },
    { to: '/admin', label: 'Reports', ico: '📈', tab: 'reports' },
    { to: '/admin', label: 'Settings', ico: '⚙', tab: 'settings' },
    { to: '/settings', label: 'My Profile & Password', ico: '🔧' },
  ],
};

// Database modules tree (professional-projects style: expandable section with table links)
const MODULE_TREE = {
  customer: [
    { table: 'bookings', label: 'Bookings' },
    { table: 'wallets', label: 'Wallet' },
    { table: 'wallet_transactions', label: 'Wallet Transactions' },
    { table: 'wallet_topups', label: 'Wallet Top-ups' },
    { table: 'payments', label: 'Payments' },
    { table: 'commissions', label: 'Commission on my deals' },
    { table: 'refunds', label: 'My Refunds' },
    { table: 'contracts', label: 'My Contracts' },
    { table: 'reviews', label: 'My Reviews' },
    { table: 'notifications', label: 'Notifications' },
    { table: 'platform_settings', label: 'Platform Rules' },
  ],
  professional: [
    { table: 'bookings', label: 'My Jobs' },
    { table: 'payouts', label: 'Payouts' },
    { table: 'professional_penalties', label: 'My Penalties' },
    { table: 'wallets', label: 'Wallet' },
    { table: 'wallet_transactions', label: 'Wallet Transactions' },
    { table: 'withdrawals', label: 'Withdrawals' },
    { table: 'availability_slots', label: 'Availability Slots' },
    { table: 'contract_bids', label: 'Contract Bids' },
    { table: 'reviews', label: 'Reviews Received' },
    { table: 'verification_logs', label: 'Verification Logs' },
    { table: 'commissions', label: 'Commission on my deals' },
    { table: 'platform_settings', label: 'Platform Rules' },
  ],
  admin: [
    { table: 'users', label: 'Users (all roles)' },
    { table: 'wallets', label: 'Wallets (all)' },
    { table: 'wallet_transactions', label: 'Wallet Transactions (all)' },
    { table: 'wallet_topups', label: 'Top-ups (all)' },
    { table: 'withdrawals', label: 'Withdrawals (all)' },
    { table: 'professional_penalties', label: 'Penalties (all)' },
    { table: 'bookings', label: 'Bookings (all)' },
    { table: 'messages', label: 'Messages (all)' },
    { table: 'commissions', label: 'Commissions (all)' },
    { table: 'payouts', label: 'Payouts (all)' },
    { table: 'refunds', label: 'Refunds (all)' },
    { table: 'disputes', label: 'Disputes (all)' },
    { table: 'reviews', label: 'Reviews (all)' },
    { table: 'contracts', label: 'Contracts (all)' },
    { table: 'platform_settings', label: 'Platform Settings' },
  ],
};

function ModulesSection({ role, onNavigate }) {
  const [open, setOpen] = React.useState(window.location.pathname.includes('/modules'));
  const tables = MODULE_TREE[role] || [];
  return (
    <div className="side-section">
      <button type="button" className={`side-link section-toggle ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
        <span className="ico">🗃</span> Database Modules
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="side-sub">
          {role !== 'admin' && (
            <NavLink to={`/${role}/modules`} className={({ isActive }) => `side-link sub ${isActive ? 'active' : ''}`} onClick={onNavigate}>
              <span className="ico">▦</span> Modules Overview (live counts)
            </NavLink>
          )}
          {tables.map((t) => (
            <NavLink key={t.table} to={`/modules-data/${t.table}`} className={({ isActive }) => `side-link sub ${isActive ? 'active' : ''}`} onClick={onNavigate}>
              <span className="ico">·</span> {t.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
};

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
    const fetchUnread = () => api.get(ep, session.token).then((rows) => setUnread(rows.length)).catch(() => {});
    fetchUnread();
    const t = setInterval(fetchUnread, 15000);
    return () => clearInterval(t);
  }, [session, role]);

  const name = session?.profile?.full_name || session?.user?.phone || 'User';
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const sidebar = (
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="side-label">{role === 'admin' ? 'Administration' : role === 'professional' ? 'Professional Panel' : 'Customer Panel'}</div>
      {menu.map((m) => (
        <NavLink
          key={m.to + m.label}
          to={m.to}
          state={m.tab ? { tab: m.tab } : undefined}
          className={({ isActive }) => `side-link ${isActive && !m.tab ? 'active' : ''}`}
          onClick={() => setMenuOpen(false)}
        >
          <span className="ico">{m.ico}</span> {m.label}
        </NavLink>
      ))}
      <ModulesSection role={role} onNavigate={() => setMenuOpen(false)} />
      <div className="side-footer">
        Hunar Platform v1.0<br />Verified Skill, Trusted Service
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
