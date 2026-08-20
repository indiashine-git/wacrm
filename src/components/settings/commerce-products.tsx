'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { uploadAccountMedia, MEDIA_MAX_BYTES_BY_KIND } from '@/lib/storage/upload-media';

interface Product {
  id: string;
  retailer_id?: string;
  name: string;
  description?: string;
  // Meta returns this pre-formatted on read (e.g. "₹6.00"), not a raw
  // number -- parse it back to a plain decimal only when prefilling
  // the edit form's numeric input.
  price?: string;
  currency?: string;
  image_url?: string;
  additional_image_urls?: string[];
  availability?: string;
}

function parsePriceToDecimal(price: string | undefined): string {
  if (!price) return '';
  const numeric = price.replace(/[^0-9.]/g, '');
  return numeric;
}

interface DraftProduct {
  retailerId: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  imageUrl: string;
  additionalImageUrls: string[];
}

function emptyDraft(): DraftProduct {
  return {
    retailerId: '',
    name: '',
    description: '',
    price: '',
    currency: 'INR',
    imageUrl: '',
    additionalImageUrls: [],
  };
}

/** Add/edit/delete items in the connected Meta catalog, without ever leaving WATU. */
export function CommerceProducts({ catalogId }: { catalogId: string }) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftProduct>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [uploadingMain, setUploadingMain] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const mainFileInputRef = useRef<HTMLInputElement>(null);
  const additionalFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTargetIndex, setUploadTargetIndex] = useState<number | null>(null);

  async function uploadPhoto(file: File): Promise<string> {
    if (file.size > MEDIA_MAX_BYTES_BY_KIND.image) {
      throw new Error('Photo is too large -- keep it under 5 MB.');
    }
    const { publicUrl } = await uploadAccountMedia('chat-media', file);
    return publicUrl;
  }

  async function handleMainFileSelected(file: File) {
    setUploadingMain(true);
    try {
      const url = await uploadPhoto(file);
      setDraft((d) => ({ ...d, imageUrl: url }));
      toast.success('Photo uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploadingMain(false);
    }
  }

  async function handleAdditionalFileSelected(index: number, file: File) {
    setUploadingIndex(index);
    try {
      const url = await uploadPhoto(file);
      setDraft((d) => ({
        ...d,
        additionalImageUrls: d.additionalImageUrls.map((u, idx) => (idx === index ? url : u)),
      }));
      toast.success('Photo uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploadingIndex(null);
    }
  }

  async function fetchProducts() {
    try {
      setLoading(true);
      const res = await fetch('/api/commerce/products');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed (HTTP ${res.status})`);
      setProducts(data.products ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProducts();
  }, [catalogId]);

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setFormOpen(true);
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setDraft({
      retailerId: product.retailer_id ?? '',
      name: product.name,
      description: product.description ?? '',
      price: parsePriceToDecimal(product.price),
      currency: product.currency ?? 'INR',
      imageUrl: product.image_url ?? '',
      additionalImageUrls: product.additional_image_urls ?? [],
    });
    setFormOpen(true);
  }

  async function handleSave() {
    const priceMinorUnits = Math.round(parseFloat(draft.price || '0') * 100);
    if (!draft.name.trim() || !priceMinorUnits || !draft.currency.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/commerce/products/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name.trim(),
            description: draft.description.trim() || undefined,
            priceMinorUnits,
            currency: draft.currency.trim(),
            imageUrl: draft.imageUrl.trim() || undefined,
            additionalImageUrls: draft.additionalImageUrls.filter(Boolean),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to update product');
        toast.success('Product updated');
      } else {
        if (!draft.retailerId.trim() || !draft.imageUrl.trim()) {
          toast.error('Retailer ID and image URL are required for a new product');
          setSaving(false);
          return;
        }
        const res = await fetch('/api/commerce/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            retailerId: draft.retailerId.trim(),
            name: draft.name.trim(),
            description: draft.description.trim() || undefined,
            priceMinorUnits,
            currency: draft.currency.trim(),
            imageUrl: draft.imageUrl.trim(),
            additionalImageUrls: draft.additionalImageUrls.filter(Boolean),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to create product');
        toast.success('Product added');
      }
      setFormOpen(false);
      await fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product: Product) {
    if (!window.confirm(`Delete "${product.name}"? This can't be undone.`)) return;
    try {
      const res = await fetch(`/api/commerce/products/${product.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to delete product');
      toast.success('Product deleted');
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete product');
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm">Products</CardTitle>
          <CardDescription>
            Add, edit, and remove items in this catalog directly -- no Meta Commerce Manager trip needed.
          </CardDescription>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          Add product
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : formOpen ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-foreground">
                {editingId ? 'Edit product' : 'New product'}
              </p>
              <button type="button" onClick={() => setFormOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {!editingId && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Product code (a short unique ID for this item)</Label>
                <Input
                  value={draft.retailerId}
                  onChange={(e) => setDraft((d) => ({ ...d, retailerId: e.target.value }))}
                  placeholder="e.g. watu-plan-basic"
                  className="bg-background border-border text-foreground"
                />
                <p className="text-[11px] text-muted-foreground">
                  Just a short name only you use to tell this product apart from others -- customers never see it.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="bg-background border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Description</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                rows={2}
                className="bg-background border-border text-foreground resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Price</Label>
                <Input
                  value={draft.price}
                  onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
                  placeholder="e.g. 499.00"
                  inputMode="decimal"
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Currency</Label>
                <Input
                  value={draft.currency}
                  onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value.toUpperCase() }))}
                  placeholder="INR"
                  className="bg-background border-border text-foreground"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Main photo</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={draft.imageUrl}
                  onChange={(e) => setDraft((d) => ({ ...d, imageUrl: e.target.value }))}
                  placeholder="https://... or upload a file"
                  className="bg-background border-border text-foreground"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={uploadingMain}
                  onClick={() => mainFileInputRef.current?.click()}
                  className="shrink-0"
                >
                  {uploadingMain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Upload
                </Button>
              </div>
              <input
                ref={mainFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) handleMainFileSelected(file);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">More photos (optional)</Label>
              {draft.additionalImageUrls.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={url}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        additionalImageUrls: d.additionalImageUrls.map((u, idx) => (idx === i ? e.target.value : u)),
                      }))
                    }
                    placeholder="https://... or upload a file"
                    className="bg-background border-border text-foreground"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploadingIndex === i}
                    onClick={() => {
                      setUploadTargetIndex(i);
                      additionalFileInputRef.current?.click();
                    }}
                    className="shrink-0"
                  >
                    {uploadingIndex === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  </Button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        additionalImageUrls: d.additionalImageUrls.filter((_, idx) => idx !== i),
                      }))
                    }
                    className="shrink-0 text-muted-foreground hover:text-red-500"
                    aria-label="Remove photo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <input
                ref={additionalFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file && uploadTargetIndex !== null) handleAdditionalFileSelected(uploadTargetIndex, file);
                }}
              />
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, additionalImageUrls: [...d.additionalImageUrls, ''] }))}
                className="text-xs font-medium text-primary hover:underline"
              >
                + Add another photo
              </button>
            </div>
            <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? 'Save changes' : 'Add product'}
            </Button>
          </div>
        ) : products.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No products yet. Add one to start sending a real catalog.
          </p>
        ) : (
          <ul className="space-y-2">
            {products.map((product) => (
              <li
                key={product.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-background p-2"
              >
                {product.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image_url} alt={product.name} className="h-10 w-10 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{product.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {product.price ?? '-'}
                    {product.availability ? ` · ${product.availability}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(product)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Edit product"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(product)}
                  className="shrink-0 text-muted-foreground hover:text-red-500"
                  aria-label="Delete product"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
