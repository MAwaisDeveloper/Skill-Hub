import React from 'react';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatementView } from '../components/ui';
import { api } from '../api';

// Full transaction history page (customer & professional dono use karte hain).
export default function WalletStatement() {
  const { session } = useApp();
  const token = session?.token;
  const role = session?.user?.role || 'customer';

  const fetchStatement = (filters) => {
    const q = new URLSearchParams();
    if (filters.direction) q.set('direction', filters.direction);
    if (filters.type) q.set('type', filters.type);
    if (filters.from) q.set('from', filters.from);
    if (filters.to) q.set('to', filters.to);
    q.set('page', filters.page);
    q.set('per_page', 15);
    return api.get(`/${role}/wallet/statement?${q.toString()}`, token);
  };

  return (
    <Layout
      title="Transaction History"
      subtitle="Har paise ki entry — kis ke naam se aayi/gayi, kaunsi booking se, balance kitna raha"
    >
      <StatementView
        fetcher={fetchStatement}
        title="Complete Ledger"
        subtitle="Incoming, outgoing and pending, like a bank statement. Filter by direction, type or date range."
      />
    </Layout>
  );
}
