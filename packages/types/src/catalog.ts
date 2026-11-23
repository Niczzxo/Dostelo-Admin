import type { Money } from './money';

export type ProductStatus = 'draft' | 'active' | 'archived';
export type MediaType = 'image' | 'video';

/** A variant at or below this many available units counts as low
 * stock across the admin portal (inventory views, dashboard and
 * staff notifications all use the one threshold). */
export const LOW_STOCK_THRESHOLD = 5;

export interface Category {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductMedia {
  id: string;
  productId: string;
  type: MediaType;
  url: string;
  alt: string;
  position: number;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  size: string | null;
  colour: string | null;
  price: Money;
  compareAtPrice: Money | null;
  stock: number;
  isActive: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  description: string | null;
  status: ProductStatus;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  tags: string[];
  variants: ProductVariant[];
  media: ProductMedia[];
  createdAt: string;
  updatedAt: string;
}
