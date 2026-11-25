/**
 * Legal and compliance documents (admin master structure module
 * 24: Legal & Compliance). The documents are stored as editable
 * settings documents. The migrated storefront's policy views
 * still render their ported legacy text, so a stored document is
 * the prepared source of truth, not yet what the storefront
 * serves; the admin page states that plainly.
 */
export const LEGAL_DOCUMENT_SLUGS = [
  'privacy',
  'terms',
  'returns',
  'refund',
  'shipping',
  'warranty',
] as const;
export type LegalDocumentSlug = (typeof LEGAL_DOCUMENT_SLUGS)[number];

export const LEGAL_DOCUMENT_LABELS: Record<LegalDocumentSlug, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms & Conditions',
  returns: 'Return Policy',
  refund: 'Refund Policy',
  shipping: 'Shipping Policy',
  warranty: 'Warranty Policy',
};

export const LEGAL_DOCUMENT_DESCRIPTIONS: Record<string, string> = {
  privacy: 'How we collect, use and protect customer data.',
  terms: 'Terms of use for your store and services.',
  returns: 'Our return and exchange policy for orders.',
  refund: 'Refund eligibility and processing details.',
  shipping: 'Shipping methods, time and charges.',
  warranty: 'Product warranty coverage and conditions.',
};

/**
 * A legal document. title and body are the DRAFT working copy;
 * publishedTitle and publishedBody are what the public endpoint
 * serves. Saving edits the draft only; publishing copies the
 * draft into the published fields and stores a version.
 */
export interface LegalDocument {
  slug: string;
  title: string;
  body: string;
  description: string;
  /** False for the six built-ins; true for staff-added documents. */
  isCustom: boolean;
  /** False until staff save content for the document. */
  stored: boolean;
  status: 'not-saved' | 'draft' | 'published';
  publishedTitle: string | null;
  publishedBody: string | null;
  publishedAt: string | null;
  publishedById: string | null;
  unpublishedAt: string | null;
  updatedById: string | null;
  updatedAt: string | null;
}

/** One stored publish: an immutable snapshot in the history. */
export interface LegalDocumentVersion {
  id: string;
  slug: string;
  version: number;
  title: string;
  body: string;
  publishedById: string | null;
  publishedAt: string;
}

/** What the public endpoint serves for one published document. */
export interface PublicLegalDocument {
  slug: string;
  title: string;
  body: string;
  publishedAt: string;
}

/**
 * Storefront link state for the admin panel. The public endpoint
 * serves published documents directly from this store, so there
 * is no separate sync step and no sync error channel; the last
 * synchronization time is the last publish or unpublish event.
 */
export interface LegalSyncStatus {
  publishedCount: number;
  totalDocuments: number;
  lastSyncAt: string | null;
  errors: string[];
}
