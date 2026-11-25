'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  ClipboardList,
  Download,
  LayoutGrid,
  List,
  Package,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Truck,
  XCircle,
} from 'lucide-react';
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_GATEWAY_LABELS,
  SHIPMENT_STATUS_LABELS,
  type Order,
  type OrderStatus,
  type PaymentGateway,
  type Shipment,
} from '@dostelo/types';
import type { CheckoutRequest } from '@dostelo/validation';
import { api, formatDateTime, formatMoney, toUiError } from '../../../lib/api';
import { useData } from '../../../lib/use-data';
import { downloadCsv, toCsv } from '../../../lib/csv';
import { expireSession } from '../../../lib/session';
import { useAuth } from '../../../components/auth-provider';
import { AreaChart, DonutChart } from '../../../components/charts';
import {
  Badge,
  CardHead,
  Drawer,
  EmptyNote,
  ErrorNote,
  KpiCard,
  LoadingNote,
  ModuleHeader,
  Pagination,
  pageCountFor,
  paginate,
} from '../../../components/ui';

const PAGE_SIZE = 10;

/** Statuses from which the API flow policy allows cancellation
 * (apps/api status-flow: cancellation only before the order ships).
 * The list endpoint does not return allowed transitions per order,
 * so bulk actions are limited to Cancel, checked against this set. */
const CANCELLABLE_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'processing',
  'packed',
  'ready-to-ship',
];

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: '#E8930C',
  confirmed: '#7C5CFF',
  processing: '#4C8DFF',
  packed: '#00A8A8',
  'ready-to-ship': '#2F9E6E',
  shipped: '#3E63DD',
  'out-for-delivery': '#8E4EC6',
  delivered: '#1FA855',
  cancelled: '#E5484D',
  returned: '#AD5700',
};

const TREND_METRICS = [
  ['orders', 'Orders'],
  ['revenue', 'Revenue'],
  ['aov', 'AOV'],
] as const;
type TrendMetric = (typeof TREND_METRICS)[number][0];

interface Filters {
  search: string;
  status: OrderStatus | '';
  payment: string;
  shipping: '' | 'with' | 'without';
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  search: '',
  status: '',
  payment: '',
  shipping: '',
  from: '',
  to: '',
};

