'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Filter, RotateCcw, Search, ShoppingBag, Users, Wallet } from 'lucide-react';
import { formatDateTime, formatMinor } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import {
  CardHead,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  ModuleHeader,
  Pagination,
  pageCountFor,
  paginate,
} from '../../../components/ui';

const PAGE_SIZE = 10;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default function CrmPage() {
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useData(
    (client) =>
      client.listCustomers({ search: submitted || undefined, limit: 200 }),
    [submitted],
  );

  const customers = useMemo(() => data?.items ?? [], [data]);
  const totalOrders = useMemo(
    () => customers.reduce((sum, customer) => sum + customer.orderCount, 0),
    [customers],
  );
  const totalLifetimeMinor = useMemo(
    () =>
      customers.reduce(
        (sum, customer) => sum + customer.lifetimeValueMinor,
        0,
      ),
    [customers],
  );
  const pageRows = paginate(customers, page, PAGE_SIZE);
  const pageCount = pageCountFor(customers.length, PAGE_SIZE);

  function applySearch(): void {
    setSubmitted(search.trim());
    setPage(1);
  }

  function resetSearch(): void {
    setSearch('');
    setSubmitted('');
    setPage(1);
  }

  return (
    <section>
      <ModuleHeader
        icon={Users}
        title="CRM: Customers"
        description="Every registered customer with their order count, lifetime value and contact details, linked to their full profile and timeline."
      />

      <div className="kpi-grid">
        <KpiCard
          icon={Users}
          label="Total Customers"
          value={loading ? '...' : customers.length.toLocaleString('en-US')}
          note={
            submitted
              ? 'Customers matching the current search'
              : 'Customers loaded from the API'
          }
          tone="purple"
        />
        <KpiCard
          icon={ShoppingBag}
          label="Total Orders"
          value={loading ? '...' : totalOrders.toLocaleString('en-US')}
          note="Orders placed by these customers"
          tone="blue"
        />
        <KpiCard
          icon={Wallet}
          label="Lifetime Value"
          value={loading ? '...' : formatMinor(totalLifetimeMinor)}
          note="Combined lifetime value of these customers"
          tone="green"
        />
      </div>

      <form
        className="card filter-card"
        onSubmit={(event) => {
          event.preventDefault();
          applySearch();
        }}
      >
        <div className="filter-row">
          <label className="field">
            Search customers
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Search size={14} />
              <input
                className="input"
                placeholder="Name, email or phone"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </label>
          <div className="filter-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={resetSearch}
            >
              <RotateCcw size={14} /> Reset
            </button>
            <button type="submit" className="btn">
              <Filter size={14} /> Apply Filters
            </button>
          </div>
        </div>
      </form>

      <div className="card">
        <CardHead icon={Users} title="Customers">
          <span className="count-chip">{customers.length} customers</span>
        </CardHead>
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
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th className="num">Orders</th>
                    <th className="num">Lifetime value</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <span className="identity-cell">
                          <span className="avatar-initials">
                            {initials(customer.fullName)}
                          </span>
                          <span>
                            <span className="identity-main">
                              <Link href={`/crm/${customer.id}`}>
                                {customer.fullName}
                              </Link>
                            </span>
                            <span className="identity-sub">
                              {customer.email ?? 'No email recorded'}
                            </span>
                          </span>
                        </span>
                      </td>
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
            <div className="table-foot">
              <span className="muted">
                Showing {pageRows.length} of {customers.length} customers
              </span>
              <Pagination
                page={page}
                pageCount={pageCount}
                onChange={setPage}
              />
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
