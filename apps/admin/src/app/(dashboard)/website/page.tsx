'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Globe } from 'lucide-react';
import {
  ActionError, Card, ErrorNote, Field, LoadingNote, ModuleHeader, TextArea, TextInput,
} from '../../../components/ui';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, num, str } from '../../../lib/types';

/* Website Management: the store settings from
   GET /v1/admin/store-settings, saved with PUT. These are the
   values checkout actually charges: the delivery fee table, the
   free delivery offer switch, and the manual payment instructions
   customers see. Saving sends the full stored object with only the
   edited fields changed, so no stored setting is silently dropped. */
export default function WebsitePage() {
  const settings = useData((c) => c.getStoreSettings());
  const action = useAction();
  const rec = asRec(settings.data);
  const fees = asRec(rec.deliveryFees ?? rec.deliveryFeeTable);
  const [form, setForm] = useState({
    storeName: '', contactEmail: '', contactPhone: '',
    insideDhaka: '', outsideDhaka: '', freeDelivery: false, manualPayment: '',
  });

  useEffect(() => {
    if (settings.data) {
      setForm({
        storeName: str(rec.storeName ?? rec.name),
        contactEmail: str(rec.contactEmail ?? rec.email),
        contactPhone: str(rec.contactPhone ?? rec.phone),
        insideDhaka: String(num(fees.insideDhaka ?? fees.dhaka) / 100 || ''),
        outsideDhaka: String(num(fees.outsideDhaka ?? fees.outside) / 100 || ''),
        freeDelivery: rec.freeDelivery === true || rec.freeDeliveryEnabled === true,
        manualPayment: str(rec.manualPaymentInstructions ?? rec.manualPayment),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = {
      ...rec,
      storeName: form.storeName,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      deliveryFees: {
        ...fees,
        insideDhaka: Math.round(Number(form.insideDhaka || 0) * 100),
        outsideDhaka: Math.round(Number(form.outsideDhaka || 0) * 100),
      },
      freeDelivery: form.freeDelivery,
      manualPaymentInstructions: form.manualPayment,
    };
    if (await action.run((c) => c.updateStoreSettings(dto))) settings.reload();
  }

  return (
    <>
      <ModuleHeader
        icon={Globe}
        title="Website Management"
        description="Store settings that checkout charges and customers see. Changes save to the API and take effect on the storefront from its next read."
      />
      <ActionError error={action.error} />
      <Card title="Store settings">
        {settings.loading ? (
          <LoadingNote />
        ) : settings.error ? (
          <ErrorNote error={settings.error} onRetry={settings.reload} />
        ) : (
          <form onSubmit={save}>
            <div className="form-grid">
              <Field label="Store name">
                <TextInput required value={form.storeName} onChange={(e) => setForm({ ...form, storeName: e.target.value })} />
              </Field>
              <Field label="Contact email">
                <TextInput type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
              </Field>
              <Field label="Contact phone">
                <TextInput value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
              </Field>
            </div>
            <div className="form-grid">
              <Field label="Delivery fee inside Dhaka (BDT)">
                <TextInput type="number" min={0} step="0.01" value={form.insideDhaka} onChange={(e) => setForm({ ...form, insideDhaka: e.target.value })} />
              </Field>
              <Field label="Delivery fee outside Dhaka (BDT)">
                <TextInput type="number" min={0} step="0.01" value={form.outsideDhaka} onChange={(e) => setForm({ ...form, outsideDhaka: e.target.value })} />
              </Field>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.freeDelivery}
                onChange={(e) => setForm({ ...form, freeDelivery: e.target.checked })}
              />
              Free delivery offer on (first order per account, as the storefront states)
            </label>
            <Field label="Manual payment instructions">
              <TextArea value={form.manualPayment} onChange={(e) => setForm({ ...form, manualPayment: e.target.value })} />
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>Save settings</button>
          </form>
        )}
      </Card>
      <Card title="What this does not change">
        <p className="note">
          The public storefront theme, typography, layout, product cards and animations are not
          managed from this portal and are never touched by saving settings here. Legal page text
          is managed under Legal & Compliance.
        </p>
      </Card>
    </>
  );
}
