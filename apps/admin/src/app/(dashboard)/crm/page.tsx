'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatDateTime, formatMinor } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import {
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

export default function CrmPage() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { data, error, loading, reload } = useData(
    (client) =>
      client.listCustomers({ search: submitted || undefined, limit: 200 }),
    [submitted],
  );

  return (
    <section>
      <PageHeader title="CRM: Customers" />
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(search.trim());
        }}
      >
        <label className="field" style={{ flex: 1, minWidth: 220 }}>
          Search customers
          <input
            className="input"
            placeholder="Name, email or phone"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button type="submit" className="btn">
          Search
        </button>
        {submitted ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSearch('');
              setSubmitted('');
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      {loading ? <LoadingNote label="Loading customers..." /> : null}
      {error ? <ErrorNote error={error} onRetry={reload} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyNote>
          {submitted
            ? 'No customers match this search.'
            : 'No customers yet.'}
        </EmptyNote>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th className="num">Orders</th>
                <th className="num">Lifetime value</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link href={`/crm/${customer.id}`}>
                      {customer.fullName}
                    </Link>
                  </td>
                  <td>{customer.email ?? '-'}</td>
                  <td>{customer.phone}</td>
                  <td className="num">{customer.orderCount}</td>
                  <td className="num">
                    {formatMinor(customer.lifetimeValueMinor)}
                  </td>
                  <td>{formatDateTime(customer.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
