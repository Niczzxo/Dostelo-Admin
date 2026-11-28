'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Archive,
  Copy,
  Download,
  Eye,
  Layers,
  Package,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Product, ProductStatus } from '@dostelo/types';
import { LOW_STOCK_THRESHOLD } from '@dostelo/types';
import type { StockView } from '@dostelo/api-client';

// The admin package does not depend on @dostelo/validation directly, so the
// create and update payload types are taken from the client methods, which
// are typed with ProductCreate and ProductUpdate from @dostelo/validation.
type ProductCreate = Parameters<typeof api.createProduct>[0];
type ProductUpdate = Parameters<typeof api.updateProduct>[1];
import { api, formatDateTime, formatMinor, formatMoney, toUiError } from '../../../lib/api';
import { downloadCsv, parseCsv, toCsv } from '../../../lib/csv';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  CardHead,
  Drawer,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  Modal,
  ModuleHeader,
  Pagination,
  StatusTabs,
  Switch,
  pageCountFor,
  paginate,
} from '../../../components/ui';

const PAGE_SIZE = 10;

type StockFilter = '' | 'in' | 'low' | 'out';
type SortKey = 'name' | 'price-asc' | 'price-desc' | 'stock-desc' | 'newest';

interface VariantRow {
  id?: string;
  sku: string;
  name: string;
  size: string;
  colour: string;
  priceTaka: string;
  compareAtTaka: string;
  stock: string;
  isActive: boolean;
}

interface MediaRow {
  url: string;
  alt: string;
}

interface ImportResult {
  row: number;
  label: string;
  ok: boolean;
  message: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function productStock(product: Product, stockByVariant: Map<string, StockView>): number {
  return product.variants.reduce((sum, variant) => {
    const live = stockByVariant.get(variant.id);
    return sum + (live ? live.available : variant.stock);
  }, 0);
}

function minPrice(product: Product): number | null {
  if (product.variants.length === 0) return null;
  return Math.min(...product.variants.map((variant) => variant.price.amountMinor));
}

function emptyVariant(): VariantRow {
  return { sku: '', name: '', size: '', colour: '', priceTaka: '', compareAtTaka: '', stock: '0', isActive: true };
}

export default function ProductsPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canCreate = permissions.includes('products.create');
  const canEdit = permissions.includes('products.edit');
  const canDelete = permissions.includes('products.delete');

  const products = useData((client) => client.listAdminProducts(), []);
  const categories = useData((client) => client.listCategories(), []);
  const inventory = useData((client) => client.listInventory(), []);

  const [tab, setTab] = useState('all');
  const [searchDraft, setSearchDraft] = useState('');
  const [categoryDraft, setCategoryDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [stockDraft, setStockDraft] = useState<StockFilter>('');
  const [sortDraft, setSortDraft] = useState<SortKey>('name');
  const [filters, setFilters] = useState({ search: '', category: '', status: '', stock: '' as StockFilter, sort: 'name' as SortKey });
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showColumns, setShowColumns] = useState(false);
  const [columns, setColumns] = useState({ category: true, variants: true, price: true, stock: true, status: true });

  const [formProduct, setFormProduct] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const detailStock = useData(
    (client) => (detailId ? client.listInventory(detailId) : Promise.resolve({ items: [] as StockView[] })),
    [detailId],
  );
  const detailMovements = useData(
    (client) => (detailId ? client.listStockMovements({ productId: detailId, limit: 20 }) : Promise.resolve({ items: [] })),
    [detailId],
  );
  const detailFetch = useData(
    (client) => (detailId ? client.getAdminProduct(detailId) : Promise.resolve(null)),
    [detailId],
  );

  const stockByVariant = useMemo(
    () => new Map((inventory.data?.items ?? []).map((item) => [item.variantId, item])),
    [inventory.data],
  );
  const categoryName = useMemo(() => {
    const map = new Map((categories.data?.items ?? []).map((item) => [item.id, item.name]));
    return (product: Product) => map.get(product.categoryId) ?? product.categoryId;
  }, [categories.data]);

