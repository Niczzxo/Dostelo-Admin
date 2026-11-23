'use client';

import Link from 'next/link';
import { useData } from '../../../lib/use-data';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';

/**
 * Automation: a read-only inventory of the automations that
 * actually run in the API today, with their live trigger and
 * configuration state read from the services that run them.
 * There is no rule builder here because the system has no
 * generic rule engine; each automation links to the page that
 * holds its real settings.
 */
export default function AutomationPage() {
  const automations = useData((client) => client.listAutomations(), []);

  return (
    <section>
      <PageHeader title="Automation" />
      <p className="note muted" style={{ marginTop: 0, maxWidth: 760 }}>
        These are the background automations the system really runs.
        The list is read from the API, including each automation's
        current settings, so it cannot drift from the code. An
        automation that depends on a messaging provider reports
        not-configured until that provider exists.
      </p>
      {automations.loading ? (
        <LoadingNote label="Loading automations..." />
      ) : null}
      {automations.error ? (
        <ErrorNote error={automations.error} onRetry={automations.reload} />
      ) : null}
      {automations.data && automations.data.items.length === 0 ? (
        <EmptyNote>No automations are registered.</EmptyNote>
      ) : null}
      {automations.data && automations.data.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Automation</th>
                <th>Runs in</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>Detail</th>
                <th>Settings</th>
              </tr>
            </thead>
            <tbody>
              {automations.data.items.map((item) => (
                <tr key={item.key}>
                  <td>{item.name}</td>
                  <td>{item.runsIn}</td>
                  <td>{item.trigger}</td>
                  <td>
                    <Badge>
                      {item.status === 'active'
                        ? 'Active'
                        : 'Not configured'}
                    </Badge>
                  </td>
                  <td>{item.detail ?? ''}</td>
                  <td>
                    {item.settingsHref ? (
                      <Link href={item.settingsHref}>Open settings</Link>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
