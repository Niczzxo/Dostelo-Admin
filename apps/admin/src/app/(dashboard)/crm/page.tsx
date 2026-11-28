'use client';

import Link from 'next/link';
import { Download, Users } from 'lucide-react';
import { Card, DataTable, ErrorNote, LoadingNote, ModuleHeader } from '../../../components/ui';
import { downloadCsv } from '../../../lib/csv';
import { formatMinor } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { itemsOf, num, str } from '../../../lib/types';

/* CRM customer list from GET /v1/customers. Only customers the API
   returns are shown, with the contact details they provided. The
   CSV export downloads exactly the loaded rows. */
export default function CrmPage() {
  const customers = useData((c) => c.listCustomers({}));
  const items = itemsOf(customers.data);
  const columns = ['id', 'name', 'email', 'phone', 'orderCount', 'lifetimeValueMinor', 'createdAt'];

  return (
    <>
      <ModuleHeader
        icon={Users}
        title="CRM"
        description="Customer records from the API: contact details the customer provided, order counts and lifetime value."
      >
        <button
          type="button"
          className="btn secondary"
          disabled={items.length === 0}
          onClick={() => downloadCsv('dostelo-customers.csv', items, columns)}
        >
          <Download size={15} /> Export CSV
        </button>
      </ModuleHeader>
      <Card title="Customers">
        {customers.loading ? (
          <LoadingNote />
        ) : customers.error ? (
          <ErrorNote error={customers.error} onRetry={customers.reload} />
        ) : (
          <DataTable
            emptyText="No customers yet."
            columns={[
              { key: 'name', label: 'Customer', render: (r) => <Link href={`/crm/${str(r.id)}`}>{str(r.name) || str(r.email) || str(r.id)}</Link> },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'orderCount', label: 'Orders' },
              { key: 'lifetimeValueMinor', label: 'Lifetime value', render: (r) => formatMinor(num(r.lifetimeValueMinor ?? r.lifetimeValue)) },
              { key: 'createdAt', label: 'Since', date: true },
            ]}
            rows={items}
          />
        )}
      </Card>
    </>
  );
}