  const all = products.data?.items ?? [];
  const lowProductIds = useMemo(() => {
    const set = new Set<string>();
    for (const product of all) {
      if (product.variants.some((variant) => {
        const live = stockByVariant.get(variant.id);
        const available = live ? live.available : variant.stock;
        return available <= LOW_STOCK_THRESHOLD;
      })) set.add(product.id);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.data, stockByVariant]);

  const kpis = useMemo(() => {
    const variants = all.flatMap((product) => product.variants);
    const availableOf = (variantId: string, fallback: number) => {
      const live = stockByVariant.get(variantId);
      return live ? live.available : fallback;
    };
    return {
      total: all.length,
      active: all.filter((p) => p.status === 'active').length,
      draft: all.filter((p) => p.status === 'draft').length,
      archived: all.filter((p) => p.status === 'archived').length,
      variants: variants.length,
      low: variants.filter((v) => availableOf(v.id, v.stock) <= LOW_STOCK_THRESHOLD).length,
      out: variants.filter((v) => availableOf(v.id, v.stock) <= 0).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.data, stockByVariant]);

  const filtered = useMemo(() => {
    let items = [...all];
    if (tab === 'active' || tab === 'draft' || tab === 'archived') items = items.filter((p) => p.status === tab);
    if (tab === 'low') items = items.filter((p) => lowProductIds.has(p.id));
    const needle = filters.search.trim().toLowerCase();
    if (needle) {
      items = items.filter(
        (p) => p.name.toLowerCase().includes(needle) || p.variants.some((v) => v.sku.toLowerCase().includes(needle)),
      );
    }
    if (filters.category) items = items.filter((p) => p.categoryId === filters.category);
    if (filters.status) items = items.filter((p) => p.status === filters.status);
    if (filters.stock) {
      items = items.filter((p) => {
        const total = productStock(p, stockByVariant);
        if (filters.stock === 'out') return total <= 0;
        if (filters.stock === 'low') return total > 0 && total <= LOW_STOCK_THRESHOLD;
        return total > LOW_STOCK_THRESHOLD;
      });
    }
    items.sort((a, b) => {
      if (filters.sort === 'price-asc') return (minPrice(a) ?? 0) - (minPrice(b) ?? 0);
      if (filters.sort === 'price-desc') return (minPrice(b) ?? 0) - (minPrice(a) ?? 0);
      if (filters.sort === 'stock-desc') return productStock(b, stockByVariant) - productStock(a, stockByVariant);
      if (filters.sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
      return a.name.localeCompare(b.name);
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.data, tab, filters, lowProductIds, stockByVariant]);

  const pageItems = paginate(filtered, page, PAGE_SIZE);
  const detail = detailFetch.data ?? all.find((p) => p.id === detailId) ?? null;

  function applyFilters() {
    setFilters({ search: searchDraft, category: categoryDraft, status: statusDraft, stock: stockDraft, sort: sortDraft });
    setPage(1);
  }
  function resetFilters() {
    setSearchDraft(''); setCategoryDraft(''); setStatusDraft(''); setStockDraft(''); setSortDraft('name');
    setFilters({ search: '', category: '', status: '', stock: '', sort: 'name' });
    setTab('all'); setPage(1);
  }
  function toggleSelected(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function exportCsv(items: Product[]) {
    const rows: (string | number)[][] = [];
    for (const product of items) {
      if (product.variants.length === 0) {
        rows.push([product.name, product.slug, categoryName(product), product.status, '', '', '', '', '']);
      }
      for (const variant of product.variants) {
        rows.push([product.name, product.slug, categoryName(product), product.status, variant.sku, variant.size ?? '', variant.colour ?? '', variant.price.amountMinor / 100, variant.stock]);
      }
    }
    downloadCsv('products.csv', toCsv(['name', 'slug', 'category', 'status', 'sku', 'size', 'colour', 'price', 'stock'], rows));
  }

  async function runAction(action: () => Promise<string>) {
    setBusyAction(true); setActionError(null); setActionMessage(null);
    try {
      const message = await action();
      setActionMessage(message);
      products.reload(); inventory.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setActionError(uiError.message);
    } finally { setBusyAction(false); }
  }

  async function duplicateProduct(product: Product) {
    await runAction(async () => {
      await api.createProduct({
        name: product.name,
        slug: `${product.slug}-copy`.slice(0, 120),
        categoryId: product.categoryId,
        description: product.description,
        status: product.status,
        isFeatured: product.isFeatured,
        isBestSeller: product.isBestSeller,
        isNewArrival: product.isNewArrival,
        tags: product.tags,
        media: product.media.map((m) => ({ url: m.url, alt: m.alt })),
        variants: product.variants.map((v) => ({
          sku: `${v.sku}-copy`.slice(0, 64),
          name: v.name,
          size: v.size,
          colour: v.colour,
          priceMinor: v.price.amountMinor,
          compareAtPriceMinor: v.compareAtPrice?.amountMinor ?? null,
          stock: v.stock,
          isActive: v.isActive,
        })),
      });
      return `Duplicated ${product.name}. The copy uses a slug and SKUs suffixed with -copy.`;
    });
  }

  async function archiveProduct(product: Product) {
    await runAction(async () => {
      await api.updateProduct(product.id, { status: 'archived' });
      return `${product.name} archived.`;
    });
  }

  async function bulkStatus(status: ProductStatus) {
    const targets = all.filter((p) => selected.has(p.id));
    if (targets.length === 0) return;
    await runAction(async () => {
      for (const target of targets) await api.updateProduct(target.id, { status });
      setSelected(new Set());
      return `${targets.length} product(s) set to ${status}.`;
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    await runAction(async () => {
      await api.deleteProduct(target.id);
      return `${target.name} deleted.`;
    });
  }

  async function handleImport(file: File) {
    setImportBusy(true); setImportResults(null); setActionError(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const categoryItems = categories.data?.items ?? [];
      const results: ImportResult[] = [];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index]!;
        const label = row['name'] || `Row ${index + 2}`;
        try {
          const name = (row['name'] ?? '').trim();
          if (!name) throw new Error('Missing name.');
          const categoryValue = (row['category'] ?? '').trim();
          const category = categoryItems.find(
            (item) => item.id === categoryValue || item.slug === categoryValue || item.name.toLowerCase() === categoryValue.toLowerCase(),
          );
          if (!category) throw new Error(`Category not found: ${categoryValue || '(blank)'}.`);
          const priceTaka = Number(row['price'] ?? '');
          if (!Number.isFinite(priceTaka) || priceTaka < 0) throw new Error('Price must be a taka amount at or above 0.');
          const sku = (row['sku'] ?? '').trim();
          if (!sku) throw new Error('Missing sku.');
          const stock = Number(row['stock'] ?? '0');
          if (!Number.isInteger(stock) || stock < 0) throw new Error('Stock must be a whole number at or above 0.');
          const size = (row['size'] ?? '').trim();
          const colour = (row['colour'] ?? '').trim();
          const variantName = [size, colour].filter(Boolean).join(' / ') || name;
          await api.createProduct({
            name,
            slug: (row['slug'] ?? '').trim() || slugify(name),
            categoryId: category.id,
            status: 'draft',
            variants: [{
              sku,
              name: variantName,
              size: size || null,
              colour: colour || null,
              priceMinor: Math.round(priceTaka * 100),
              stock,
              isActive: true,
            }],
          });
          results.push({ row: index + 2, label, ok: true, message: 'Created as draft.' });
        } catch (caught) {
          results.push({ row: index + 2, label, ok: false, message: toUiError(caught).kind === 'api' || toUiError(caught).kind === 'forbidden' ? toUiError(caught).message : caught instanceof Error ? caught.message : 'Failed.' });
        }
      }
      setImportResults(results);
      products.reload(); inventory.reload();
    } catch (caught) {
      setActionError(toUiError(caught).message);
    } finally { setImportBusy(false); }
  }

  return (
    <section>
      <ModuleHeader icon={ShoppingBag} title="Products" description="The full admin catalogue, including draft and archived products that the public API catalogue excludes.">
        <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImport(file); event.target.value = ''; }} />
        <button type="button" className="btn-secondary" disabled={importBusy} onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> {importBusy ? 'Importing...' : 'Import'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => exportCsv(filtered)}>
          <Download size={16} /> Export
        </button>
        {canCreate ? (
          <button type="button" className="btn" onClick={() => { setFormProduct(null); setFormOpen(true); }}>
            <Plus size={16} /> Add Product
          </button>
        ) : null}
      </ModuleHeader>

      {products.loading ? <LoadingNote label="Loading products..." /> : null}
      {products.error ? <ErrorNote error={products.error} onRetry={products.reload} /> : null}
      {inventory.error ? <ErrorNote error={inventory.error} onRetry={inventory.reload} /> : null}
      {actionError ? <p className="form-error" role="alert">{actionError}</p> : null}
      {actionMessage ? <p className="note">{actionMessage}</p> : null}

      {products.data ? (
        <div className="kpi-grid">
          <KpiCard icon={ShoppingBag} label="Total Products" value={String(kpis.total)} />
          <KpiCard icon={Package} label="Active Products" value={String(kpis.active)} tone="green" />
          <KpiCard icon={Layers} label="Total Variants" value={String(kpis.variants)} tone="blue" />
          <KpiCard icon={Package} label="Low Stock" value={String(kpis.low)} note={`Variants available at or below ${LOW_STOCK_THRESHOLD}`} tone="orange" />
          <KpiCard icon={Pencil} label="Draft" value={String(kpis.draft)} />
          <KpiCard icon={Archive} label="Archived" value={String(kpis.archived)} />
          <KpiCard icon={Package} label="Out of Stock" value={String(kpis.out)} note="Variants with no available stock" tone="orange" />
        </div>
      ) : null}

      <StatusTabs
        active={tab}
        onChange={(key) => { setTab(key); setPage(1); }}
        tabs={[
          { key: 'all', label: 'All Products', count: kpis.total },
          { key: 'active', label: 'Active', count: kpis.active },
          { key: 'draft', label: 'Draft', count: kpis.draft },
          { key: 'archived', label: 'Archived', count: kpis.archived },
          { key: 'low', label: 'Low Stock', count: lowProductIds.size },
        ]}
      />

      <div className="card filter-card">
        <div className="filter-row">
          <label className="field">Search<input className="input" placeholder="Name or SKU" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} /></label>
          <label className="field">Category
            <select className="select" value={categoryDraft} onChange={(e) => setCategoryDraft(e.target.value)}>
              <option value="">All categories</option>
              {(categories.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">Status
            <select className="select" value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>
              <option value="">Any status</option><option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option>
            </select>
          </label>
          <label className="field">Stock
            <select className="select" value={stockDraft} onChange={(e) => setStockDraft(e.target.value as StockFilter)}>
              <option value="">Any stock</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
            </select>
          </label>
          <label className="field">Sort
            <select className="select" value={sortDraft} onChange={(e) => setSortDraft(e.target.value as SortKey)}>
              <option value="name">Name</option><option value="price-asc">Price, low to high</option><option value="price-desc">Price, high to low</option><option value="stock-desc">Stock, high to low</option><option value="newest">Newest</option>
            </select>
          </label>
          <div className="filter-actions">
            <button type="button" className="btn-secondary" onClick={resetFilters}>Reset</button>
            <button type="button" className="btn" onClick={applyFilters}>Apply</button>
          </div>
        </div>
      </div>

      {importResults ? (
        <div className="card">
          <CardHead icon={Upload} title="Import results" />
          {importResults.map((result) => (
            <p key={result.row} className="note">Row {result.row}: {result.label}: {result.ok ? 'Success. ' : 'Error. '}{result.message}</p>
          ))}
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="card">
          <p className="note">{selected.size} selected</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canEdit ? <button type="button" className="btn-small btn" disabled={busyAction} onClick={() => void bulkStatus('active')}>Bulk Activate</button> : null}
            {canEdit ? <button type="button" className="btn-secondary btn-small" disabled={busyAction} onClick={() => void bulkStatus('archived')}>Bulk Archive</button> : null}
            <button type="button" className="btn-secondary btn-small" onClick={() => exportCsv(all.filter((p) => selected.has(p.id)))}>Bulk Export</button>
            <button type="button" className="btn-secondary btn-small" onClick={() => setSelected(new Set())}>Clear selection</button>
          </div>
        </div>
      ) : null}

      <div className="card">
        <CardHead icon={ShoppingBag} title="Catalogue">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary btn-small" onClick={() => setShowColumns((v) => !v)}>Columns</button>
            <button type="button" className="btn-secondary btn-small" onClick={() => setView(view === 'list' ? 'grid' : 'list')}>{view === 'list' ? 'Grid view' : 'List view'}</button>
          </div>
        </CardHead>
        {showColumns ? (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            {(Object.keys(columns) as (keyof typeof columns)[]).map((key) => (
              <label key={key} className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={columns[key]} onChange={(e) => setColumns((prev) => ({ ...prev, [key]: e.target.checked }))} /> {key}
              </label>
            ))}
          </div>
        ) : null}

        {products.data && filtered.length === 0 ? <EmptyNote>No products match this filter.</EmptyNote> : null}

        {view === 'list' && pageItems.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th><input type="checkbox" aria-label="Select all on page" checked={pageItems.every((p) => selected.has(p.id))} onChange={(e) => { const next = new Set(selected); pageItems.forEach((p) => { if (e.target.checked) next.add(p.id); else next.delete(p.id); }); setSelected(next); }} /></th>
                <th>Product</th><th>SKU</th>
                {columns.category ? <th>Category</th> : null}
                {columns.variants ? <th className="num">Variants</th> : null}
                {columns.price ? <th className="num">Price from</th> : null}
                {columns.stock ? <th className="num">Stock</th> : null}
                {columns.status ? <th>Status</th> : null}
                <th>Actions</th>
              </tr></thead>
              <tbody>
                {pageItems.map((product) => {
                  const price = minPrice(product);
                  const firstMedia = product.media.slice().sort((a, b) => a.position - b.position)[0];
                  return (
                    <tr key={product.id}>
                      <td><input type="checkbox" aria-label={`Select ${product.name}`} checked={selected.has(product.id)} onChange={(e) => toggleSelected(product.id, e.target.checked)} /></td>
                      <td><div className="identity-cell">{firstMedia ? <span className="thumb"><img src={firstMedia.url} alt={firstMedia.alt} /></span> : null}<span className="identity-main">{product.name}</span></div></td>
                      <td>{product.variants[0]?.sku ?? '-'}</td>
                      {columns.category ? <td><span className="badge">{categoryName(product)}</span></td> : null}
                      {columns.variants ? <td className="num">{product.variants.length}</td> : null}
                      {columns.price ? <td className="num">{price !== null ? formatMinor(price) : '-'}</td> : null}
                      {columns.stock ? <td className="num">{productStock(product, stockByVariant)}</td> : null}
                      {columns.status ? <td><span className="badge">{product.status}</span></td> : null}
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button type="button" className="btn-secondary btn-small" onClick={() => setDetailId(product.id)}><Eye size={14} /> View</button>
                          {canEdit ? <button type="button" className="btn-secondary btn-small" onClick={() => { setFormProduct(product); setFormOpen(true); }}><Pencil size={14} /> Edit</button> : null}
                          {canCreate ? <button type="button" className="btn-secondary btn-small" disabled={busyAction} onClick={() => void duplicateProduct(product)}><Copy size={14} /> Duplicate</button> : null}
                          {canEdit && product.status !== 'archived' ? <button type="button" className="btn-secondary btn-small" disabled={busyAction} onClick={() => void archiveProduct(product)}><Archive size={14} /> Archive</button> : null}
                          {canDelete ? <button type="button" className="btn-danger btn-small" onClick={() => setDeleteTarget(product)}><Trash2 size={14} /> Delete</button> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {view === 'grid' && pageItems.length > 0 ? (
          <div className="grid-cards">
            {pageItems.map((product) => {
              const price = minPrice(product);
              const firstMedia = product.media.slice().sort((a, b) => a.position - b.position)[0];
              return (
                <div key={product.id} className="order-card">
                  {firstMedia ? <span className="thumb"><img src={firstMedia.url} alt={firstMedia.alt} /></span> : null}
                  <strong>{product.name}</strong>
                  <span className="badge">{categoryName(product)}</span>
                  <span>{product.variants[0]?.sku ?? '-'}</span>
                  <span>{price !== null ? formatMinor(price) : '-'} | Stock {productStock(product, stockByVariant)} | <Badge>{product.status}</Badge></span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn-secondary btn-small" onClick={() => setDetailId(product.id)}>View</button>
                    {canEdit ? <button type="button" className="btn-secondary btn-small" onClick={() => { setFormProduct(product); setFormOpen(true); }}>Edit</button> : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="table-foot">
          <span>{filtered.length} product(s)</span>
          <Pagination page={page} pageCount={pageCountFor(filtered.length, PAGE_SIZE)} onChange={setPage} />
        </div>
      </div>

      {formOpen ? (
        <ProductForm
          key={formProduct?.id ?? 'new'}
          product={formProduct}
          categories={categories.data?.items ?? []}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); products.reload(); inventory.reload(); }}
        />
      ) : null}

      {detail ? (
        <Drawer title={detail.name} onClose={() => setDetailId(null)}>
          <p className="note muted">{detail.slug} | <Badge>{detail.status}</Badge> | Category: {categoryName(detail)}</p>
          {detail.description ? <p style={{ lineHeight: 1.6 }}>{detail.description}</p> : null}
          <p className="note">Tags: {detail.tags.length ? detail.tags.join(', ') : 'None'} | Featured: {detail.isFeatured ? 'Yes' : 'No'} | Bestseller: {detail.isBestSeller ? 'Yes' : 'No'} | New arrival: {detail.isNewArrival ? 'Yes' : 'No'}</p>
          <p className="note muted">Created {formatDateTime(detail.createdAt)} | Updated {formatDateTime(detail.updatedAt)}</p>

          <h3>Gallery</h3>
          {detail.media.length === 0 ? <EmptyNote>No media for this product.</EmptyNote> : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {detail.media.slice().sort((a, b) => a.position - b.position).map((media) => (
                <span key={media.id} className="thumb"><img src={media.url} alt={media.alt} /></span>
              ))}
            </div>
          )}

          <h3>Pricing and variants</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Variant</th><th>SKU</th><th>Size</th><th>Colour</th><th className="num">Price</th><th className="num">Compare at</th><th>Active</th></tr></thead>
            <tbody>{detail.variants.map((variant) => (
              <tr key={variant.id}><td>{variant.name}</td><td>{variant.sku}</td><td>{variant.size ?? '-'}</td><td>{variant.colour ?? '-'}</td><td className="num">{formatMoney(variant.price)}</td><td className="num">{variant.compareAtPrice ? formatMoney(variant.compareAtPrice) : '-'}</td><td>{variant.isActive ? 'Yes' : 'No'}</td></tr>
            ))}</tbody>
          </table></div>

          <h3>Stock (inventory is the single source of truth)</h3>
          {detailStock.loading ? <LoadingNote label="Loading stock..." /> : null}
          {detailStock.error ? <ErrorNote error={detailStock.error} onRetry={detailStock.reload} /> : null}
          {detailStock.data ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Variant</th><th className="num">On hand</th><th className="num">Reserved</th><th className="num">Available</th></tr></thead>
              <tbody>{detail.variants.map((variant) => {
                const live = (detailStock.data?.items ?? []).find((item) => item.variantId === variant.id);
                return <tr key={variant.id}><td>{variant.name}</td><td className="num">{live ? live.onHand : variant.stock}</td><td className="num">{live ? live.reserved : 0}</td><td className="num">{live ? live.available : variant.stock}</td></tr>;
              })}</tbody>
            </table></div>
          ) : null}

          <h3>Recent stock movements</h3>
          {detailMovements.loading ? <LoadingNote label="Loading movements..." /> : null}
          {detailMovements.error ? <ErrorNote error={detailMovements.error} onRetry={detailMovements.reload} /> : null}
          {detailMovements.data && detailMovements.data.items.length === 0 ? <EmptyNote>No movements recorded for this product yet.</EmptyNote> : null}
          {(detailMovements.data?.items ?? []).length > 0 ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Time</th><th>Type</th><th className="num">Delta on hand</th><th className="num">Delta reserved</th><th>Reference</th></tr></thead>
              <tbody>{(detailMovements.data?.items ?? []).map((movement) => (
                <tr key={movement.id}><td>{formatDateTime(movement.createdAt)}</td><td><span className="badge">{movement.type}</span></td><td className="num">{movement.deltaOnHand}</td><td className="num">{movement.deltaReserved}</td><td>{movement.reference ?? '-'}</td></tr>
              ))}</tbody>
            </table></div>
          ) : null}

          <div className="card" style={{ marginTop: 16 }}>
            <p className="note">Note: the static GitHub Pages live site has its own embedded catalogue and does not reflect admin edits. The API catalogue excludes draft and archived products, so only active products appear there.</p>
          </div>
          {canEdit ? <button type="button" className="btn" onClick={() => { setDetailId(null); setFormProduct(detail); setFormOpen(true); }}>Edit product</button> : null}
        </Drawer>
      ) : null}

      {deleteTarget ? (
        <Modal title="Delete product" onClose={() => setDeleteTarget(null)}>
          <p>Delete {deleteTarget.name}? This cannot be undone from the portal. If the product is referenced by orders, the API will refuse the deletion and that refusal will be shown here.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button type="button" className="btn-danger" disabled={busyAction} onClick={() => void handleDelete()}>Delete</button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function ProductForm({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [slug, setSlug] = useState(product?.slug ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? 'draft');
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [isBestSeller, setIsBestSeller] = useState(product?.isBestSeller ?? false);
  const [isNewArrival, setIsNewArrival] = useState(product?.isNewArrival ?? false);
  const [tagsText, setTagsText] = useState((product?.tags ?? []).join(', '));
  const [variants, setVariants] = useState<VariantRow[]>(
    product
      ? product.variants.map((v) => ({
          id: v.id, sku: v.sku, name: v.name, size: v.size ?? '', colour: v.colour ?? '',
          priceTaka: String(v.price.amountMinor / 100),
          compareAtTaka: v.compareAtPrice ? String(v.compareAtPrice.amountMinor / 100) : '',
          stock: String(v.stock), isActive: v.isActive,
        }))
      : [emptyVariant()],
  );
  const [media, setMedia] = useState<MediaRow[]>(
    product ? product.media.slice().sort((a, b) => a.position - b.position).map((m) => ({ url: m.url, alt: m.alt })) : [{ url: '', alt: '' }],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const cleanSlug = slug.trim() || slugify(name);
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!cleanSlug) { setError('Slug is required.'); return; }
    if (!categoryId) { setError('Category is required. Choose a category first.'); return; }
    if (variants.length === 0) { setError('At least one variant is required.'); return; }
    for (const variant of variants) {
      if (!variant.sku.trim() || !variant.name.trim()) { setError('Every variant needs a SKU and a name.'); return; }
      const price = Number(variant.priceTaka);
      if (!Number.isFinite(price) || price < 0) { setError('Every variant price must be a taka amount at or above 0.'); return; }
      const stock = Number(variant.stock);
      if (!Number.isInteger(stock) || stock < 0) { setError('Every variant stock must be a whole number at or above 0.'); return; }
    }
    const payloadVariants = variants.map((variant) => ({
      ...(variant.id ? { id: variant.id } : {}),
      sku: variant.sku.trim(),
      name: variant.name.trim(),
      size: variant.size.trim() || null,
      colour: variant.colour.trim() || null,
      priceMinor: Math.round(Number(variant.priceTaka) * 100),
      compareAtPriceMinor: variant.compareAtTaka.trim() === '' ? null : Math.round(Number(variant.compareAtTaka) * 100),
      stock: Number(variant.stock),
      isActive: variant.isActive,
    }));
    const payloadMedia = media.filter((item) => item.url.trim() !== '').map((item) => ({ url: item.url.trim(), alt: item.alt.trim() || undefined }));
    const tags = tagsText.split(',').map((tag) => tag.trim()).filter(Boolean);
    setBusy(true);
    try {
      if (product) {
        const dto: ProductUpdate = {
          name: name.trim(), slug: cleanSlug, categoryId, description: description.trim() || null,
          status, isFeatured, isBestSeller, isNewArrival, tags, media: payloadMedia, variants: payloadVariants,
        };
        await api.updateProduct(product.id, dto);
      } else {
        const dto: ProductCreate = {
          name: name.trim(), slug: cleanSlug, categoryId, description: description.trim() || null,
          status, isFeatured, isBestSeller, isNewArrival, tags, media: payloadMedia, variants: payloadVariants,
        };
        await api.createProduct(dto);
      }
      onSaved();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setError(uiError.message);
    } finally { setBusy(false); }
  }

  function updateVariant(index: number, patch: Partial<VariantRow>) {
    setVariants((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function updateMedia(index: number, patch: Partial<MediaRow>) {
    setMedia((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <Drawer title={product ? `Edit: ${product.name}` : 'Add Product'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <label className="field">Name<input className="input" value={name} onChange={(e) => { setName(e.target.value); if (!product && !slug) setSlug(slugify(e.target.value)); }} /></label>
        <label className="field">Slug<input className="input" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="kebab-case-slug" /></label>
        <label className="field">Category
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select a category</option>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="field">Description<textarea className="input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="field">Status
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)}>
            <option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option>
          </select>
        </label>
        <label className="field">Tags (comma separated)<input className="input" value={tagsText} onChange={(e) => setTagsText(e.target.value)} /></label>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '10px 0' }}>
          <span>Featured <Switch checked={isFeatured} onChange={setIsFeatured} label="Featured" /></span>
          <span>Bestseller <Switch checked={isBestSeller} onChange={setIsBestSeller} label="Bestseller" /></span>
          <span>New arrival <Switch checked={isNewArrival} onChange={setIsNewArrival} label="New arrival" /></span>
        </div>

        <h3>Variants</h3>
        {variants.map((variant, index) => (
          <div key={index} className="card" style={{ marginBottom: 10 }}>
            <div className="filter-row">
              <label className="field">SKU<input className="input" value={variant.sku} onChange={(e) => updateVariant(index, { sku: e.target.value })} /></label>
              <label className="field">Variant name<input className="input" value={variant.name} onChange={(e) => updateVariant(index, { name: e.target.value })} /></label>
              <label className="field">Size<input className="input" value={variant.size} onChange={(e) => updateVariant(index, { size: e.target.value })} /></label>
              <label className="field">Colour<input className="input" value={variant.colour} onChange={(e) => updateVariant(index, { colour: e.target.value })} /></label>
              <label className="field">Price (taka)<input className="input" inputMode="decimal" value={variant.priceTaka} onChange={(e) => updateVariant(index, { priceTaka: e.target.value })} /></label>
              <label className="field">Compare at price (taka)<input className="input" inputMode="decimal" value={variant.compareAtTaka} onChange={(e) => updateVariant(index, { compareAtTaka: e.target.value })} /></label>
              <label className="field">Stock<input className="input" inputMode="numeric" value={variant.stock} onChange={(e) => updateVariant(index, { stock: e.target.value })} /></label>
              <span>Active <Switch checked={variant.isActive} onChange={(value) => updateVariant(index, { isActive: value })} label="Variant active" /></span>
            </div>
            {variants.length > 1 ? <button type="button" className="btn-secondary btn-small" onClick={() => setVariants((prev) => prev.filter((_, i) => i !== index))}>Remove variant</button> : null}
          </div>
        ))}
        <button type="button" className="btn-secondary btn-small" onClick={() => setVariants((prev) => [...prev, emptyVariant()])}>Add variant</button>

        <h3>Images</h3>
        <p className="note muted">Image URL: there is no upload system in the portal. Assets use the existing URL flow, so paste the hosted image URL here.</p>
        {media.map((item, index) => (
          <div key={index} className="filter-row">
            <label className="field">Image URL<input className="input" value={item.url} onChange={(e) => updateMedia(index, { url: e.target.value })} placeholder="https://..." /></label>
            <label className="field">Alt text<input className="input" value={item.alt} onChange={(e) => updateMedia(index, { alt: e.target.value })} /></label>
            {media.length > 1 ? <button type="button" className="btn-secondary btn-small" onClick={() => setMedia((prev) => prev.filter((_, i) => i !== index))}>Remove</button> : null}
          </div>
        ))}
        <button type="button" className="btn-secondary btn-small" onClick={() => setMedia((prev) => [...prev, { url: '', alt: '' }])}>Add image URL</button>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving...' : product ? 'Save changes' : 'Create product'}</button>
        </div>
      </form>
    </Drawer>
  );
}
