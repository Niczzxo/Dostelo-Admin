'use client';

import { useMemo, useState, type FormEvent } from 'react';
import {
  BarChart3,
  Boxes,
  History,
  Package,
  Plus,
  SlidersHorizontal,
  Warehouse,
} from 'lucide-react';
import { LOW_STOCK_THRESHOLD } from '@dostelo/types';
import type { StockView } from '@dostelo/api-client';
import { api, formatDateTime, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import { BarChart } from '../../../components/charts';
import {
  Badge,
  CardHead,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  Modal,
  ModuleHeader,
  Pagination,
  pageCountFor,
  paginate,
} from '../../../components/ui';

const PAGE_SIZE = 10;
const MOVEMENT_PAGE_SIZE = 10;

type StatusFilter = '' | 'in' | 'low' | 'out';
type SortKey = 'product' | 'onHand' | 'reserved' | 'available';

function statusOf(item: StockView): 'in' | 'low' | 'out' {
  if (item.available <= 0) return 'out';
  if (item.available <= LOW_STOCK_THRESHOLD) return 'low';
  return 'in';
}
function statusLabel(status: 'in' | 'low' | 'out'): string {
  if (status === 'out') return 'Out of stock';
  if (status === 'low') return 'Low stock';
  return 'In stock';
}

export default function InventoryPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canAdjust = permissions.includes('inventory.adjust');
  const canReadProducts = permissions.includes('products.read');

  const stock = useData((client) => client.listInventory(), []);
  const products = useData(
    (client) => (canReadProducts ? client.listAdminProducts() : client.listProducts()),
    [canReadProducts],
  );
  const movements = useData((client) => client.listStockMovements({ limit: 500 }), []);

  const [searchDraft, setSearchDraft] = useState('');
  const [productDraft, setProductDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<StatusFilter>('');
  const [filters, setFilters] = useState({ search: '', product: '', status: '' as StatusFilter });
  const [page, setPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('product');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustPreset, setAdjustPreset] = useState<'adjust' | 'add'>('adjust');
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustVariantId, setAdjustVariantId] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustMessage, setAdjustMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const variantInfo = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; variantName: string; sku: string; thumb: string | null }>();
    for (const product of products.data?.items ?? []) {
      const thumb = product.media.slice().sort((a, b) => a.position - b.position)[0]?.url ?? null;
      for (const variant of product.variants) {
        map.set(variant.id, { productId: product.id, productName: product.name, variantName: variant.name, sku: variant.sku, thumb });
      }
    }
    return map;
  }, [products.data]);

  const allItems = stock.data?.items ?? [];
  const kpis = useMemo(() => ({
    units: allItems.reduce((sum, item) => sum + item.onHand, 0),
    low: allItems.filter((item) => statusOf(item) === 'low').length,
    out: allItems.filter((item) => statusOf(item) === 'out').length,
    reserved: allItems.reduce((sum, item) => sum + item.reserved, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [stock.data]);

  const filtered = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    let items = allItems.filter((item) => {
      const info = variantInfo.get(item.variantId);
      if (filters.product && item.productId !== filters.product) return false;
      if (filters.status && statusOf(item) !== filters.status) return false;
      if (!needle) return true;
      return (
        info?.productName.toLowerCase().includes(needle) ||
        info?.variantName.toLowerCase().includes(needle) ||
        info?.sku.toLowerCase().includes(needle)
      );
    });
    items = [...items].sort((a, b) => {
      let result = 0;
      if (sortKey === 'product') result = (variantInfo.get(a.variantId)?.productName ?? a.productId).localeCompare(variantInfo.get(b.variantId)?.productName ?? b.productId);
      if (sortKey === 'onHand') result = a.onHand - b.onHand;
      if (sortKey === 'reserved') result = a.reserved - b.reserved;
      if (sortKey === 'available') result = a.available - b.available;
      return sortDir === 'asc' ? result : -result;
    });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock.data, filters, variantInfo, sortKey, sortDir]);

  const pageItems = paginate(filtered, page, PAGE_SIZE);
  const movementItems = movements.data?.items ?? [];
  const movementPageItems = paginate(movementItems, movementPage, MOVEMENT_PAGE_SIZE);

  const chartPoints = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const movement of movementItems) {
      const day = movement.createdAt.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, value]) => ({ label: day.slice(5), value }));
  }, [movementItems]);

  const movementGroups = useMemo(() => {
    const groups = { adjustmentIn: 0, adjustmentOut: 0, reserve: 0, release: 0, finalize: 0 };
    for (const movement of movementItems) {
      if (movement.type === 'adjustment' && movement.deltaOnHand >= 0) groups.adjustmentIn += 1;
      else if (movement.type === 'adjustment') groups.adjustmentOut += 1;
      else if (movement.type === 'reserve') groups.reserve += 1;
      else if (movement.type === 'release') groups.release += 1;
      else if (movement.type === 'finalize') groups.finalize += 1;
    }
    return groups;
  }, [movementItems]);

  const adjustProduct = (products.data?.items ?? []).find((p) => p.id === adjustProductId) ?? null;
  const adjustStockView = allItems.find((item) => item.variantId === adjustVariantId) ?? null;
  const parsedDelta = Number(delta);
  const deltaValid = Number.isInteger(parsedDelta) && parsedDelta !== 0;
  const adjustType = deltaValid ? (parsedDelta > 0 ? 'Adjustment in (stock increases)' : 'Adjustment out (stock decreases)') : 'Enter a non-zero quantity';

  function openAdjust(preset: 'adjust' | 'add', variantId?: string) {
    setAdjustPreset(preset);
    setAdjustError(null); setAdjustMessage(null); setReason(''); setReference('');
    setDelta(preset === 'add' ? '10' : '');
    if (variantId) {
      const info = variantInfo.get(variantId);
      setAdjustVariantId(variantId);
      setAdjustProductId(info?.productId ?? '');
    } else {
      setAdjustVariantId('');
      setAdjustProductId('');
    }
    setAdjustOpen(true);
  }

  function applyFilters() {
    setFilters({ search: searchDraft, product: productDraft, status: statusDraft });
    setPage(1);
  }
  function resetFilters() {
    setSearchDraft(''); setProductDraft(''); setStatusDraft('');
    setFilters({ search: '', product: '', status: '' });
    setPage(1);
  }
  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  async function handleAdjust(event: FormEvent) {
    event.preventDefault();
    setAdjustError(null); setAdjustMessage(null);
    if (!adjustVariantId) { setAdjustError('Select a product and a variant.'); return; }
    if (!deltaValid) { setAdjustError('Enter a non-zero whole number quantity, for example 10 or -2.'); return; }
    if (!reason.trim()) { setAdjustError('Reason is required.'); return; }
    setBusy(true);
    try {
      // The InventoryAdjust API shape is only delta and reason. A reference typed
      // here is appended to the reason so it is kept in the audit record.
      const fullReason = reference.trim() ? `${reason.trim()} (Ref: ${reference.trim()})` : reason.trim();
      const view = await api.adjustStock(adjustVariantId, { delta: parsedDelta, reason: fullReason });
      setAdjustMessage(`Stock updated: ${view.available} available now, ${view.onHand} on hand.`);
      stock.reload(); movements.reload();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') { window.location.assign('/login'); return; }
      setAdjustError(uiError.message);
    } finally { setBusy(false); }
  }

  return (
    <section>
      <ModuleHeader icon={Warehouse} title="Inventory and Warehouse" description="Stock per variant from the inventory store, with the movement ledger and guarded adjustments.">
        <button type="button" className="btn-secondary" disabled={!canAdjust} onClick={() => openAdjust('add')}>
          <Plus size={16} /> Add Stock
        </button>
        <button type="button" className="btn" disabled={!canAdjust} onClick={() => openAdjust('adjust')}>
          <SlidersHorizontal size={16} /> Stock Adjustment
        </button>
      </ModuleHeader>
      {!canAdjust ? <p className="note muted">Your role cannot adjust inventory (the inventory.adjust permission is required). Stock adjustment actions are disabled.</p> : null}

      {stock.loading ? <LoadingNote label="Loading stock..." /> : null}
      {stock.error ? <ErrorNote error={stock.error} onRetry={stock.reload} /> : null}
      {products.error ? <ErrorNote error={products.error} onRetry={products.reload} /> : null}
      {adjustMessage && !adjustOpen ? <p className="note">{adjustMessage}</p> : null}

      {stock.data ? (
        <div className="kpi-grid">
          <KpiCard icon={Boxes} label="Total Stock Units" value={String(kpis.units)} note="Sum of on hand across all variants" />
          <KpiCard icon={Package} label="Low Stock" value={String(kpis.low)} note={`Available at or below ${LOW_STOCK_THRESHOLD}`} tone="orange" />
          <KpiCard icon={Package} label="Out of Stock" value={String(kpis.out)} note="Variants with no available stock" tone="orange" />
          <KpiCard icon={Warehouse} label="Reserved Units" value={String(kpis.reserved)} note="Units reserved by orders, across all variants" tone="blue" />
        </div>
      ) : null}

      <div className="card">
        <CardHead icon={Warehouse} title="Single stock location" />
        <p className="note">Stock is tracked per variant in one inventory. Warehouses and transfers are not part of the current data model, so there is no warehouse card and no transfer action on this page. Reserved Units is shown as a KPI instead of a warehouse count for the same reason.</p>
      </div>

      <div className="card">
        <CardHead icon={BarChart3} title="Stock movements per day" />
        {movements.loading ? <LoadingNote label="Loading movements..." /> : null}
        {movements.error ? <ErrorNote error={movements.error} onRetry={movements.reload} /> : null}
        {movements.data && movementItems.length === 0 ? <EmptyNote>No stock movements recorded yet.</EmptyNote> : null}
        {chartPoints.length > 0 ? <BarChart points={chartPoints} /> : null}
        {movementItems.length > 0 ? (
          <p className="note">
            Grouped from the loaded movements: Adjustments in {movementGroups.adjustmentIn}, Adjustments out {movementGroups.adjustmentOut}, Reserve {movementGroups.reserve}, Release {movementGroups.release}, Finalize {movementGroups.finalize}.
          </p>
        ) : null}
        <p className="note muted">Note: the ledger starts at this deployment and older history does not exist.</p>
      </div>

      <div className="card filter-card">
        <div className="filter-row">
          <label className="field">Search<input className="input" placeholder="Product or SKU" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} /></label>
          <label className="field">Product
            <select className="select" value={productDraft} onChange={(e) => setProductDraft(e.target.value)}>
              <option value="">All products</option>
              {(products.data?.items ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label className="field">Status
            <select className="select" value={statusDraft} onChange={(e) => setStatusDraft(e.target.value as StatusFilter)}>
              <option value="">Any status</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option>
            </select>
          </label>
          <div className="filter-actions">
            <button type="button" className="btn-secondary" onClick={resetFilters}>Reset</button>
            <button type="button" className="btn" onClick={applyFilters}>Apply</button>
          </div>
        </div>
      </div>

      <div className="card">
        <CardHead icon={Boxes} title="Stock levels" />
        {stock.data && filtered.length === 0 ? <EmptyNote>No stock records match this filter.</EmptyNote> : null}
        {pageItems.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th><button type="button" className="btn-secondary btn-small" onClick={() => toggleSort('product')}>Product</button></th>
                <th>Variant</th><th>SKU</th>
                <th className="num"><button type="button" className="btn-secondary btn-small" onClick={() => toggleSort('onHand')}>On Hand</button></th>
                <th className="num"><button type="button" className="btn-secondary btn-small" onClick={() => toggleSort('reserved')}>Reserved</button></th>
                <th className="num"><button type="button" className="btn-secondary btn-small" onClick={() => toggleSort('available')}>Available</button></th>
                <th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {pageItems.map((item) => {
                  const info = variantInfo.get(item.variantId);
                  const status = statusOf(item);
                  return (
                    <tr key={item.variantId}>
                      <td><div className="identity-cell">{info?.thumb ? <span className="thumb"><img src={info.thumb} alt="" /></span> : null}<span className="identity-main">{info?.productName ?? item.productId}</span></div></td>
                      <td>{info?.variantName ?? item.variantId}</td>
                      <td>{info?.sku ?? '-'}</td>
                      <td className="num">{item.onHand}</td>
                      <td className="num">{item.reserved}</td>
                      <td className="num">{item.available}</td>
                      <td><Badge>{statusLabel(status)}</Badge></td>
                      <td>{canAdjust ? <button type="button" className="btn-secondary btn-small" onClick={() => openAdjust('adjust', item.variantId)}>Adjust</button> : <span className="muted">No access</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="table-foot">
          <span>{filtered.length} variant(s)</span>
          <Pagination page={page} pageCount={pageCountFor(filtered.length, PAGE_SIZE)} onChange={setPage} />
        </div>
      </div>

      <div className="card">
        <CardHead icon={History} title="Stock movements" />
        {movements.loading ? <LoadingNote label="Loading movements..." /> : null}
        {movements.error ? <ErrorNote error={movements.error} onRetry={movements.reload} /> : null}
        {movements.data && movementItems.length === 0 ? <EmptyNote>No stock movements recorded yet. The ledger starts at this deployment.</EmptyNote> : null}
        {movementPageItems.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>Product and variant</th><th>Type</th><th className="num">Delta on hand</th><th className="num">Delta reserved</th><th className="num">Balance after</th><th>Reference</th></tr></thead>
              <tbody>
                {movementPageItems.map((movement) => {
                  const info = variantInfo.get(movement.variantId);
                  return (
                    <tr key={movement.id}>
                      <td>{formatDateTime(movement.createdAt)}</td>
                      <td>{info ? `${info.productName} / ${info.variantName}` : movement.productId}<div className="muted">{info?.sku ?? movement.variantId}</div></td>
                      <td><span className="badge">{movement.type}</span></td>
                      <td className="num">{movement.deltaOnHand}</td>
                      <td className="num">{movement.deltaReserved}</td>
                      <td className="num">{movement.onHandAfter} on hand, {movement.reservedAfter} reserved</td>
                      <td>{movement.reference ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <div className="table-foot">
          <span>{movementItems.length} movement(s) loaded</span>
          <Pagination page={movementPage} pageCount={pageCountFor(movementItems.length, MOVEMENT_PAGE_SIZE)} onChange={setMovementPage} />
        </div>
      </div>

      {adjustOpen ? (
        <Modal title={adjustPreset === 'add' ? 'Add Stock' : 'Stock Adjustment'} onClose={() => setAdjustOpen(false)}>
          <form onSubmit={handleAdjust}>
            <label className="field">Product
              <select className="select" value={adjustProductId} onChange={(e) => { setAdjustProductId(e.target.value); setAdjustVariantId(''); }}>
                <option value="">Select a product</option>
                {(products.data?.items ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
            <label className="field">Variant
              <select className="select" value={adjustVariantId} onChange={(e) => setAdjustVariantId(e.target.value)} disabled={!adjustProduct}>
                <option value="">Select a variant</option>
                {(adjustProduct?.variants ?? []).map((variant) => <option key={variant.id} value={variant.id}>{variant.name} ({variant.sku})</option>)}
              </select>
            </label>
            <label className="field">Quantity (delta, use a negative number to remove stock)
              <input className="input" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="10 or -2" />
            </label>
            <p className="note">Type: {adjustType}</p>
            <label className="field">Reason (required)<input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <label className="field">Reference (optional)<input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Delivery note, count sheet, order number" /></label>

            <div className="card">
              <p className="note" style={{ margin: 0 }}>
                Confirmation: {adjustStockView ? `Current on hand ${adjustStockView.onHand}, reserved ${adjustStockView.reserved}, available ${adjustStockView.available}. ` : 'Select a variant to see current stock. '}
                {deltaValid && adjustStockView ? `After this adjustment on hand would be ${adjustStockView.onHand + parsedDelta}. Negative stock is refused by the server.` : ''}
              </p>
            </div>
            {adjustMessage ? <p className="note">{adjustMessage}</p> : null}
            {adjustError ? <p className="form-error" role="alert">{adjustError}</p> : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn-secondary" onClick={() => setAdjustOpen(false)}>Cancel</button>
              <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving...' : 'Confirm adjustment'}</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
