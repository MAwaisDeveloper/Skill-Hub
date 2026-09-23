import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { Empty } from '../components/ui';

export default function ModulesPage() {
  const { session } = useApp();
  const token = session?.token;
  const role = session?.user?.role;
  const [modules, setModules] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/modules/${role}`, token).then(setModules).catch((e) => setError(e.message));
  }, [role]);

  const total = modules.reduce((a, m) => a + (m.rows || 0), 0);

  return (
    <Layout
      title={role === 'admin' ? 'All Database Modules' : 'My Modules'}
      subtitle={role === 'admin'
        ? 'All 27 plan modules + 3 support tables — with live row counts (Section 12)'
        : 'Your relevant modules from the plan tables, with your live data'}
    >
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-4 mb">
        <div className="card stat"><span className="value">{modules.length}</span><span className="label">Modules {role === 'admin' ? '(29 total plan)' : 'related to you'}</span></div>
        <div className="card stat"><span className="value">{total}</span><span className="label">Total Records</span><span className="hint">across shown modules</span></div>
      </div>

      {modules.length === 0 && !error && <Empty icon="🗃">Loading modules…</Empty>}
      <div className="grid cols-3">
        {modules.map((m) => (
          <Link to={`/modules-data/${m.table}`} key={m.table} className="card mod-card">
            <div className="t">{m.table} →</div>
            <div className="d">{m.description}</div>
            <div className="c">{m.rows ?? '—'} <small>rows · click to view data</small></div>
          </Link>
        ))}
      </div>
    </Layout>
  );
}
