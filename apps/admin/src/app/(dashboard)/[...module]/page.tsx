'use client';

import { use } from 'react';
import Link from 'next/link';
import { LayoutDashboard } from 'lucide-react';
import { Card, ModuleHeader } from '../../../components/ui';
import { MODULE_ICONS } from '../../../components/sidebar';
import { moduleBySlug } from '../../../lib/modules';

/* Catch-all for module slugs in the registry that have no dedicated
   route file. Every one of the 25 modules has a dedicated page in
   this rebuild, so this renders only for unknown paths under the
   dashboard group: it shows the module purpose from the registry
   when the slug matches one, and a plain not-found note otherwise.
   It never renders fake module data. */
export default function ModuleCatchAllPage({
  params,
}: {
  params: Promise<{ module: string[] }>;
}) {
  const { module } = use(params);
  const slug = module.join('/');
  const found = moduleBySlug(slug);
  const Icon = found ? (MODULE_ICONS[found.slug] ?? LayoutDashboard) : LayoutDashboard;

  return (
    <>
      <ModuleHeader
        icon={Icon}
        title={found ? found.label : 'Page not found'}
        description={found ? found.purpose : undefined}
      >
        <Link className="btn secondary" href="/dashboard">Back to dashboard</Link>
      </ModuleHeader>
      <Card>
        <p className="note" style={{ margin: 0 }}>
          {found
            ? `${found.label} is part of the portal structure (${found.phase}). Its dedicated page is linked in the sidebar; this address is not its route.`
            : 'This address does not match any of the 25 admin modules. Use the sidebar to navigate.'}
        </p>
      </Card>
    </>
  );
}
