'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import {
  ActionError, Badge, Card, DataTable, ErrorNote, Field, LoadingNote, Modal,
  ModuleHeader, TextArea, TextInput,
} from '../../../components/ui';
import { formatMinor, uploadFile } from '../../../lib/api';
import { useAction, useData } from '../../../lib/use-data';
import { asRec, itemsOf, num, str } from '../../../lib/types';

interface ImageEntry {
  url: string;
  name: string;
}

/* Products: the admin catalogue from GET /v1/admin/products, with
   create and edit through the admin catalog endpoints.
   Images: the primary flow is a real upload (drag or pick, with
   preview and ordering). Files go to POST /v1/admin/uploads; when
   that endpoint is not present on the running API the form says so
   and the image URL field remains as the secondary option, exactly
   as the owner ordered. Cost price is a first-class field: it is
   stored on the product and feeds profit reporting. */
export default function ProductsPage() {
  const products = useData((c) => c.listAdminProducts());
  const categories = useData((c) => c.listCategories());
  const action = useAction();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: '', slug: '', category: '', price: '', costPrice: '', compareAt: '', description: '',
  });
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [uploadNote, setUploadNote] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const items = itemsOf(products.data);
  const categoryItems = itemsOf(categories.data);
  const open = creating || editing !== null;

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setForm({ title: '', slug: '', category: '', price: '', costPrice: '', compareAt: '', description: '' });
    setImages([]);
    setUploadNote('');
  }

  function openEdit(row: Record<string, unknown>) {
    setCreating(false);
    setEditing(row);
    setForm({
      title: str(row.title ?? row.name),
      slug: str(row.slug),
      category: str(row.category ?? asRec(row.category).slug),
      price: String(num(asRec(row.price).amountMinor ?? row.priceMinor) / 100 || ''),
      costPrice: String(num(asRec(row.costPrice).amountMinor ?? row.costPriceMinor ?? row.costMinor) / 100 || ''),
      compareAt: String(num(asRec(row.compareAtPrice).amountMinor ?? row.compareAtMinor) / 100 || ''),
      description: str(row.description),
    });
    const existing = Array.isArray(row.images) ? row.images : [];
    setImages(
      existing.map((img) => {
        const rec = asRec(img);
        return { url: str(rec.url ?? img), name: str(rec.alt ?? rec.name ?? 'Product image') };
      }).filter((img) => img.url),
    );
    setUploadNote('');
  }

  async function handleFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const localUrl = URL.createObjectURL(file);
      try {
        const stored = await uploadFile(file);
        if (stored && str(stored.url)) {
          setImages((prev) => [...prev, { url: str(stored.url), name: file.name }]);
          setUploadNote('Upload confirmed by the API and added to the image list.');
        } else {
          setImages((prev) => [...prev, { url: localUrl, name: file.name }]);
          setUploadNote(
            'The upload endpoint is not available on the running API yet, so this image is only previewed locally and will not be saved. Use the image URL field below, or enable POST /v1/admin/uploads.',
          );
        }
      } catch {
        setImages((prev) => [...prev, { url: localUrl, name: file.name }]);
        setUploadNote('The upload failed. The image is previewed locally only; use the image URL field to save an image.');
      }
    }
  }

  function moveImage(index: number, delta: number) {
    setImages((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const dto: Record<string, unknown> = {
      title: form.title,
      description: form.description,
      priceMinor: Math.round(Number(form.price || 0) * 100),
      images: images.map((img) => ({ url: img.url })),
    };
    if (form.slug) dto.slug = form.slug;
    if (form.category) dto.category = form.category;
    if (form.costPrice) dto.costPriceMinor = Math.round(Number(form.costPrice) * 100);
    if (form.compareAt) dto.compareAtMinor = Math.round(Number(form.compareAt) * 100);
    const ok = editing
      ? await action.run((c) => c.updateProduct(str(editing.id), dto))
      : await action.run((c) => c.createProduct(dto));
    if (ok) {
      setCreating(false);
      setEditing(null);
      products.reload();
    }
  }

  return (
    <>
      <ModuleHeader
        icon={ShoppingBag}
        title="Products"
        description="Catalogue with variants and live stock. The product form takes real image uploads with preview and ordering, an image URL as the secondary option, and a cost price that feeds profit reporting."
      >
        <button type="button" className="btn" onClick={openCreate}>
          <Plus size={15} /> New product
        </button>
      </ModuleHeader>
      <ActionError error={action.error} />
      <Card title="Catalogue">
        {products.loading ? (
          <LoadingNote />
        ) : products.error ? (
          <ErrorNote error={products.error} onRetry={products.reload} />
        ) : (
          <DataTable
            emptyText="No products yet. Create the first product to start the catalogue."
            columns={[
              { key: 'title', label: 'Product', render: (r) => str(r.title ?? r.name) },
              { key: 'category', label: 'Category', render: (r) => str(asRec(r.category).name ?? r.category) },
              { key: 'price', label: 'Price', render: (r) => formatMinor(num(asRec(r.price).amountMinor ?? r.priceMinor)) },
              { key: 'cost', label: 'Cost', render: (r) => {
                  const cost = num(asRec(r.costPrice).amountMinor ?? r.costPriceMinor ?? r.costMinor);
                  return cost > 0 ? formatMinor(cost) : 'Not set';
                } },
              { key: 'variants', label: 'Variants', render: (r) => String(Array.isArray(r.variants) ? r.variants.length : 0) },
              { key: 'status', label: 'Status', render: (r) => <Badge>{str(r.status ?? (r.active === false ? 'inactive' : 'active'))}</Badge> },
              {
                key: 'edit', label: 'Action',
                render: (r) => (
                  <span className="btn-row">
                    <button type="button" className="btn secondary small" onClick={() => openEdit(r)}>Edit</button>
                    <button
                      type="button"
                      className="btn secondary small"
                      onClick={async () => {
                        if (await action.run((c) => c.deleteProduct(str(r.id)))) products.reload();
                      }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </span>
                ),
              },
            ]}
            rows={items}
          />
        )}
      </Card>

      {open ? (
        <Modal title={editing ? 'Edit product' : 'New product'} onClose={() => { setCreating(false); setEditing(null); }} wide>
          <form onSubmit={submit}>
            <ActionError error={action.error} />
            <div className="form-grid">
              <Field label="Title">
                <TextInput required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </Field>
              <Field label="Slug">
                <TextInput value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="boys-graphic-tee" />
              </Field>
              <Field label="Category">
                <TextInput
                  list="product-categories"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder={categoryItems.length ? 'Pick or type a category' : 'Category slug'}
                />
                <datalist id="product-categories">
                  {categoryItems.map((cat) => (
                    <option key={str(cat.slug ?? cat.id)} value={str(cat.slug ?? cat.name)}>{str(cat.name)}</option>
                  ))}
                </datalist>
              </Field>
              <Field label="Selling price (BDT)">
                <TextInput type="number" min={0} step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
              <Field label="Cost price (BDT)" hint="(feeds profit reporting; products without it are flagged in Reports)">
                <TextInput type="number" min={0} step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
              </Field>
              <Field label="Compare-at price (BDT, optional)">
                <TextInput type="number" min={0} step="0.01" value={form.compareAt} onChange={(e) => setForm({ ...form, compareAt: e.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>

            <Field label="Product images" hint="(drag files here or pick them; the first image is the cover)">
              <div
                className={dragging ? 'dropzone dragging' : 'dropzone'}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files); }}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <ImagePlus size={22} />
                <span>Drop image files here, or click to pick them</span>
                <span className="note">Uploads go to the API media endpoint and are confirmed before they count as saved.</span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); }}
              />
            </Field>
            {uploadNote ? <p className="note" role="status">{uploadNote}</p> : null}
            {images.length > 0 ? (
              <div>
                {images.map((img, index) => (
                  <div key={`${img.url}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="thumb" src={img.url} alt={img.name} />
                    <span style={{ flex: 1, overflowWrap: 'anywhere', fontSize: 12.5 }}>{img.name} {index === 0 ? '(cover)' : ''}</span>
                    <button type="button" className="icon-btn" aria-label="Move image up" onClick={() => moveImage(index, -1)}><ArrowUp size={14} /></button>
                    <button type="button" className="icon-btn" aria-label="Move image down" onClick={() => moveImage(index, 1)}><ArrowDown size={14} /></button>
                    <button type="button" className="icon-btn" aria-label="Remove image" onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            ) : null}
            <Field label="Image URL (secondary option)">
              <span style={{ display: 'flex', gap: 8 }}>
                <TextInput value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => {
                    if (!imageUrl.trim()) return;
                    setImages((prev) => [...prev, { url: imageUrl.trim(), name: imageUrl.trim() }]);
                    setImageUrl('');
                  }}
                >
                  Add URL
                </button>
              </span>
            </Field>
            <button type="submit" className="btn" disabled={action.busy}>
              {editing ? 'Save product' : 'Create product'}
            </button>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
