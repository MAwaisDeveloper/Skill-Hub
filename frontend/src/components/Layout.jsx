import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
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
    { to: '/admin?tab=verifications', label: 'Verifications', ico: '✅' },
    { to: '/admin?tab=bookings', label: 'Bookings', ico: '🗂' },
    { to: '/admin?tab=disputes', label: 'Disputes', ico: '⚖' },
    { to: '/admin?tab=wallets', label: 'Wallets', ico: '👛' },
    { to: '/admin?tab=transactions', label: 'Transactions', ico: '💳' },
    { to: '/admin?tab=topups', label: 'Top-ups', ico: '⬆' },
    { to: '/admin?tab=payouts', label: 'Withdrawals', ico: '💸' },
    { to: '/admin?tab=provider_accounts', label: 'Provider Accounts', ico: '🏦' },
    { to: '/admin?tab=penalties', label: 'Penalties', ico: '⚠' },
    { to: '/admin?tab=refunds', label: 'Refunds', ico: '↩' },
    { to: '/admin?tab=messages', label: 'Messages', ico: '💬' },
    { to: '/admin?tab=users', label: 'Users', ico: '👥' },
    { to: '/admin?tab=reports', label: 'Reports', ico: '📈' },
    { to: '/admin?tab=settings', label: 'Platform Rules', ico: '⚙' },
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
  const loc = useLocation();
  // Collapsible sidebar: desktop par hide/show toggle, state saved across pages
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('hunar_sidebar_collapsed') === '1');
  // Query-param links (/admin?tab=x) ko exact match karna hoga: NavLink sirf path dekhta hai
  const isActiveLink = (to) => {
    const [path, query] = to.split('?');
    if (loc.pathname !== path) return false;
    if (query) return loc.search === `?${query}`;
    return loc.search === ''; // plain link (e.g. Dashboard) sirf tab-query ke bina active
  };
  const role = session?.user?.role || 'customer';
  const menu = MENUS[role] || [];
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifItems, setNotifItems] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const notifTimer = React.useRef(null);

  useEffect(() => {
    if (!session?.token) return;
    const endpoints = {
      customer: '/customer/notifications',
      professional: '/professional/notifications',
      admin: '/admin/notifications',
    };
    const ep = endpoints[role];
    if (!ep) return;
    const fetchNotifs = () => api.get(ep, session.token).then((rows) => {
      const list = Array.isArray(rows) ? rows : rows.rows || [];
      setNotifItems(list.slice(0, 4));
      setUnread(list.filter((n) => !n.read_status).length);
    }).catch(() => {});
    fetchNotifs();
    const t = setInterval(fetchNotifs, 15000);
    return () => clearInterval(t);
  }, [session, role]);

  // Close profile dropdown on outside click / route change
  useEffect(() => {
    if (!profileOpen) return;
    const close = () => setProfileOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [profileOpen]);
  useEffect(() => { setProfileOpen(false); setNotifOpen(false); }, [loc.pathname, loc.search]);

  // Header identity: profile ka full name (admin ke liye backend 'Administrator' bhejta hai), fallback order safe
  const ROLE_LABELS = { customer: 'Customer', professional: 'Professional', admin: 'Administrator' };
  const name = session?.profile?.full_name || (role === 'admin' ? 'Administrator' : session?.user?.email?.split('@')[0]) || 'User';
  const roleLabel = ROLE_LABELS[role] || role;
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const toggleSidebar = () => {
    setCollapsed((c) => {
      localStorage.setItem('hunar_sidebar_collapsed', c ? '0' : '1');
      return !c;
    });
  };

  const sidebar = (
    <aside className={`sidebar ${menuOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
      <button type="button" className="side-collapse" onClick={toggleSidebar} title={collapsed ? 'Show sidebar' : 'Hide sidebar'} aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="9.5" y1="4" x2="9.5" y2="20" />
          <line className="collapse-arrow" x1={collapsed ? '13.5' : '5.5'} y1="12" x2={collapsed ? '17.5' : '6.5'} y2="12" />
          {collapsed
            ? <polyline className="collapse-arrow" points="15.5,9.5 18,12 15.5,14.5" />
            : <polyline className="collapse-arrow" points="7,9.5 4.5,12 7,14.5" />}
        </svg>
      </button>
      <div className="side-label">{role === 'admin' ? 'Administration' : role === 'professional' ? 'Service Provider Panel' : 'Customer Panel'}</div>
      {menu.map((m) =>
        m.children ? (
          <SideGroup key={m.label} item={m} onNavigate={() => setMenuOpen(false)} />
        ) : (
          <NavLink
            key={m.to + m.label}
            to={m.to}
            className={() => `side-link ${isActiveLink(m.to) ? 'active' : ''}`}
            onClick={() => setMenuOpen(false)}
            title={m.label}
          >
            <span className="ico">{m.ico}</span> <span className="side-text">{m.label}</span>
          </NavLink>
        )
      )}
      <div className="side-footer" />
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
          {/* Notifications bell — hover par latest 4 ka dropdown, click par full page */}
          <div
            className="top-dd"
            onMouseEnter={() => { clearTimeout(notifTimer.current); setNotifOpen(true); }}
            onMouseLeave={() => { notifTimer.current = setTimeout(() => setNotifOpen(false), 180); }}
          >
            <button
              className="bell"
              title="Notifications"
              onClick={() => navigate(role === 'professional' ? '/professional/notifications' : role === 'admin' ? '/admin?tab=messages' : '/customer/notifications')}
            >
              🔔{unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
            </button>
            {notifOpen && (
              <div className="top-dd-panel" role="menu" aria-label="Latest notifications">
                <div className="dd-head">Notifications {unread > 0 && <span className="dd-count">{unread} new</span>}</div>
                {notifItems.length === 0 && <div className="dd-empty">You're all caught up: no notifications yet.</div>}
                {notifItems.map((n) => (
                  <div key={n.id} className={`dd-item ${n.read_status ? '' : 'unread'}`}>
                    <span className="dd-ico">{{ booking: '🗂', wallet: '👛', payout: '💸', review: '★', dispute: '⚖', chat: '💬', contract: '📑', verification: '✅' }[n.type] || '🔔'}</span>
                    <span className="dd-body">
                      <span className="dd-msg">{n.message?.slice(0, 76)}{n.message?.length > 76 ? '…' : ''}</span>
                      <span className="dd-time">{String(n.created_at || '').slice(0, 16)}</span>
                    </span>
                  </div>
                ))}
                <button
                  className="dd-viewall"
                  onClick={() => navigate(role === 'professional' ? '/professional/notifications' : role === 'admin' ? '/admin?tab=messages' : '/customer/notifications')}
                >View all notifications →</button>
              </div>
            )}
          </div>
          {/* Profile avatar dropdown — click par open (example jaisa) */}
          <div className="top-dd" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="avatar-btn" onClick={(e) => { e.stopPropagation(); setProfileOpen(!profileOpen); }} aria-label="Account menu">
              <div className="avatar">{initials}</div>
              <span className="avatar-caret">▾</span>
            </button>              <div className="who">
                <div className="name">{name}</div>
                <div className="role">{roleLabel}</div>
              </div>
            {profileOpen && (
              <div className="top-dd-panel profile-dd" onClick={(e) => e.stopPropagation()}>
                <div className="dd-head dd-user"><b>{name}</b><span>{session?.profile?.email || session?.user?.email || session?.user?.phone}</span></div>
                <button className="dd-item dd-link" onClick={() => { setProfileOpen(false); navigate('/settings'); }}>
                  <span className="dd-ico">👤</span><span className="dd-body">My Profile & Settings</span>
                </button>
                {role === 'customer' && (
                  <button className="dd-item dd-link" onClick={() => { setProfileOpen(false); navigate('/customer/profile'); }}>
                    <span className="dd-ico">📍</span><span className="dd-body">Profile & Addresses</span>
                  </button>
                )}
                {role === 'professional' && (
                  <button className="dd-item dd-link" onClick={() => { setProfileOpen(false); navigate('/professional/profile'); }}>
                    <span className="dd-ico">✅</span><span className="dd-body">Profile & Verification</span>
                  </button>
                )}
                <button className="dd-item dd-link dd-danger" onClick={() => { logout(); navigate('/login'); }}>
                  <span className="dd-ico">⏻</span><span className="dd-body">Logout</span>
                </button>
              </div>
            )}
          </div>
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
        <span><b>Hunar</b> · Verified services, secure payments</span>
        <span><a href="/privacy" style={{ color: '#b9cfc3' }}>Privacy Policy</a> · Escrow-protected payments · Manual CNIC verification</span>
      </footer>
    </div>
  );
}
