'use client';

import { INTEGRATION_CATEGORY_LABELS } from '@dostelo/types';
import { useData } from '../../../lib/use-data';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * System Integrations: a read-only board of every provider the
 * platform integrates with. The state comes from the API's own
 * configuration checks, the same checks the payment, shipping
 * and communication services use, and shows only the names of
 * the environment variables still missing. Secret values are
 * never returned by the API and never shown here.
 */
export default function IntegrationsPage() {
  const integrations = useData((client) => client.listIntegrations(), []);
  const items = integrations.data?.items ?? [];
  const configuredCount = items.filter((item) => item.configured).length;

  return (
    <section>
      <PageHeader title="System Integrations" />
      <p className="note muted" style={{ marginTop: 0, maxWidth: 760 }}>
        {items.length > 0
          ? `${configuredCount} of ${items.length} integrations are configured. `
          : ''}
        Configuration lives in the API environment; this board only
        reports it. To configure one, set the named variables on the
        API host and restart the API.
      </p>
      {integrations.loading ? (
        <LoadingNote label="Loading integrations..." />
      ) : null}
      {integrations.error ? (
        <ErrorNote
          error={integrations.error}
          onRetry={integrations.reload}
        />
      ) : null}
      {integrations.data && items.length === 0 ? (
        <EmptyNote>No integrations are registered.</EmptyNote>
      ) : null}
      {items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Integration</th>
                <th>Category</th>
                <th>Status</th>
                <th>Missing variables</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key}>
                  <td>{item.name}</td>
                  <td>{INTEGRATION_CATEGORY_LABELS[item.category]}</td>
                  <td>
                    <Badge>
                      {item.configured ? 'Configured' : 'Not configured'}
                    </Badge>
                  </td>
                  <td>
                    {item.missing.length > 0
                      ? item.missing.join(', ')
                      : 'None'}
                  </td>
                  <td>{item.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
