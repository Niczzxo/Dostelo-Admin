'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { LOW_STOCK_THRESHOLD } from '@dostelo/types';
import type { StockView } from '@dostelo/api-client';
import { api, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { useAuth } from '../../../components/auth-provider';
import {
  Badge,
  EmptyNote,
  ErrorNote,
  LoadingNote,
  PageHeader,
  StatCard,
} from '../../../components/ui';

/**
 * Inventory & Warehouse: every variant's stock level from the
 * inventory store, a low-stock view (available at or below the
 * shared threshold), and guarded adjustments. Adjustments go
 * through the same API the Products drawer uses and are audited
 * server-side.
 */
export default function InventoryPage() {
  const { session } = useAuth();
  const canAdjust =
    session.principal?.permissions.includes('inventory.adjust') ?? false;
  const [lowOnly, setLowOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stock = useData((client) => client.listInventory(), []);
  const products = useData((client) => client.listProducts(), []);

  const variantInfo = useMemo(() => {
    const map = new Map<
      string,
      { productName: string; variantName: string; sku: string }
    >();
    for (const product of products.data?.items ?? []) {
      for (const variant of product.variants) {
        map.set(variant.id, {
          productName: product.name,
          variantName: variant.name,
          sku: variant.sku,
        });
      }
    }
    return map;
  }, [products.data]);

  const rows = useMemo(() => {
    const items = stock.data?.items ?? [];
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (lowOnly && item.available > LOW_STOCK_THRESHOLD) return false;
      if (!needle) return true;
      const info = variantInfo.get(item.variantId);
      return (
        info?.productName.toLowerCase().includes(needle) ||
        info?.variantName.toLowerCase().includes(needle) ||
        info?.sku.toLowerCase().includes(needle)
      );
    });
  }, [stock.data, lowOnly, search, variantInfo]);

  const lowCount = (stock.data?.items ?? []).filter(
    (item) => item.available <= LOW_STOCK_THRESHOLD && item.available > 0,
  ).length;
  const outCount = (stock.data?.items ?? []).filter(
    (item) => item.available <= 0,
  ).length;

  const selected: StockView | null =
    stock.data?.items.find((item) => item.variantId === selectedVariantId) ??
    null;

  async function handleAdjust(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selected) return;
    const parsed = Number(delta);
    if (!Number.isInteger(parsed) || parsed === 0) {
      setError('Enter a non-zero whole number, for example 10 or -2.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const view = await api.adjustStock(selected.variantId, {
        delta: parsed,
        reason: reason.trim() ? reason.trim() : undefined,
      });
      setMessage(`Stock updated: ${view.available} available now.`);
      setDelta('');
      setReason('');
      stock.reload();
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
    <section>
      <PageHeader title="Inventory & Warehouse" />
      <div className="grid" style={{ marginBottom: 20 }}>
        <StatCard
          label="Variants tracked"
          value={String(stock.data?.items.length ?? 0)}
        />
        <StatCard
          label="Low stock"
          value={String(lowCount)}
          note={`Available at or below ${LOW_STOCK_THRESHOLD}`}
        />
        <StatCard label="Out of stock" value={String(outCount)} />
      </div>

      <div className="toolbar">
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          Search
          <input
            className="input"
            placeholder="Product, variant or SKU"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="field">
          View
          <select
            className="select"
            value={lowOnly ? 'low' : 'all'}
            onChange={(event) => setLowOnly(event.target.value === 'low')}
          >
            <option value="all">All stock</option>
            <option value="low">Low stock only</option>
          </select>
        </label>
      </div>

      {stock.loading ? <LoadingNote label="Loading stock..." /> : null}
      {stock.error ? (
        <ErrorNote error={stock.error} onRetry={stock.reload} />
      ) : null}
      {stock.data && rows.length === 0 ? (
        <EmptyNote>
          {lowOnly
            ? 'No variant is at or below the low-stock threshold.'
            : 'No stock records match this search.'}
        </EmptyNote>
      ) : null}
      {rows.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Variant</th>
                <th>SKU</th>
                <th className="num">On hand</th>
                <th className="num">Reserved</th>
                <th className="num">Available</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const info = variantInfo.get(item.variantId);
                return (
                  <tr
                    key={item.variantId}
                    className="clickable"
                    onClick={() => {
                      setSelectedVariantId(item.variantId);
                      setMessage(null);
                      setError(null);
                    }}
                  >
                    <td>{info?.productName ?? item.productId}</td>
                    <td>{info?.variantName ?? item.variantId}</td>
                    <td>{info?.sku ?? ''}</td>
                    <td className="num">{item.onHand}</td>
                    <td className="num">{item.reserved}</td>
                    <td className="num">{item.available}</td>
                    <td>
                      {item.available <= 0 ? (
                        <Badge>Out of stock</Badge>
                      ) : item.available <= LOW_STOCK_THRESHOLD ? (
                        <Badge>Low stock</Badge>
                      ) : (
                        <Badge>In stock</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {selected ? (
        <div className="card" style={{ marginTop: 20, maxWidth: 720 }}>
          <h2 style={{ fontSize: 17, marginTop: 0 }}>
            Adjust stock: {variantInfo.get(selected.variantId)?.productName}{' '}
            {variantInfo.get(selected.variantId)?.variantName}
          </h2>
          <p className="note muted" style={{ marginTop: 0 }}>
            On hand {selected.onHand}, reserved {selected.reserved},
            available {selected.available}. Adjustments are written to the
            audit log.
          </p>
          {canAdjust ? (
            <form onSubmit={handleAdjust}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="input"
                  style={{ width: 110, marginTop: 0 }}
                  inputMode="numeric"
                  placeholder="+/- qty"
                  value={delta}
                  onChange={(event) => setDelta(event.target.value)}
                  aria-label="Adjustment quantity"
                />
                <input
                  className="input"
                  style={{ flex: 1, minWidth: 160, marginTop: 0 }}
                  placeholder="Reason (optional)"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  aria-label="Adjustment reason"
                />
                <button
                  type="submit"
                  className="btn btn-small"
                  disabled={busy}
                >
                  {busy ? 'Saving...' : 'Adjust stock'}
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
          ) : (
            <p className="note muted">
              Your role cannot adjust inventory (the inventory.adjust
              permission is required).
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
