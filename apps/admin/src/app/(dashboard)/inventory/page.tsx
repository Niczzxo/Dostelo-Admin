'use client';

import { useState, type FormEvent } from 'react';
import { Plus, Warehouse } from 'lucide-react';
import {
  ActionError, Card, DataTable, ErrorNote, Field, LoadingNote, Modal,
  ModuleHeader, StatCard, StatGrid, TextInput, Unavailable,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { itemsOf, num, str } from '../../../lib/types';

/* Inventory & Warehouse: variant stock from GET /v1/inventory,
   the complete movement history from GET /v1/inventory/movements,
   audited adjustments, and full warehouse management: warehouses,
   per-warehouse stock and transfers from the additive warehouse
   endpoints. When the running API does not provide the warehouse
   endpoints yet, those panels say so plainly instead of showing
   invented warehouses. */
export default function InventoryPage() {
  const stock = useData((c) => c.listInventory());
  const movements = useData((c) => c.listStockMovements({}));
  const warehouses = useData((c) => c.gap.listWarehouses());
  const transfers = useData((c) => c.gap.listTransfers());
  const action = useAction();
  const [adjusting, setAdjusting] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [showWarehouse, setShowWarehouse] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState({ name: '', location: '' });
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState({ fromWarehouseId: '', toWarehouseId: '', variantId: '', quantity: '' });
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const warehouseStock = useData(
    (c) => (selectedWarehouse ? c.gap.getWarehouseStock(selectedWarehouse) : Promise.resolve(null)),
    [selectedWarehouse],
  );

  const stockItems = itemsOf(stock.data);
  const movementItems = itemsOf(movements.data);
  const warehouseItems = warehouses.data ? itemsOf(warehouses.data) : [];
  const transferItems = transfers.data ? itemsOf(transfers.data) : [];
  const low = stockItems.filter((r) => num(r.available) > 0 && num(r.available) <= 5);
  const out = stockItems.filter((r) => num(r.available) <= 0);

  async function adjust(event: FormEvent) {
    event.preventDefault();
    const ok = await action.run((c) =>
      c.adjustStock(adjusting, { deltaOnHand: Number(delta), reason }),
    );
    if (ok) {
      setAdjusting('');
      stock.reload();
      movements.reload();
    }
  }

  async function createWarehouse(event: FormEvent) {
    event.preventDefault();
    if (await action.run((c) => c.gap.createWarehouse(warehouseForm))) {
      setShowWarehouse(false);
      warehouses.reload();
    }
  }

  async function createTransfer(event: FormEvent) {
    event.preventDefault();
    const dto = { ...transferForm, quantity: Number(transferForm.quantity) };
    if (await action.run((c) => c.gap.createTransfer(dto))) {
      setShowTransfer(false);
      transfers.reload();
      stock.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={Warehouse}
        title="Inventory & Warehouse"
        description="Stock per variant and per warehouse, transfers between warehouses, audited adjustments and the complete movement history."
      >
        <button type="button" className="btn secondary" onClick={() => setShowWarehouse(true)}>New warehouse</button>
        <button type="button" className="btn" onClick={() => setShowTransfer(true)}>New transfer</button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <StatGrid>
        <StatCard label="Variants tracked" value={stock.loading ? '...' : String(stockItems.length)} />
        <StatCard label="Units available" value={String(stockItems.reduce((s, r) => s + num(r.available), 0))} />
        <StatCard label="Low stock" value={String(low.length)} note="Five or fewer available" />
        <StatCard label="Out of stock" value={String(out.length)} />
        <StatCard label="Movements recorded" value={movements.loading ? '...' : String(movementItems.length)} />
      </StatGrid>

      <Card title="Warehouses">
        {warehouses.loading ? (
          <LoadingNote />
        ) : warehouses.error ? (
          <ErrorNote error={warehouses.error} onRetry={warehouses.reload} />
        ) : warehouses.data === null ? (
          <Unavailable title="Warehouse endpoints are not available on the running API yet.">
            This panel needs GET and POST /v1/admin/warehouses. Until the API provides them, stock
            is managed per variant below and no warehouse is invented here.
          </Unavailable>
        ) : (
          <>
            <DataTable
              emptyText="No warehouses created yet."
              columns={[
                { key: 'name', label: 'Warehouse' },
                { key: 'location', label: 'Location' },
                { key: 'variantCount', label: 'Variants' },
                { key: 'unitsOnHand', label: 'Units on hand' },
                {
                  key: 'view', label: 'Action',
                  render: (r) => (
                    <button type="button" className="btn secondary small" onClick={() => setSelectedWarehouse(str(r.id))}>
                      View stock
                    </button>
                  ),
                },
              ]}
              rows={warehouseItems}
            />
            {selectedWarehouse ? (
              <div style={{ marginTop: 14 }}>
                <h3>Stock in the selected warehouse</h3>
                {warehouseStock.loading ? (
                  <LoadingNote />
                ) : warehouseStock.data === null ? (
                  <Unavailable title="Per-warehouse stock is not available on the running API yet.">
                    This view needs GET /v1/admin/warehouses/:id/stock.
                  </Unavailable>
                ) : (
                  <DataTable
                    searchable={false}
                    emptyText="No stock recorded in this warehouse."
                    columns={[
                      { key: 'variantId', label: 'Variant' },
                      { key: 'productId', label: 'Product' },
                      { key: 'onHand', label: 'On hand' },
                      { key: 'reserved', label: 'Reserved' },
                      { key: 'available', label: 'Available' },
                    ]}
                    rows={itemsOf(warehouseStock.data)}
                  />
                )}
              </div>
            ) : null}
          </>
        )}
      </Card>

      <Card title="Stock transfers">
        {transfers.loading ? (
          <LoadingNote />
        ) : transfers.data === null ? (
          <Unavailable title="Transfer endpoints are not available on the running API yet.">
            This panel needs GET and POST /v1/admin/inventory/transfers. Transfer creation stays
            disabled rather than pretending a transfer happened.
          </Unavailable>
        ) : (
          <DataTable
            emptyText="No transfers recorded yet."
            columns={[
              { key: 'id', label: 'Transfer' },
              { key: 'fromWarehouseId', label: 'From' },
              { key: 'toWarehouseId', label: 'To' },
              { key: 'variantId', label: 'Variant' },
              { key: 'quantity', label: 'Qty' },
              { key: 'status', label: 'Status' },
              { key: 'createdAt', label: 'Created', date: true },
            ]}
            rows={transferItems}
          />
        )}
      </Card>

      <Card title="Variant stock">
        {stock.loading ? (
          <LoadingNote />
        ) : stock.error ? (
          <ErrorNote error={stock.error} onRetry={stock.reload} />
        ) : (
          <DataTable
            emptyText="No stock records yet."
            columns={[
              { key: 'variantId', label: 'Variant' },
              { key: 'productId', label: 'Product' },
              { key: 'onHand', label: 'On hand' },
              { key: 'reserved', label: 'Reserved' },
              { key: 'available', label: 'Available' },
              {
                key: 'adjust', label: 'Action',
                render: (r) => (
                  <button type="button" className="btn secondary small" onClick={() => setAdjusting(str(r.variantId))}>
                    Adjust
                  </button>
                ),
              },
            ]}
            rows={stockItems}
          />
        )}
      </Card>

      <Card title="Stock movement history">
        {movements.loading ? (
          <LoadingNote />
        ) : movements.error ? (
          <ErrorNote error={movements.error} onRetry={movements.reload} />
        ) : (
          <DataTable
            emptyText="No stock movements recorded yet. Adjustments, reservations, releases and order finalisation appear here."
            columns={[
              { key: 'createdAt', label: 'When', date: true },
              { key: 'type', label: 'Type' },
              { key: 'variantId', label: 'Variant' },
              { key: 'deltaOnHand', label: 'On hand change' },
              { key: 'deltaReserved', label: 'Reserved change' },
              { key: 'onHandAfter', label: 'On hand after' },
              { key: 'reference', label: 'Reference' },
            ]}
            rows={movementItems}
          />
        )}
      </Card>

      {adjusting ? (
        <Modal title="Adjust stock" onClose={() => setAdjusting('')}>
          <form onSubmit={adjust}>
            <ActionError error={action.error} />
            <p className="note">
              Adjustments are audited. Enter the change in on-hand units (negative to remove stock)
              and the reason; the API records the movement.
            </p>
            <Field label="Change in on-hand units">
              <TextInput type="number" required value={delta} onChange={(e) => setDelta(e.target.value)} />
            </Field>
            <Field label="Reason">
              <TextInput required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Stock count correction, damaged item removed" />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Apply adjustment</button>
          </form>
        </Modal>
      ) : null}

      {showWarehouse ? (
        <Modal title="New warehouse" onClose={() => setShowWarehouse(false)}>
          <form onSubmit={createWarehouse}>
            <ActionError error={action.error} />
            <Field label="Name">
              <TextInput required value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} placeholder="Dhaka central warehouse" />
            </Field>
            <Field label="Location">
              <TextInput value={warehouseForm.location} onChange={(e) => setWarehouseForm({ ...warehouseForm, location: e.target.value })} />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Create warehouse</button>
          </form>
        </Modal>
      ) : null}

      {showTransfer ? (
        <Modal title="New stock transfer" onClose={() => setShowTransfer(false)}>
          <form onSubmit={createTransfer}>
            <ActionError error={action.error} />
            <div className="form-grid">
              <Field label="From warehouse ID">
                <TextInput required value={transferForm.fromWarehouseId} onChange={(e) => setTransferForm({ ...transferForm, fromWarehouseId: e.target.value })} />
              </Field>
              <Field label="To warehouse ID">
                <TextInput required value={transferForm.toWarehouseId} onChange={(e) => setTransferForm({ ...transferForm, toWarehouseId: e.target.value })} />
              </Field>
              <Field label="Variant ID">
                <TextInput required value={transferForm.variantId} onChange={(e) => setTransferForm({ ...transferForm, variantId: e.target.value })} />
              </Field>
              <Field label="Quantity">
                <TextInput type="number" min={1} required value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} />
              </Field>
            </div>
            <button type="submit" className="btn" disabled={action.busy}>
              <Plus size={14} /> Create transfer
            </button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
