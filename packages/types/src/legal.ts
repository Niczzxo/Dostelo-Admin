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

export interface LegalDocument {
  slug: LegalDocumentSlug;
  title: string;
  body: string;
  /** False until staff save content for the document. */
  stored: boolean;
  updatedById: string | null;
  updatedAt: string | null;
}
