import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { Empty } from '../components/ui';

export default function ModuleDataPage() {
  const { table } = useParams();
  const { session } = useApp();
  const token = session?.token;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    api.get(`/modules/data/${table}`, token).then(setData).catch((e) => setError(e.message));
  }, [table]);

  const cols = data?.rows?.length ? Object.keys(data.rows[0]) : [];

  return (
    <Layout title={`Data — ${table}`} subtitle={data ? (data.scope === 'all' ? 'All records (admin view)' : 'Your own records') : ''}>
      {error && <div className="alert error">{error}</div>}
      <div className="card">
        {!data && !error && <Empty>Loading…</Empty>}
        {data && data.rows.length === 0 && <Empty icon="🗃">You have no records in this table.</Empty>}
        {data && data.rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>{cols.slice(0, 10).map((c) => <th key={c}>{c.replaceAll('_', ' ')}</th>)}</tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    {cols.slice(0, 10).map((c) => (
                      <td key={c}>{r[c] === null ? '—' : typeof r[c] === 'object' ? JSON.stringify(r[c]).slice(0, 60) : String(r[c]).slice(0, 80)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <p className="muted mt">{data.rows.length} rows (max 200) · scope: {data.scope}</p>}
      </div>
    </Layout>
  );
}
