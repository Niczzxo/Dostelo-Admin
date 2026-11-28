'use client';

import { useState } from 'react';
import { Blocks } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, KeyValues, LoadingNote,
  ModuleHeader, StatusBadge, Unavailable,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, str } from '../../../lib/types';

/* System Integrations: every provider (payments, WhatsApp, email,
   SMS, couriers) with a complete configuration view. The config
   view lists environment variable NAMES with a set or missing
   state only; a secret value is never requested, returned or
   rendered by this page. That makes the owner's credential the
   only missing piece: once a variable is set on the API host, the
   provider status flips here on reload. Test runs the provider
   check through the API and shows its honest answer. */
export default function IntegrationsPage() {
  const integrations = useData((c) => c.listIntegrations());
  const action = useAction();
  const [selectedKey, setSelectedKey] = useState('');
  const config = useData(
    (c) => (selectedKey ? c.gap.getIntegrationConfig(selectedKey) : Promise.resolve(null)),
    [selectedKey],
  );
  const [testResult, setTestResult] = useState('');

  const items = itemsOf(integrations.data);
  const configRec = asRec(config.data);
  const variables = itemsOf(configRec.variables ?? configRec.env ?? configRec.keys);

  return (
    <>
      <ModuleHeader
        icon={Blocks}
        title="System Integrations"
        description="Provider status and configuration for payments, WhatsApp, email, SMS and couriers. Only variable names and set or missing state are shown; secret values never appear here."
      />
      <ActionError error={action.error} />
      {testResult ? <p className="note" role="status">{testResult}</p> : null}
      <Card title="Providers">
        {integrations.loading ? (
          <LoadingNote />
        ) : integrations.error ? (
          <ErrorNote error={integrations.error} onRetry={integrations.reload} />
        ) : (
          <DataTable
            emptyText="No integrations returned by the API."
            columns={[
              { key: 'key', label: 'Provider', render: (r) => <button type="button" className="btn secondary small" onClick={() => setSelectedKey(str(r.key ?? r.id))}>{str(r.name ?? r.key)}</button> },
              { key: 'category', label: 'Category', render: (r) => str(r.category ?? r.type) },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status ?? (r.configured === true ? 'configured' : 'not-configured')} /> },
              { key: 'note', label: 'Note', render: (r) => str(r.note ?? r.message) },
              {
                key: 'test', label: 'Action',
                render: (r) => (
                  <button
                    type="button"
                    className="btn secondary small"
                    disabled={action.busy}
                    onClick={async () => {
                      await action.run(async (c) => {
                        const res = asRec(await c.testIntegration(str(r.key ?? r.id)));
                        setTestResult(
                          `${str(r.name ?? r.key)}: ${str(res.status ?? res.message ?? 'test recorded by the API')}`,
                        );
                      });
                      integrations.reload();
                    }}
                  >
                    Test connection
                  </button>
                ),
              },
            ]}
            rows={items}
          />
        )}
      </Card>

      {selectedKey ? (
        <Card title={`Configuration: ${selectedKey}`}>
          {config.loading ? (
            <LoadingNote />
          ) : config.data === null ? (
            <Unavailable title="The per-provider configuration view is not available on the running API yet.">
              This panel needs GET /v1/admin/integrations/:key/config, which returns variable names
              with set or missing state only. The provider list above still shows the configured
              status the API reports.
            </Unavailable>
          ) : variables.length > 0 ? (
            <DataTable
              searchable={false}
              emptyText="No variables listed for this provider."
              columns={[
                { key: 'name', label: 'Variable', render: (r) => str(r.name ?? r.key) },
                {
                  key: 'set', label: 'State',
                  render: (r) => (
                    <Badge tone={r.set === true || str(r.state) === 'set' ? 'ok' : 'bad'}>
                      {r.set === true || str(r.state) === 'set' ? 'Set' : 'Missing'}
                    </Badge>
                  ),
                },
                { key: 'required', label: 'Required', render: (r) => (r.required === false ? 'Optional' : 'Required') },
              ]}
              rows={variables}
            />
          ) : (
            <KeyValues
              entries={[
                ['Configured', configRec.configured === true ? 'Yes' : 'No'],
                ['Status', str(configRec.status)],
                ['How to configure', 'Set the provider variables on the API host, then reload this page. Values are never typed into this portal.'],
              ]}
            />
          )}
          <p className="note">
            To finish a provider, the owner sets its variables on the API host (for example the
            gateway merchant keys, the WhatsApp token, the email or SMS credentials, or a courier
            API key). Nothing else is missing: the adapters, test action and status reporting are
            already wired.
          </p>
        </Card>
      ) : null}
    </>
  );
}
