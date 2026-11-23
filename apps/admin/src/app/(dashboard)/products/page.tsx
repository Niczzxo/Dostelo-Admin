'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { Product } from '@dostelo/types';
import { api, formatMoney, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
} from '../../../components/ui';
import type { StockView } from '@dostelo/api-client';

function AdjustStockForm({
  variantId,
  onAdjusted,
}: {
  variantId: string;
  onAdjusted: () => void;
}) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const parsed = Number(delta);
    if (!Number.isInteger(parsed) || parsed === 0) {
      setError('Enter a non-zero whole number, for example 10 or -2.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const view = await api.adjustStock(variantId, {
        delta: parsed,
        reason: reason.trim() ? reason.trim() : undefined,
      });
      setMessage(`Stock updated: ${view.available} available now.`);
      setDelta('');
      setReason('');
      onAdjusted();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        window.location.assign('/login');
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="input"
          style={{ width: 90, marginTop: 0 }}
          inputMode="numeric"
          placeholder="+/- qty"
          value={delta}
          onChange={(event) => setDelta(event.target.value)}
          aria-label="Adjustment quantity"
        />
        <input
          className="input"
          style={{ flex: 1, minWidth: 140, marginTop: 0 }}
          placeholder="Reason (optional)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-label="Adjustment reason"
        />
        <button type="submit" className="btn btn-small" disabled={busy}>
          {busy ? 'Saving...' : 'Adjust'}
        </button>
      </div>
      {message ? (
        <p className="note" style={{ margin: '8px 0 0' }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function ProductDrawer({
  product,
  stock,
  stockError,
  canAdjust,
  onClose,
  onAdjusted,
}: {
  product: Product;
  stock: StockView[] | null;
  stockError: string | null;
  canAdjust: boolean;
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const stockByVariant = new Map(
    (stock ?? []).map((item) => [item.variantId, item]),
  );
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" aria-label={`Product detail: ${product.name}`}>
        <div className="drawer-head">
          <h2 style={{ fontSize: 20, margin: 0 }}>{product.name}</h2>
          <button type="button" className="btn btn-small" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="note muted" style={{ marginTop: 0 }}>
          {product.slug} · <Badge>{product.status}</Badge>
          {product.isBestSeller ? (
            <>
              {' '}
              <Badge>Bestseller</Badge>
            </>
          ) : null}
          {product.isNewArrival ? (
            <>
              {' '}
              <Badge>New arrival</Badge>
            </>
          ) : null}
        </p>
        {product.description ? (
          <p style={{ lineHeight: 1.6 }}>{product.description}</p>
        ) : null}
        <h3 style={{ fontSize: 16 }}>Variants and stock</h3>
        {stockError ? (
          <p className="form-error" role="alert">
            {stockError}
          </p>
        ) : null}
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Variant</th>
                <th>SKU</th>
                <th className="num">Price</th>
                <th className="num">Available</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => {
                const live = stockByVariant.get(variant.id);
                return (
                  <tr key={variant.id}>
                    <td>{variant.name}</td>
                    <td>{variant.sku}</td>
                    <td className="num">{formatMoney(variant.price)}</td>
                    <td className="num">
                      {live ? live.available : variant.stock}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canAdjust ? (
          <>
            <h3 style={{ fontSize: 16, marginTop: 24 }}>
              Adjust stock by variant
            </h3>
            {product.variants.map((variant) => (
              <div key={variant.id} style={{ marginTop: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {variant.name}
                </div>
                <AdjustStockForm
                  variantId={variant.id}
                  onAdjusted={onAdjusted}
                />
              </div>
            ))}
          </>
        ) : (
          <p className="note muted">
            Your role cannot adjust inventory (the inventory.adjust
            permission is required).
          </p>
        )}
      </aside>
    </>
  );
}

export default function ProductsPage() {
  const { session } = useAuth();
  const canAdjust =
    session.principal?.permissions.includes('inventory.adjust') ?? false;
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const categories = useData((client) => client.listCategories(), []);
  const products = useData(
    (client) => client.listProducts(category || undefined),
    [category],
  );
  const stock = useData(
    (client) =>
      selectedId
        ? client.listInventory(selectedId)
        : Promise.resolve({ items: [] as StockView[] }),
    [selectedId],
  );

  const visible = useMemo(() => {
    const items = products.data?.items ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (product) =>
        product.name.toLowerCase().includes(needle) ||
        product.slug.toLowerCase().includes(needle) ||
        product.variants.some((variant) =>
          variant.sku.toLowerCase().includes(needle),
        ),
    );
  }, [products.data, search]);

  const selected =
    products.data?.items.find((product) => product.id === selectedId) ?? null;

  return (
    <section>
      <PageHeader title="Products" />
      <div className="toolbar">
        <label className="field">
          Category
          <select
            className="select"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {(categories.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name} ({item.productCount})
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          Search
          <input
            className="input"
            placeholder="Name or SKU"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      {products.loading ? <LoadingNote label="Loading products..." /> : null}
      {products.error ? (
        <ErrorNote error={products.error} onRetry={products.reload} />
      ) : null}
      {products.data && visible.length === 0 ? (
        <EmptyNote>No products match this filter.</EmptyNote>
      ) : null}
      {visible.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Status</th>
                <th className="num">Variants</th>
                <th className="num">From</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((product) => {
                const prices = product.variants.map(
                  (variant) => variant.price.amountMinor,
                );
                return (
                  <tr
                    key={product.id}
                    className="clickable"
                    onClick={() => setSelectedId(product.id)}
                  >
                    <td>{product.name}</td>
                    <td>
                      <Badge>{product.status}</Badge>
                    </td>
                    <td className="num">{product.variants.length}</td>
                    <td className="num">
                      {prices.length > 0
                        ? formatMoney({
                            amountMinor: Math.min(...prices),
                            currency: 'BDT',
                          })
                        : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <ProductDrawer
          product={selected}
          stock={stock.data?.items ?? null}
          stockError={stock.error ? stock.error.message : null}
          canAdjust={canAdjust}
          onClose={() => setSelectedId(null)}
          onAdjusted={() => {
            stock.reload();
            products.reload();
          }}
        />
      ) : null}
    </section>
  );
}
