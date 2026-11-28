import type { AdminLoginResult, AuthTokens, Money, Rec } from './types';
import { getAccessToken } from './session';

/* The portal API client, fresh rebuild 2026-11-28.
   REST paths and payload shapes follow the contracts documented in
   API.md, docs/BACKEND_AND_DATABASE.md and the previous build in
   git history. The base URL comes from NEXT_PUBLIC_API_URL and
   defaults to the API local development address.
   Methods named after the previous typed client are grouped by
   module. The `gap` group calls the additive endpoints the owner
   ordered on 2026-11-28 (warehouses, loyalty catalogue, marketing
   tracking, workflow builder, restore, saved reports, settlements
   and similar). A gap call that the running API does not answer
   resolves to null so the page can show an honest unavailable
   state; it never fabricates a record. */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`Dostelo API request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = getAccessToken();
  if (token) headers['authorization'] = `Bearer ${token}`;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const parsed: unknown = text ? safeJson(text) : null;
  if (!response.ok) throw new ApiError(response.status, parsed);
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

/** Raw call for gap endpoints: null on 404 or 501, throws otherwise. */
async function gap<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  try {
    return await request<T>(method, path, body);
  } catch (caught) {
    if (caught instanceof ApiError && (caught.status === 404 || caught.status === 501)) {
      return null;
    }
    throw caught;
  }
}

/** Multipart upload for product and evidence images. Returns the
 * stored file descriptor the API answers with, or null when the
 * upload endpoint is not present on the running API. */
export async function uploadFile(file: File): Promise<Rec | null> {
  const token = getAccessToken();
  const form = new FormData();
  form.append('file', file);
  try {
    const response = await fetch(`${API_BASE_URL}/v1/admin/uploads`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (response.status === 404 || response.status === 501) return null;
    const parsed: unknown = safeJson(await response.text());
    if (!response.ok) throw new ApiError(response.status, parsed);
    return (parsed ?? {}) as Rec;
  } catch (caught) {
    if (caught instanceof ApiError) throw caught;
    return null;
  }
}

export const api = {
  // Auth
  loginAdmin: (dto: Rec) => request<AdminLoginResult>('POST', '/v1/auth/admin/login', dto),
  exchangeAdminMfa: (dto: Rec) => request<AuthTokens>('POST', '/v1/auth/admin/mfa/exchange', dto),
  refreshTokens: (refreshToken: string) => request<AuthTokens>('POST', '/v1/auth/refresh', { refreshToken }),
  logout: (refreshToken: string) => request<Rec>('POST', '/v1/auth/logout', { refreshToken }),
  enrollAdminMfa: () => request<Rec>('POST', '/v1/auth/admin/mfa/enroll', {}),
  enableAdminMfa: (dto: Rec) => request<Rec>('POST', '/v1/auth/admin/mfa/enable', dto),
  disableAdminMfa: (dto: Rec) => request<Rec>('POST', '/v1/auth/admin/mfa/disable', dto),
  acceptStaffInvite: (dto: Rec) => request<Rec>('POST', '/v1/auth/admin/accept-invite', dto),
  listOwnSessions: () => request<Rec>('GET', '/v1/auth/admin/sessions'),
  revokeOwnSessionFamily: (familyId: string) => request<Rec>('POST', '/v1/auth/admin/sessions/revoke', { familyId }),
  revokeOtherSessionFamilies: () => request<Rec>('POST', '/v1/auth/admin/sessions/revoke-others', {}),
  getSecuritySettings: () => request<Rec>('GET', '/v1/admin/security/settings'),
  listAuditLog: (query: Rec = {}) => request<Rec>('GET', `/v1/admin/audit-log${qs(query as Record<string, string>)}`),

  // Dashboard and reports
  getPaymentsSummary: () => request<Rec>('GET', '/v1/payments/summary'),
  getReportsSummary: (query: Rec = {}) => request<Rec>('GET', `/v1/admin/reports/summary${qs(query as Record<string, string>)}`),

  // Buyer intelligence, CRM, leads
  listBuyerSessions: (filter: Rec = {}) => request<Rec>('GET', `/v1/admin/buyer-intelligence/sessions${qs(filter as Record<string, string>)}`),
  getBuyerSession: (sessionId: string) => request<Rec>('GET', `/v1/admin/buyer-intelligence/sessions/${encodeURIComponent(sessionId)}`),
  listCustomers: (query: Rec = {}) => request<Rec>('GET', `/v1/customers${qs(query as Record<string, string>)}`),
  getCustomerTimeline: (id: string) => request<Rec>('GET', `/v1/crm/customers/${encodeURIComponent(id)}/timeline`),
  addCustomerNote: (id: string, dto: Rec) => request<Rec>('POST', `/v1/crm/customers/${encodeURIComponent(id)}/notes`, dto),
  addCustomerTag: (id: string, dto: Rec) => request<Rec>('POST', `/v1/crm/customers/${encodeURIComponent(id)}/tags`, dto),
  removeCustomerTag: (id: string, tag: string) => request<Rec>('DELETE', `/v1/crm/customers/${encodeURIComponent(id)}/tags/${encodeURIComponent(tag)}`),
  listLeads: (filter: Rec = {}) => request<Rec>('GET', `/v1/leads${qs(filter as Record<string, string>)}`),
  getLead: (id: string) => request<Rec>('GET', `/v1/leads/${encodeURIComponent(id)}`),
  createLead: (dto: Rec) => request<Rec>('POST', '/v1/leads', dto),
  assignLead: (id: string, dto: Rec) => request<Rec>('POST', `/v1/leads/${encodeURIComponent(id)}/assign`, dto),
  changeLeadStatus: (id: string, dto: Rec) => request<Rec>('POST', `/v1/leads/${encodeURIComponent(id)}/status`, dto),
  createFollowUpTask: (id: string, dto: Rec) => request<Rec>('POST', `/v1/leads/${encodeURIComponent(id)}/follow-ups`, dto),
  completeFollowUpTask: (id: string, taskId: string) => request<Rec>('POST', `/v1/leads/${encodeURIComponent(id)}/follow-ups/${encodeURIComponent(taskId)}/complete`, {}),
  recordContactAttempt: (id: string, dto: Rec) => request<Rec>('POST', `/v1/leads/${encodeURIComponent(id)}/contact-attempts`, dto),
  optOutLead: (id: string) => request<Rec>('POST', `/v1/leads/${encodeURIComponent(id)}/opt-out`, {}),

  // Cart recovery and communications
  listAbandonedCarts: (filter: Rec = {}) => request<Rec>('GET', `/v1/cart-recovery${qs(filter as Record<string, string>)}`),
  getAbandonedCart: (id: string) => request<Rec>('GET', `/v1/cart-recovery/${encodeURIComponent(id)}`),
  runRecoveryScan: () => request<Rec>('POST', '/v1/cart-recovery/scan', {}),
  getRecoverySettings: () => request<Rec>('GET', '/v1/cart-recovery/settings'),
  updateRecoverySettings: (dto: Rec) => request<Rec>('PUT', '/v1/cart-recovery/settings', dto),
  cancelRecovery: (id: string) => request<Rec>('POST', `/v1/cart-recovery/${encodeURIComponent(id)}/cancel`, {}),
  runRecoveryStep: (id: string) => request<Rec>('POST', `/v1/cart-recovery/${encodeURIComponent(id)}/run-step`, {}),
  listCommunicationLog: (filter: Rec = {}) => request<Rec>('GET', `/v1/communications/log${qs(filter as Record<string, string>)}`),
  logManualCall: (dto: Rec) => request<Rec>('POST', '/v1/communications/calls', dto),
  sendMessage: (dto: Rec) => request<Rec>('POST', '/v1/communications/send', dto),
  listMessageTemplates: () => request<Rec>('GET', '/v1/communications/templates'),
  upsertMessageTemplate: (key: string, dto: Rec) => request<Rec>('PUT', `/v1/communications/templates/${encodeURIComponent(key)}`, dto),
  deleteMessageTemplate: (key: string) => request<Rec>('DELETE', `/v1/communications/templates/${encodeURIComponent(key)}`),

  // Orders and products
  listStaffOrders: (status?: string) => request<Rec>('GET', `/v1/admin/orders${qs({ status })}`),
  getStaffOrder: (orderNumber: string) => request<Rec>('GET', `/v1/admin/orders/${encodeURIComponent(orderNumber)}`),
  transitionOrderStatus: (orderNumber: string, dto: Rec) => request<Rec>('POST', `/v1/orders/${encodeURIComponent(orderNumber)}/status`, dto),
  createStaffOrder: (dto: Rec) => request<Rec>('POST', '/v1/admin/orders', dto),
  listAdminProducts: () => request<Rec>('GET', '/v1/admin/products'),
  listProducts: (category?: string) => request<Rec>('GET', `/v1/catalog/products${qs({ category })}`),
  listCategories: () => request<Rec>('GET', '/v1/catalog/categories'),
  createProduct: (dto: Rec) => request<Rec>('POST', '/v1/admin/products', dto),
  updateProduct: (id: string, dto: Rec) => request<Rec>('PUT', `/v1/admin/products/${encodeURIComponent(id)}`, dto),
  deleteProduct: (id: string) => request<Rec>('DELETE', `/v1/admin/products/${encodeURIComponent(id)}`),

  // Inventory
  listInventory: (productId?: string) => request<Rec>('GET', `/v1/inventory${qs({ productId })}`),
  listStockMovements: (filter: Rec = {}) => request<Rec>('GET', `/v1/inventory/movements${qs(filter as Record<string, string>)}`),
  adjustStock: (variantId: string, dto: Rec) => request<Rec>('POST', `/v1/inventory/${encodeURIComponent(variantId)}/adjust`, dto),

  // Payments
  listPayments: (filter: Rec = {}) => request<Rec>('GET', `/v1/payments${qs(filter as Record<string, string>)}`),
  getPayment: (paymentId: string) => request<Rec>('GET', `/v1/payments/${encodeURIComponent(paymentId)}`),
  verifyPayment: (paymentId: string, dto: Rec) => request<Rec>('POST', `/v1/payments/${encodeURIComponent(paymentId)}/verify`, dto),
  confirmPayment: (paymentId: string, dto: Rec = {}) => request<Rec>('POST', `/v1/payments/${encodeURIComponent(paymentId)}/confirm`, dto),
  requestRefund: (paymentId: string, dto: Rec) => request<Rec>('POST', `/v1/payments/${encodeURIComponent(paymentId)}/refunds`, dto),
  confirmRefund: (paymentId: string, refundId: string, dto: Rec = {}) => request<Rec>('POST', `/v1/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}/confirm`, dto),

  // Shipping and returns
  listShipments: (filter: Rec = {}) => request<Rec>('GET', `/v1/shipping${qs(filter as Record<string, string>)}`),
  getShipment: (id: string) => request<Rec>('GET', `/v1/shipping/${encodeURIComponent(id)}`),
  createShipment: (dto: Rec) => request<Rec>('POST', '/v1/shipping', dto),
  refreshShipment: (id: string) => request<Rec>('POST', `/v1/shipping/${encodeURIComponent(id)}/refresh`, {}),
  listReturns: (filter: Rec = {}) => request<Rec>('GET', `/v1/admin/returns${qs(filter as Record<string, string>)}`),
  getReturnDetail: (id: string) => request<Rec>('GET', `/v1/admin/returns/${encodeURIComponent(id)}/detail`),
  createReturn: (dto: Rec) => request<Rec>('POST', '/v1/admin/returns', dto),
  returnAction: (id: string, action: string, dto: Rec = {}) => request<Rec>('POST', `/v1/admin/returns/${encodeURIComponent(id)}/${action}`, dto),

  // Marketing, reviews, loyalty
  listCampaigns: (filter: Rec = {}) => request<Rec>('GET', `/v1/admin/campaigns${qs(filter as Record<string, string>)}`),
  getCampaign: (id: string) => request<Rec>('GET', `/v1/admin/campaigns/${encodeURIComponent(id)}`),
  createCampaign: (dto: Rec) => request<Rec>('POST', '/v1/admin/campaigns', dto),
  updateCampaign: (id: string, dto: Rec) => request<Rec>('PATCH', `/v1/admin/campaigns/${encodeURIComponent(id)}`, dto),
  sendCampaign: (id: string) => request<Rec>('POST', `/v1/admin/campaigns/${encodeURIComponent(id)}/send`, {}),
  getCampaignStats: (id: string) => request<Rec>('GET', `/v1/admin/campaigns/${encodeURIComponent(id)}/stats`),
  listCampaignSegments: () => request<Rec>('GET', '/v1/admin/campaigns/segments'),
  listReviews: (filter: Rec = {}) => request<Rec>('GET', `/v1/admin/reviews${qs(filter as Record<string, string>)}`),
  setReviewStatus: (id: string, dto: Rec) => request<Rec>('POST', `/v1/admin/reviews/${encodeURIComponent(id)}/status`, dto),
  addReviewReply: (id: string, dto: Rec) => request<Rec>('POST', `/v1/admin/reviews/${encodeURIComponent(id)}/replies`, dto),
  deleteReviewReply: (id: string, replyId: string) => request<Rec>('DELETE', `/v1/admin/reviews/${encodeURIComponent(id)}/replies/${encodeURIComponent(replyId)}`),
  requestReview: (dto: Rec) => request<Rec>('POST', '/v1/admin/reviews/requests', dto),
  getLoyaltyRules: () => request<Rec>('GET', '/v1/admin/loyalty/rules'),
  updateLoyaltyRules: (dto: Rec) => request<Rec>('PUT', '/v1/admin/loyalty/rules', dto),
  listPointRules: () => request<Rec>('GET', '/v1/admin/loyalty/point-rules'),
  upsertPointRule: (dto: Rec) => request<Rec>('POST', '/v1/admin/loyalty/point-rules', dto),
  listLoyaltyBalances: () => request<Rec>('GET', '/v1/admin/loyalty/customers'),
  listAllLoyaltyTransactions: () => request<Rec>('GET', '/v1/admin/loyalty/transactions'),
  adjustLoyalty: (customerId: string, dto: Rec) => request<Rec>('POST', `/v1/admin/loyalty/customers/${encodeURIComponent(customerId)}/adjust`, dto),

  // Support, automation, notifications
  listSupportTickets: (filter: Rec = {}) => request<Rec>('GET', `/v1/admin/support-tickets${qs(filter as Record<string, string>)}`),
  getSupportTicket: (id: string) => request<Rec>('GET', `/v1/admin/support-tickets/${encodeURIComponent(id)}`),
  createSupportTicket: (dto: Rec) => request<Rec>('POST', '/v1/admin/support-tickets', dto),
  replySupportTicket: (id: string, dto: Rec) => request<Rec>('POST', `/v1/admin/support-tickets/${encodeURIComponent(id)}/reply`, dto),
  setSupportTicketStatus: (id: string, dto: Rec) => request<Rec>('POST', `/v1/admin/support-tickets/${encodeURIComponent(id)}/status`, dto),
  assignSupportTicket: (id: string, dto: Rec) => request<Rec>('POST', `/v1/admin/support-tickets/${encodeURIComponent(id)}/assign`, dto),
  listAutomations: () => request<Rec>('GET', '/v1/admin/automation'),
  listAutomationExecutions: (filter: Rec = {}) => request<Rec>('GET', `/v1/admin/automation/executions${qs(filter as Record<string, string>)}`),
  setAutomationEnabled: (key: string, enabled: boolean) => request<Rec>('POST', `/v1/admin/automation/${encodeURIComponent(key)}/${enabled ? 'activate' : 'pause'}`, {}),
  getNotificationFeed: () => request<Rec>('GET', '/v1/admin/notifications'),
  markNotificationsRead: (dto: Rec) => request<Rec>('POST', '/v1/admin/notifications/read', dto),
  markNotificationsUnread: (dto: Rec) => request<Rec>('POST', '/v1/admin/notifications/unread', dto),
  hideNotifications: (dto: Rec) => request<Rec>('POST', '/v1/admin/notifications/hide', dto),
  getNotificationPreferences: () => request<Rec>('GET', '/v1/admin/notifications/preferences'),
  updateNotificationPreferences: (dto: Rec) => request<Rec>('PUT', '/v1/admin/notifications/preferences', dto),

  // Staff, website, legal, integrations, backup
  listStaff: () => request<Rec>('GET', '/v1/admin/staff'),
  createStaff: (dto: Rec) => request<Rec>('POST', '/v1/admin/staff', dto),
  inviteStaff: (dto: Rec) => request<Rec>('POST', '/v1/admin/staff/invite', dto),
  updateStaffProfile: (id: string, dto: Rec) => request<Rec>('PATCH', `/v1/admin/staff/${encodeURIComponent(id)}`, dto),
  setStaffRoles: (id: string, dto: Rec) => request<Rec>('POST', `/v1/admin/staff/${encodeURIComponent(id)}/roles`, dto),
  deactivateStaff: (id: string) => request<Rec>('POST', `/v1/admin/staff/${encodeURIComponent(id)}/deactivate`, {}),
  activateStaff: (id: string) => request<Rec>('POST', `/v1/admin/staff/${encodeURIComponent(id)}/activate`, {}),
  revokeStaffSessions: (id: string) => request<Rec>('POST', `/v1/admin/staff/${encodeURIComponent(id)}/revoke-sessions`, {}),
  getStoreSettings: () => request<Rec>('GET', '/v1/admin/store-settings'),
  updateStoreSettings: (dto: Rec) => request<Rec>('PUT', '/v1/admin/store-settings', dto),
  listLegalDocuments: () => request<Rec>('GET', '/v1/admin/legal'),
  getLegalDocument: (slug: string) => request<Rec>('GET', `/v1/admin/legal/${encodeURIComponent(slug)}`),
  createLegalDocument: (dto: Rec) => request<Rec>('POST', '/v1/admin/legal', dto),
  updateLegalDocument: (slug: string, dto: Rec) => request<Rec>('PUT', `/v1/admin/legal/${encodeURIComponent(slug)}`, dto),
  publishLegalDocument: (slug: string) => request<Rec>('POST', `/v1/admin/legal/${encodeURIComponent(slug)}/publish`, {}),
  unpublishLegalDocument: (slug: string) => request<Rec>('POST', `/v1/admin/legal/${encodeURIComponent(slug)}/unpublish`, {}),
  listLegalVersions: (slug: string) => request<Rec>('GET', `/v1/admin/legal/${encodeURIComponent(slug)}/versions`),
  restoreLegalVersion: (slug: string, versionId: string) => request<Rec>('POST', `/v1/admin/legal/${encodeURIComponent(slug)}/versions/${encodeURIComponent(versionId)}/restore`, {}),
  getLegalSyncStatus: () => request<Rec>('GET', '/v1/admin/legal/sync-status'),
  listIntegrations: () => request<Rec>('GET', '/v1/admin/integrations'),
  testIntegration: (key: string) => request<Rec>('POST', `/v1/admin/integrations/${encodeURIComponent(key)}/test`, {}),
  listBackups: () => request<Rec>('GET', '/v1/admin/backups'),
  createExport: (collections?: string[]) => request<Rec>('POST', '/v1/admin/backups', collections ? { collections } : {}),
  getBackupSummary: () => request<Rec>('GET', '/v1/admin/backups/summary'),
  listStoredBackups: () => request<Rec>('GET', '/v1/admin/backups/stored'),
  createStoredBackup: () => request<Rec>('POST', '/v1/admin/backups/stored', {}),
  deleteStoredBackup: (id: string) => request<Rec>('DELETE', `/v1/admin/backups/stored/${encodeURIComponent(id)}`),
  downloadStoredBackup: (id: string) => request<Rec>('GET', `/v1/admin/backups/stored/${encodeURIComponent(id)}/download`),
  runMaintenance: (action: string) => request<Rec>('POST', `/v1/admin/backups/maintenance/${encodeURIComponent(action)}`, {}),

  /* Gap endpoints ordered 2026-11-28. Each resolves to null when
     the running API does not provide it yet. */
  gap: {
    listWarehouses: () => gap<Rec>('GET', '/v1/admin/warehouses'),
    createWarehouse: (dto: Rec) => gap<Rec>('POST', '/v1/admin/warehouses', dto),
    getWarehouseStock: (id: string) => gap<Rec>('GET', `/v1/admin/warehouses/${encodeURIComponent(id)}/stock`),
    listTransfers: () => gap<Rec>('GET', '/v1/admin/inventory/transfers'),
    createTransfer: (dto: Rec) => gap<Rec>('POST', '/v1/admin/inventory/transfers', dto),
    listRewards: () => gap<Rec>('GET', '/v1/admin/loyalty/rewards'),
    saveReward: (dto: Rec) => gap<Rec>('POST', '/v1/admin/loyalty/rewards', dto),
    listRedemptions: () => gap<Rec>('GET', '/v1/admin/loyalty/redemptions'),
    listTiers: () => gap<Rec>('GET', '/v1/admin/loyalty/tiers'),
    saveTier: (dto: Rec) => gap<Rec>('POST', '/v1/admin/loyalty/tiers', dto),
    listReferrals: () => gap<Rec>('GET', '/v1/admin/loyalty/referrals'),
    getCampaignTracking: (id: string) => gap<Rec>('GET', `/v1/admin/campaigns/${encodeURIComponent(id)}/tracking`),
    getCampaignAttribution: (id: string) => gap<Rec>('GET', `/v1/admin/campaigns/${encodeURIComponent(id)}/attribution`),
    listWorkflows: () => gap<Rec>('GET', '/v1/admin/automation/workflows'),
    saveWorkflow: (dto: Rec) => gap<Rec>('POST', '/v1/admin/automation/workflows', dto),
    updateWorkflow: (id: string, dto: Rec) => gap<Rec>('PUT', `/v1/admin/automation/workflows/${encodeURIComponent(id)}`, dto),
    retryExecution: (id: string) => gap<Rec>('POST', `/v1/admin/automation/executions/${encodeURIComponent(id)}/retry`, {}),
    listTicketAttachments: (id: string) => gap<Rec>('GET', `/v1/admin/support-tickets/${encodeURIComponent(id)}/attachments`),
    verifyBackup: (id: string) => gap<Rec>('POST', `/v1/admin/backups/stored/${encodeURIComponent(id)}/verify`, {}),
    requestRestore: (dto: Rec) => gap<Rec>('POST', '/v1/admin/backups/restore', dto),
    listRestoreJobs: () => gap<Rec>('GET', '/v1/admin/backups/restore-jobs'),
    listSavedReports: () => gap<Rec>('GET', '/v1/admin/reports/saved'),
    saveReport: (dto: Rec) => gap<Rec>('POST', '/v1/admin/reports/saved', dto),
    runSavedReport: (id: string) => gap<Rec>('POST', `/v1/admin/reports/saved/${encodeURIComponent(id)}/run`, {}),
    getProfitReport: (query: Rec = {}) => gap<Rec>('GET', `/v1/admin/reports/profit${qs(query as Record<string, string>)}`),
    listSettlements: () => gap<Rec>('GET', '/v1/payments/settlements'),
    listGatewayFees: () => gap<Rec>('GET', '/v1/payments/fees'),
    bookShipment: (id: string) => gap<Rec>('POST', `/v1/shipping/${encodeURIComponent(id)}/book`, {}),
    listShipmentExceptions: () => gap<Rec>('GET', '/v1/shipping/exceptions'),
    listCodSettlements: () => gap<Rec>('GET', '/v1/shipping/cod-settlements'),
    listReturnEvidence: (id: string) => gap<Rec>('GET', `/v1/admin/returns/${encodeURIComponent(id)}/evidence`),
    addReturnEvidence: (id: string, dto: Rec) => gap<Rec>('POST', `/v1/admin/returns/${encodeURIComponent(id)}/evidence`, dto),
    createExchange: (id: string, dto: Rec) => gap<Rec>('POST', `/v1/admin/returns/${encodeURIComponent(id)}/exchange`, dto),
    getIntegrationConfig: (key: string) => gap<Rec>('GET', `/v1/admin/integrations/${encodeURIComponent(key)}/config`),
    listReviewRequests: () => gap<Rec>('GET', '/v1/admin/reviews/requests'),
  },
};

export type Api = typeof api;

export type UiErrorKind = 'unauthorized' | 'forbidden' | 'unreachable' | 'api';
export interface UiError {
  kind: UiErrorKind;
  message: string;
  status?: number;
}

function bodyMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const message = (body as { message?: string | string[] }).message;
  if (Array.isArray(message)) return message.join('; ');
  return typeof message === 'string' ? message : null;
}

export function toUiError(caught: unknown): UiError {
  if (caught instanceof ApiError) {
    if (caught.status === 401) {
      return { kind: 'unauthorized', status: 401, message: 'Your session has expired. Please sign in again.' };
    }
    if (caught.status === 403) {
      return { kind: 'forbidden', status: 403, message: bodyMessage(caught.body) ?? 'Your role does not have permission for this. Contact attempts to a Do Not Contact record are refused by the API for the same reason.' };
    }
    return { kind: 'api', status: caught.status, message: bodyMessage(caught.body) ?? `The API answered with status ${caught.status}.` };
  }
  return { kind: 'unreachable', message: `Cannot reach the API at ${API_BASE_URL}. Is it running?` };
}

export function formatMoney(money: Money): string {
  const taka = money.amountMinor / 100;
  return `BDT ${taka.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatMinor(amountMinor: number): string {
  return formatMoney({ amountMinor, currency: 'BDT' });
}

/** Money fields arrive either as a Money object or as a minor-unit
 * number with a sibling field. Both render through this helper. */
export function moneyOf(value: unknown): string {
  if (typeof value === 'number') return formatMinor(value);
  if (value && typeof value === 'object' && 'amountMinor' in value) {
    return formatMoney(value as Money);
  }
  return '';
}

export function formatDateTime(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
