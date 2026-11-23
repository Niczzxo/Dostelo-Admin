import { notFound } from 'next/navigation';
import { moduleBySlug } from '../../../lib/modules';
import { Badge, PageHeader } from '../../../components/ui';

/**
 * Structure page for modules that are part of the admin master
 * structure but not yet built: the module name, its purpose and
 * the roadmap phase that builds it. Nothing here pretends to be a
 * working feature. Functional modules have their own routes,
 * which take precedence over this catch-all.
 */
export default async function ModuleStructurePage({
  params,
}: {
  params: Promise<{ module: string[] }>;
}) {
  const segments = (await params).module;
  if (segments.length !== 1) notFound();
  const slug = segments[0] as string;
  const module_ = moduleBySlug(slug);
  if (!module_ || module_.functional) notFound();

  return (
    <section>
      <PageHeader title={module_.label}>
        <Badge>Structure only</Badge>
      </PageHeader>
      <div className="card" style={{ maxWidth: 720 }}>
        <dl className="kv">
          <dt>Purpose</dt>
          <dd>{module_.purpose}</dd>
          <dt>Roadmap phase</dt>
          <dd>{module_.phase}</dd>
          <dt>View permission</dt>
          <dd>{module_.permission}</dd>
          <dt>Status</dt>
          <dd>
            Not yet implemented. This page exists so the portal
            structure matches the admin master structure while the
            module is scheduled.
          </dd>
        </dl>
      </div>
    </section>
  );
}