function itemCount(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function csvRows(rows: Order[]): (string | number)[][] {
  return rows.map((order) => [
    order.orderNumber,
    order.address.fullName,
    order.address.phone,
    itemCount(order),
    order.total.amountMinor / 100,
    order.paymentStatus,
    ORDER_STATUS_LABELS[order.status],
    formatDateTime(order.createdAt),
  ]);
}

const CSV_HEADERS = [
  'Order ID',
  'Customer',
  'Phone',
  'Items',
  'Total (BDT)',
  'Payment status',
  'Order status',
  'Order date',
];

interface DraftLine {
  productId: string;
  variantId: string;
  quantity: number;
  productName: string;
  variantName: string;
  stock: number;
}

/**
 * Create Order drawer: staff order creation through
 * createStaffOrder (POST /v1/admin/orders). The request follows
 * the checkout validation shape (CheckoutRequest): an existing
 * customerId or guest contact details, inline lines that each
 * carry a variant, a delivery address and a payment method. The
 * server computes every total; the drawer only shows the total
 * the server returned for the created order.
 */
function CreateOrderDrawer({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { session } = useAuth();
  const canCustomers =
    session.principal?.permissions.includes('customers.read') ?? false;

  const [mode, setMode] = useState<'existing' | 'guest'>(
    canCustomers ? 'existing' : 'guest',
  );
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');

  const [productSearch, setProductSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [lines, setLines] = useState<DraftLine[]>([]);

  const [paymentMethod, setPaymentMethod] =
    useState<PaymentGateway>('cod');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Order | null>(null);

  const customers = useData(
    (client) =>
      canCustomers
        ? client.listCustomers({
            search: customerSearch.trim() || undefined,
            limit: 50,
          })
        : Promise.resolve({ items: [] }),
    [canCustomers, customerSearch],
  );
  const products = useData(
    (client) => client.listAdminProducts(),
    [],
  );

  const productList = products.data?.items ?? [];
  const visibleProducts = productList.filter((product) =>
    product.name.toLowerCase().includes(productSearch.trim().toLowerCase()),
  );
  const selectedProduct =
    productList.find((product) => product.id === productId) ?? null;
  const selectedVariant =
    selectedProduct?.variants.find((variant) => variant.id === variantId) ??
    null;

  function pickCustomer(id: string): void {
    setCustomerId(id);
    const customer = (customers.data?.items ?? []).find((c) => c.id === id);
    if (!customer) return;
    const address =
      customer.addresses.find((entry) => entry.isDefault) ??
      customer.addresses[0];
    if (address) {
      setFullName(address.fullName);
      setPhone(address.phone);
      setAddressLine(address.addressLine);
      setArea(address.area ?? '');
      setCity(address.city);
      setDistrict(address.district);
    } else {
      setFullName(customer.fullName);
      setPhone(customer.phone);
    }
  }

  function addLine(): void {
    if (!selectedProduct || !selectedVariant) return;
    setLines((current) => {
      const existing = current.find(
        (line) => line.variantId === selectedVariant.id,
      );
      if (existing) {
        return current.map((line) =>
          line.variantId === selectedVariant.id
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      return [
        ...current,
        {
          productId: selectedProduct.id,
          variantId: selectedVariant.id,
          quantity,
          productName: selectedProduct.name,
          variantName: selectedVariant.name,
          stock: selectedVariant.stock,
        },
      ];
    });
  }

  async function submit(): Promise<void> {
    setError(null);
    if (lines.length === 0) {
      setError('Add at least one product line.');
      return;
    }
    if (mode === 'existing' && !customerId) {
      setError('Select an existing customer, or switch to guest details.');
      return;
    }
    if (mode === 'guest' && (!guestName.trim() || !guestPhone.trim())) {
      setError('Guest name and phone are required.');
      return;
    }
    if (
      !fullName.trim() ||
      !phone.trim() ||
      !addressLine.trim() ||
      !city.trim() ||
      !district.trim()
    ) {
      setError('Delivery name, phone, address, city and district are required.');
      return;
    }
    const dto: CheckoutRequest = {
      ...(mode === 'existing'
        ? { customerId }
        : {
            customer: {
              fullName: guestName.trim(),
              phone: guestPhone.trim(),
              ...(guestEmail.trim() ? { email: guestEmail.trim() } : {}),
            },
          }),
      lines: lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
      })),
      address: {
        fullName: fullName.trim(),
        phone: phone.trim(),
        addressLine: addressLine.trim(),
        ...(area.trim() ? { area: area.trim() } : {}),
        city: city.trim(),
        district: district.trim(),
      },
      paymentMethod,
    };
    setBusy(true);
    try {
      const order = await api.createStaffOrder(dto);
      setCreated(order);
      onCreated();
    } catch (caught) {
      const uiError = toUiError(caught);
      if (uiError.kind === 'unauthorized') {
        expireSession();
        return;
      }
      setError(uiError.message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Drawer title="Order created" onClose={onClose}>
        <p className="note">
          Order <strong>{created.orderNumber}</strong> was created by the
          server with a total of <strong>{formatMoney(created.total)}</strong>{' '}
          and status {ORDER_STATUS_LABELS[created.status]}.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" href={`/orders/${created.orderNumber}`}>
            View the new order
          </Link>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Back to orders
          </button>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer title="Create Order" onClose={onClose}>
      <div className="toggle-pills" role="tablist" aria-label="Customer type">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'existing'}
          className={mode === 'existing' ? 'active' : ''}
          disabled={!canCustomers}
          onClick={() => setMode('existing')}
        >
          Existing customer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'guest'}
          className={mode === 'guest' ? 'active' : ''}
          onClick={() => setMode('guest')}
        >
          Guest
        </button>
      </div>
      {!canCustomers ? (
        <p className="note muted">
          Your role cannot search customers (customers.read), so guest
          details are used.
        </p>
      ) : null}

      {mode === 'existing' ? (
        <>
          <label className="field">
            Search customers
            <input
              className="input"
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="Name, email or phone"
            />
          </label>
          <label className="field">
            Customer
            <select
              className="select"
              value={customerId}
              onChange={(event) => pickCustomer(event.target.value)}
            >
              <option value="">Select a customer</option>
              {(customers.data?.items ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.fullName} ({customer.phone})
                </option>
              ))}
            </select>
          </label>
          {customers.loading ? (
            <LoadingNote label="Loading customers..." />
          ) : null}
          {customers.error ? (
            <ErrorNote error={customers.error} onRetry={customers.reload} />
          ) : null}
        </>
      ) : (
        <>
          <label className="field">
            Guest name
            <input
              className="input"
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
            />
          </label>
          <label className="field">
            Guest phone
            <input
              className="input"
              value={guestPhone}
              onChange={(event) => setGuestPhone(event.target.value)}
            />
          </label>
          <label className="field">
            Guest email (optional)
            <input
              className="input"
              value={guestEmail}
              onChange={(event) => setGuestEmail(event.target.value)}
            />
          </label>
        </>
      )}

      <h3 style={{ fontSize: 15, margin: '18px 0 6px' }}>Products</h3>
      {products.loading ? <LoadingNote label="Loading products..." /> : null}
      {products.error ? (
        <ErrorNote error={products.error} onRetry={products.reload} />
      ) : null}
      <label className="field">
        Search products
        <input
          className="input"
          value={productSearch}
          onChange={(event) => setProductSearch(event.target.value)}
          placeholder="Product name"
        />
      </label>
      <label className="field">
        Product
        <select
          className="select"
          value={productId}
          onChange={(event) => {
            setProductId(event.target.value);
            setVariantId('');
          }}
        >
          <option value="">Select a product</option>
          {visibleProducts.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Variant
        <select
          className="select"
          value={variantId}
          onChange={(event) => setVariantId(event.target.value)}
          disabled={!selectedProduct}
        >
          <option value="">Select a variant</option>
          {(selectedProduct?.variants ?? []).map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.name} (stock {variant.stock})
            </option>
          ))}
        </select>
      </label>
      {selectedProduct && selectedProduct.variants.length === 0 ? (
        <p className="note muted">
          This product has no variants, and the checkout API requires a
          variant on every line, so it cannot be added.
        </p>
      ) : null}
      <label className="field">
        Quantity
        <input
          className="input"
          type="number"
          min={1}
          max={99}
          value={quantity}
          onChange={(event) =>
            setQuantity(Math.max(1, Number(event.target.value) || 1))
          }
        />
      </label>
      {selectedVariant && quantity > selectedVariant.stock ? (
        <p className="form-error" role="alert">
          Quantity {quantity} exceeds the recorded stock of{' '}
          {selectedVariant.stock} for this variant. The server will make
          the final call.
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={!selectedVariant}
        onClick={addLine}
      >
        Add line
      </button>

      {lines.length > 0 ? (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Variant</th>
                <th className="num">Qty</th>
                <th className="num">Stock</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.variantId}>
                  <td>{line.productName}</td>
                  <td>{line.variantName}</td>
                  <td className="num">
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={99}
                      value={line.quantity}
                      aria-label={`Quantity for ${line.productName}`}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((entry) =>
                            entry.variantId === line.variantId
                              ? {
                                  ...entry,
                                  quantity: Math.max(
                                    1,
                                    Number(event.target.value) || 1,
                                  ),
                                }
                              : entry,
                          ),
                        )
                      }
                      style={{ width: 72 }}
                    />
                    {line.quantity > line.stock ? (
                      <div className="form-error">
                        Exceeds stock {line.stock}
                      </div>
                    ) : null}
                  </td>
                  <td className="num">{line.stock}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() =>
                        setLines((current) =>
                          current.filter(
                            (entry) => entry.variantId !== line.variantId,
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <h3 style={{ fontSize: 15, margin: '18px 0 6px' }}>Delivery address</h3>
      <label className="field">
        Full name
        <input
          className="input"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
      </label>
      <label className="field">
        Phone
        <input
          className="input"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </label>
      <label className="field">
        Address line
        <input
          className="input"
          value={addressLine}
          onChange={(event) => setAddressLine(event.target.value)}
        />
      </label>
      <label className="field">
        Area (optional)
        <input
          className="input"
          value={area}
          onChange={(event) => setArea(event.target.value)}
        />
      </label>
      <label className="field">
        City
        <input
          className="input"
          value={city}
          onChange={(event) => setCity(event.target.value)}
        />
      </label>
      <label className="field">
        District
        <input
          className="input"
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
        />
      </label>
      <p className="note muted">
        The delivery zone and fee are detected by the server from the
        address; they are never entered here.
      </p>

      <label className="field">
        Payment method
        <select
          className="select"
          value={paymentMethod}
          onChange={(event) =>
            setPaymentMethod(event.target.value as PaymentGateway)
          }
        >
          {(['cod', 'bkash', 'nagad', 'rocket', 'upay'] as PaymentGateway[]).map(
            (gateway) => (
              <option key={gateway} value={gateway}>
                {PAYMENT_GATEWAY_LABELS[gateway]}
              </option>
            ),
          )}
        </select>
      </label>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? 'Creating...' : 'Create order'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
      <p className="note muted">
        Totals, delivery fee and stock checks are computed by the server
        when the order is created; nothing is totalled on this screen.
      </p>
    </Drawer>
  );
}

export default function OrdersPage() {
  const { session } = useAuth();
  const permissions = session.principal?.permissions ?? [];
  const canCreate = permissions.includes('orders.create');
  const canEdit = permissions.includes('orders.edit');
  const canPayments = permissions.includes('payments.read');
  const canShipping = permissions.includes('shipping.read');
  const canCustomers = permissions.includes('customers.read');

  const orders = useData((client) => client.listStaffOrders(), []);
  const payments = useData(
    (client) =>
      canPayments ? client.listPayments() : Promise.resolve(null),
    [canPayments],
  );
  const shipments = useData(
    (client) =>
      canShipping ? client.listShipments() : Promise.resolve(null),
    [canShipping],
  );
  const customers = useData(
    (client) =>
      canCustomers
        ? client.listCustomers({ limit: 500 })
        : Promise.resolve(null),
    [canCustomers],
  );

  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [sortKey, setSortKey] = useState<'date' | 'total'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [metric, setMetric] = useState<TrendMetric>('orders');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkNote, setBulkNote] = useState<string | null>(null);

  const allOrders = useMemo(() => orders.data?.items ?? [], [orders.data]);

  const customerById = useMemo(
    () =>
      new Map(
        (customers.data?.items ?? []).map((customer) => [
          customer.id,
          customer,
        ]),
      ),
    [customers.data],
  );

  /** A guest order is one whose customer record has no registered
   * account (userId null), or one with no customerId at all. */
  function isGuest(order: Order): boolean {
    if (!order.customerId) return true;
    const customer = customerById.get(order.customerId);
    return customer ? customer.userId === null : false;
  }

  const shipmentByOrder = useMemo(() => {
    const map = new Map<string, Shipment>();
    for (const shipment of shipments.data?.items ?? []) {
      const existing = map.get(shipment.orderNumber);
      if (!existing || shipment.createdAt > existing.createdAt) {
        map.set(shipment.orderNumber, shipment);
      }
    }
    return map;
  }, [shipments.data]);

  function shippingText(order: Order): string {
    const shipment = shipmentByOrder.get(order.orderNumber);
    if (shipment) return SHIPMENT_STATUS_LABELS[shipment.status];
    if (
      order.status === 'shipped' ||
      order.status === 'out-for-delivery' ||
      order.status === 'delivered'
    ) {
      return ORDER_STATUS_LABELS[order.status];
    }
    return 'Not shipped';
  }

  const refundedPayments = (payments.data?.items ?? []).filter(
    (payment) => payment.status === 'refunded',
  ).length;

  const paymentOptions = useMemo(
    () => [...new Set(allOrders.map((order) => order.paymentStatus))],
    [allOrders],
  );

  const filtered = useMemo(() => {
    const search = applied.search.trim().toLowerCase();
    const rows = allOrders.filter((order) => {
      if (applied.status && order.status !== applied.status) return false;
      if (applied.payment && order.paymentStatus !== applied.payment) {
        return false;
      }
      if (applied.shipping && shipments.data) {
        const has = shipmentByOrder.has(order.orderNumber);
        if (applied.shipping === 'with' && !has) return false;
        if (applied.shipping === 'without' && has) return false;
      }
      if (applied.from && dayKey(order.createdAt) < applied.from) return false;
      if (applied.to && dayKey(order.createdAt) > applied.to) return false;
      if (search) {
        const haystack = [
          order.orderNumber,
          order.address.fullName,
          order.address.phone,
          ...order.items.map((item) => item.productName),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      const cmp =
        sortKey === 'date'
          ? a.createdAt.localeCompare(b.createdAt)
          : a.total.amountMinor - b.total.amountMinor;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [allOrders, applied, sortKey, sortDir, shipmentByOrder, shipments.data]);

  const pageRows = paginate(filtered, page, PAGE_SIZE);
  const pageCount = pageCountFor(filtered.length, PAGE_SIZE);

  const counts = useMemo(() => {
    const by = (status: OrderStatus) =>
      allOrders.filter((order) => order.status === status).length;
    return {
      total: allOrders.length,
      delivered: by('delivered'),
      inTransit: by('shipped') + by('out-for-delivery'),
      returned: by('returned'),
      processing: by('processing'),
      cancelled: by('cancelled'),
    };
  }, [allOrders]);

  const trend = useMemo(() => {
    if (allOrders.length === 0) return [];
    const latest = allOrders
      .map((order) => dayKey(order.createdAt))
      .sort()
      .at(-1)!;
    const end = new Date(`${latest}T00:00:00.000Z`);
    const buckets: { label: string; orders: number; revenue: number }[] = [];
    const byDay = new Map<string, { orders: number; revenue: number }>();
    for (const order of allOrders) {
      const key = dayKey(order.createdAt);
      const entry = byDay.get(key) ?? { orders: 0, revenue: 0 };
      entry.orders += 1;
      entry.revenue += order.total.amountMinor / 100;
      byDay.set(key, entry);
    }
    for (let i = 29; i >= 0; i -= 1) {
      const day = new Date(end.getTime() - i * 24 * 60 * 60_000);
      const key = day.toISOString().slice(0, 10);
      const entry = byDay.get(key) ?? { orders: 0, revenue: 0 };
      buckets.push({
        label: key.slice(5),
        orders: entry.orders,
        revenue: entry.revenue,
      });
    }
    return buckets.map((bucket) => ({
      label: bucket.label,
      value:
        metric === 'orders'
          ? bucket.orders
          : metric === 'revenue'
            ? Math.round(bucket.revenue)
            : bucket.orders === 0
              ? 0
              : Math.round(bucket.revenue / bucket.orders),
    }));
  }, [allOrders, metric]);

  const donutSlices = useMemo(
    () =>
      ORDER_STATUSES.map((status) => ({
        status,
        value: allOrders.filter((order) => order.status === status).length,
      }))
        .filter((entry) => entry.value > 0)
        .map((entry) => ({
          label: ORDER_STATUS_LABELS[entry.status],
          value: entry.value,
          color: STATUS_COLORS[entry.status],
        })),
    [allOrders],
  );

  const selectedOrders = allOrders.filter((order) => selected.has(order.id));
  const allSelectedCancellable =
    selectedOrders.length > 0 &&
    selectedOrders.every((order) =>
      CANCELLABLE_STATUSES.includes(order.status),
    );

  function toggleSelected(id: string, checked: boolean): void {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleColumn(key: string): void {
    setHiddenColumns((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSort(key: 'date' | 'total'): void {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  async function bulkCancel(): Promise<void> {
    const targets = selectedOrders.filter((order) =>
      CANCELLABLE_STATUSES.includes(order.status),
    );
    if (targets.length === 0) return;
    const confirmed = window.confirm(
      `Cancel ${targets.length} selected order${targets.length === 1 ? '' : 's'}? This follows the same status flow as the order detail page.`,
    );
    if (!confirmed) return;
    setBulkBusy(true);
    setBulkError(null);
    setBulkNote(null);
    const failures: string[] = [];
    for (const order of targets) {
      try {
        await api.transitionOrderStatus(order.orderNumber, {
          status: 'cancelled',
          note: 'Bulk cancel from the orders list',
        });
      } catch (caught) {
        const uiError = toUiError(caught);
        if (uiError.kind === 'unauthorized') {
          expireSession();
          return;
        }
        failures.push(`${order.orderNumber}: ${uiError.message}`);
      }
    }
    setBulkBusy(false);
    if (failures.length > 0) {
      setBulkError(failures.join('; '));
    } else {
      setBulkNote(
        `Cancelled ${targets.length} order${targets.length === 1 ? '' : 's'}.`,
      );
      setSelected(new Set());
    }
    orders.reload();
  }

  function exportRows(rows: Order[], filename: string): void {
    downloadCsv(filename, toCsv(CSV_HEADERS, csvRows(rows)));
  }

  const showPayment = !hiddenColumns.has('payment');
  const showShipping = !hiddenColumns.has('shipping');
  const showDate = !hiddenColumns.has('date');

  return (
    <section>
      <ModuleHeader
        icon={ClipboardList}
        title="Orders"
        description="Every order placed through the storefront and staff checkout, with live status, payment and fulfilment from the API."
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => exportRows(filtered, 'orders-filtered.csv')}
          disabled={filtered.length === 0}
        >
          <Download size={15} /> Export
        </button>
        {canCreate ? (
          <button
            type="button"
            className="btn"
            onClick={() => setDrawerOpen(true)}
          >
            <Plus size={15} /> Create Order
          </button>
        ) : null}
      </ModuleHeader>

      {orders.loading ? <LoadingNote label="Loading orders..." /> : null}
      {orders.error ? (
        <ErrorNote error={orders.error} onRetry={orders.reload} />
      ) : null}

      {orders.data ? (
        <>
          <div className="kpi-grid">
            <KpiCard
              icon={ShoppingBag}
              label="Total Orders"
              value={counts.total.toLocaleString('en-US')}
              note="All orders loaded from the API"
              tone="purple"
            />
            <KpiCard
              icon={CheckCircle2}
              label="Completed Orders"
              value={counts.delivered.toLocaleString('en-US')}
              note="Orders in the delivered status"
              tone="green"
            />
            <KpiCard
              icon={Truck}
              label="In Transit"
              value={counts.inTransit.toLocaleString('en-US')}
              note="Shipped plus out for delivery"
              tone="blue"
            />
            <KpiCard
              icon={RotateCcw}
              label="Returns and Refunds"
              value={counts.returned.toLocaleString('en-US')}
              note={
                payments.data
                  ? `${counts.returned} returned order${counts.returned === 1 ? '' : 's'}, ${refundedPayments} refunded payment${refundedPayments === 1 ? '' : 's'}`
                  : 'Returned orders (payment refunds unavailable to this role)'
              }
              tone="orange"
            />
            <KpiCard
              icon={Package}
              label="Processing"
              value={counts.processing.toLocaleString('en-US')}
              note="Orders being prepared"
              tone="blue"
            />
            <KpiCard
              icon={XCircle}
              label="Cancelled"
              value={counts.cancelled.toLocaleString('en-US')}
              note="Orders in the cancelled status"
              tone="purple"
            />
          </div>

          <div className="dash-row section-gap">
            <div className="card">
              <CardHead icon={ClipboardList} title="Order Trend">
                <div
                  className="toggle-pills"
                  role="tablist"
                  aria-label="Trend metric"
                >
                  {TREND_METRICS.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={metric === key}
                      className={metric === key ? 'active' : ''}
                      onClick={() => setMetric(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </CardHead>
              {trend.length === 0 ? (
                <EmptyNote>No orders yet, so there is no trend to draw.</EmptyNote>
              ) : (
                <AreaChart
                  points={trend}
                  formatValue={(value) =>
                    metric === 'orders'
                      ? `${value} orders`
                      : formatMoney({
                          amountMinor: Math.round(value * 100),
                          currency: 'BDT',
                        })
                  }
                />
              )}
              <p className="note muted">
                Last 30 days by order date, bucketed per day from the
                loaded orders.
              </p>
            </div>
            <div className="card">
              <CardHead icon={Package} title="Order Status" />
              {donutSlices.length === 0 ? (
                <EmptyNote>No orders yet.</EmptyNote>
              ) : (
                <DonutChart
                  slices={donutSlices}
                  centreValue={counts.total.toLocaleString('en-US')}
                  centreLabel="Orders"
                />
              )}
            </div>
          </div>

          <div className="card filter-card section-gap">
            <div className="filter-row">
              <label className="field">
                Search
                <span style={{ position: 'relative', display: 'block' }}>
                  <Search
                    size={14}
                    style={{
                      position: 'absolute',
                      left: 9,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--muted)',
                    }}
                  />
                  <input
                    className="input"
                    style={{ paddingLeft: 28 }}
                    value={draft.search}
                    onChange={(event) =>
                      setDraft({ ...draft, search: event.target.value })
                    }
                    placeholder="Order ID, customer, phone, product"
                  />
                </span>
              </label>
              <label className="field">
                Status
                <select
                  className="select"
                  value={draft.status}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      status: event.target.value as OrderStatus | '',
                    })
                  }
                >
                  <option value="">All statuses</option>
                  {ORDER_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {ORDER_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Payment
                <select
                  className="select"
                  value={draft.payment}
                  onChange={(event) =>
                    setDraft({ ...draft, payment: event.target.value })
                  }
                >
                  <option value="">All payment states</option>
                  {paymentOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              {shipments.data ? (
                <label className="field">
                  Shipping
                  <select
                    className="select"
                    value={draft.shipping}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        shipping: event.target.value as Filters['shipping'],
                      })
                    }
                  >
                    <option value="">All orders</option>
                    <option value="with">Has a shipment</option>
                    <option value="without">No shipment yet</option>
                  </select>
                </label>
              ) : null}
              <label className="field">
                From
                <input
                  className="input"
                  type="date"
                  value={draft.from}
                  onChange={(event) =>
                    setDraft({ ...draft, from: event.target.value })
                  }
                />
              </label>
              <label className="field">
                To
                <input
                  className="input"
                  type="date"
                  value={draft.to}
                  onChange={(event) =>
                    setDraft({ ...draft, to: event.target.value })
                  }
                />
              </label>
              <div className="filter-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setDraft(EMPTY_FILTERS);
                    setApplied(EMPTY_FILTERS);
                    setPage(1);
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setApplied(draft);
                    setPage(1);
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>

          {selectedOrders.length > 0 ? (
            <div className="card section-gap" role="region" aria-label="Bulk actions">
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <strong>
                  {selectedOrders.length} order
                  {selectedOrders.length === 1 ? '' : 's'} selected
                </strong>
                {canEdit ? (
                  <button
                    type="button"
                    className="btn btn-danger btn-small"
                    disabled={!allSelectedCancellable || bulkBusy}
                    onClick={() => void bulkCancel()}
                  >
                    {bulkBusy ? 'Cancelling...' : 'Cancel selected'}
                  </button>
                ) : null}
                {!allSelectedCancellable ? (
                  <span className="muted">
                    Bulk cancel is only offered when every selected order
                    is still before shipping, the only transition they all
                    share.
                  </span>
                ) : null}
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() =>
                    exportRows(selectedOrders, 'orders-selected.csv')
                  }
                >
                  Export selected
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => setSelected(new Set())}
                >
                  Clear selection
                </button>
              </div>
              {bulkError ? (
                <p className="form-error" role="alert">
                  {bulkError}
                </p>
              ) : null}
              {bulkNote ? <p className="note">{bulkNote}</p> : null}
            </div>
          ) : null}

          <div className="card section-gap">
            <CardHead icon={ClipboardList} title="Orders">
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                {(
                  [
                    ['payment', 'Payment'],
                    ['shipping', 'Shipping'],
                    ['date', 'Date'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className="btn btn-secondary btn-small"
                    aria-pressed={!hiddenColumns.has(key)}
                    onClick={() => toggleColumn(key)}
                  >
                    {hiddenColumns.has(key) ? `Show ${label}` : `Hide ${label}`}
                  </button>
                ))}
                <div className="toggle-pills" role="tablist" aria-label="View">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'list'}
                    className={view === 'list' ? 'active' : ''}
                    onClick={() => setView('list')}
                  >
                    <List size={14} /> List
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === 'grid'}
                    className={view === 'grid' ? 'active' : ''}
                    onClick={() => setView('grid')}
                  >
                    <LayoutGrid size={14} /> Grid
                  </button>
                </div>
              </div>
            </CardHead>

            {filtered.length === 0 ? (
              <EmptyNote>
                No orders match the current filters. Reset the filters to
                see the full list.
              </EmptyNote>
            ) : view === 'list' ? (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            aria-label="Select all orders on this page"
                            checked={
                              pageRows.length > 0 &&
                              pageRows.every((order) => selected.has(order.id))
                            }
                            onChange={(event) =>
                              setSelected((current) => {
                                const next = new Set(current);
                                for (const order of pageRows) {
                                  if (event.target.checked) next.add(order.id);
                                  else next.delete(order.id);
                                }
                                return next;
                              })
                            }
                          />
                        </th>
                        <th>Order ID</th>
                        <th>Customer</th>
                        <th className="num">Items</th>
                        <th className="num">
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => toggleSort('total')}
                          >
                            Total{' '}
                            {sortKey === 'total'
                              ? sortDir === 'asc'
                                ? '↑'
                                : '↓'
                              : ''}
                          </button>
                        </th>
                        {showPayment ? <th>Payment</th> : null}
                        {showShipping ? <th>Shipping</th> : null}
                        <th>Status</th>
                        {showDate ? (
                          <th>
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() => toggleSort('date')}
                            >
                              Order Date{' '}
                              {sortKey === 'date'
                                ? sortDir === 'asc'
                                  ? '↑'
                                  : '↓'
                                : ''}
                            </button>
                          </th>
                        ) : null}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((order) => {
                        const payment = (payments.data?.items ?? []).find(
                          (entry) => entry.orderId === order.id,
                        );
                        return (
                          <tr key={order.id}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Select order ${order.orderNumber}`}
                                checked={selected.has(order.id)}
                                onChange={(event) =>
                                  toggleSelected(order.id, event.target.checked)
                                }
                              />
                            </td>
                            <td>
                              <Link href={`/orders/${order.orderNumber}`}>
                                {order.orderNumber}
                              </Link>
                            </td>
                            <td>
                              <span className="identity-cell">
                                <span className="avatar-initials">
                                  {order.address.fullName
                                    .split(/\s+/)
                                    .map((part) => part[0] ?? '')
                                    .slice(0, 2)
                                    .join('')
                                    .toUpperCase()}
                                </span>
                                <span>
                                  <span className="identity-main">
                                    {order.address.fullName}
                                  </span>
                                  <span className="identity-sub">
                                    {order.address.phone}
                                    {isGuest(order) ? ' · Guest' : ''}
                                  </span>
                                </span>
                              </span>
                            </td>
                            <td className="num">{itemCount(order)}</td>
                            <td className="num">{formatMoney(order.total)}</td>
                            {showPayment ? (
                              <td>
                                <span className="badge">
                                  {order.paymentStatus}
                                </span>
                                {payment ? (
                                  <div className="muted" style={{ fontSize: 12 }}>
                                    {PAYMENT_GATEWAY_LABELS[payment.gateway]}
                                  </div>
                                ) : null}
                              </td>
                            ) : null}
                            {showShipping ? (
                              <td>{shippingText(order)}</td>
                            ) : null}
                            <td>
                              <span className="badge">
                                {ORDER_STATUS_LABELS[order.status]}
                              </span>
                            </td>
                            {showDate ? (
                              <td>{formatDateTime(order.createdAt)}</td>
                            ) : null}
                            <td>
                              <Link
                                className="btn btn-secondary btn-small"
                                href={`/orders/${order.orderNumber}`}
                              >
                                View
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="table-foot">
                  <span className="muted">
                    {filtered.length} order{filtered.length === 1 ? '' : 's'}{' '}
                    match the filters
                  </span>
                  <Pagination
                    page={page}
                    pageCount={pageCount}
                    onChange={setPage}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid-cards">
                  {pageRows.map((order) => (
                    <div className="order-card" key={order.id}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 8,
                          alignItems: 'center',
                        }}
                      >
                        <label
                          style={{
                            display: 'inline-flex',
                            gap: 7,
                            alignItems: 'center',
                          }}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select order ${order.orderNumber}`}
                            checked={selected.has(order.id)}
                            onChange={(event) =>
                              toggleSelected(order.id, event.target.checked)
                            }
                          />
                          <Link href={`/orders/${order.orderNumber}`}>
                            <strong>{order.orderNumber}</strong>
                          </Link>
                        </label>
                        <span className="badge">
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                      </div>
                      <p className="note" style={{ margin: '10px 0 4px' }}>
                        {order.address.fullName}
                        {isGuest(order) ? ' (Guest)' : ''} ·{' '}
                        {order.address.phone}
                      </p>
                      <p className="muted" style={{ margin: '2px 0' }}>
                        {itemCount(order)} item{itemCount(order) === 1 ? '' : 's'} ·{' '}
                        {shippingText(order)} · Payment {order.paymentStatus}
                      </p>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 10,
                        }}
                      >
                        <strong>{formatMoney(order.total)}</strong>
                        <span className="muted" style={{ fontSize: 12.5 }}>
                          {formatDateTime(order.createdAt)}
                        </span>
                      </div>
                      <Link
                        className="btn btn-secondary btn-small"
                        href={`/orders/${order.orderNumber}`}
                        style={{ marginTop: 10 }}
                      >
                        View order
                      </Link>
                    </div>
                  ))}
                </div>
                <div className="table-foot">
                  <span className="muted">
                    {filtered.length} order{filtered.length === 1 ? '' : 's'}{' '}
                    match the filters
                  </span>
                  <Pagination
                    page={page}
                    pageCount={pageCount}
                    onChange={setPage}
                  />
                </div>
              </>
            )}
          </div>
        </>
      ) : null}

      {drawerOpen ? (
        <CreateOrderDrawer
          onClose={() => setDrawerOpen(false)}
          onCreated={orders.reload}
        />
      ) : null}
    </section>
  );
}
