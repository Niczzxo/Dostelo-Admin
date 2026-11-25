import type {
  AbandonedCart,
  AbandonedCartStatus,
  AdminLoginResult,
  AuditLogEntry,
  AuthTokens,
  AutomationInfo,
  CampaignStatus,
  CampaignView,
  CartView,
  Category,
  CheckoutQuote,
  CommunicationChannel,
  CommunicationLog,
  CommunicationLogStatus,
  ConsentRecord,
  Courier,
  Customer,
  CustomerNote,
  DataExportRecord,
  BackupSummary,
  DataExportResult,
  FollowUpTask,
  IdentityStatus,
  IntegrationStatus,
  IntegrationTestResult,
  Lead,
  LeadContactAttempt,
  LeadStatus,
  LegalDocument,
  LegalDocumentVersion,
  LegalSyncStatus,
  MaintenanceResult,
  PublicLegalDocument,
  StoredBackup,
  LoyaltyBalance,
  LoyaltyRules,
  LoyaltyTransaction,
  AutomationExecution,
  CampaignSegment,
  CampaignStats,
  MessageTemplate,
  NotificationPreference,
  PointsRule,
  ReturnEvent,
  Order,
  OrderStatus,
  Payment,
  PaymentEvent,
  Product,
  ProductReview,
  RecoveryAttempt,
  RecoveryCartView,
  RecoverySettings,
  Refund,
  ReportsSummary,
  ReturnRequest,
  ReturnStatus,
  ReviewStatus,
  Shipment,
  ShipmentDetail,
  ShipmentStatus,
  StaffMemberView,
  StaffNotification,
  StoreSettingsView,
  SupportTicket,
  SupportTicketDetail,
  SupportTicketStatus,
  VisitorEventType,
} from '@dostelo/types';
import type {
  AdminLogin,
  CartCreate,
  CartLineCreate,
  CartLineUpdate,
  CheckoutRequest,
  ConsentRecordInput,
  ContactAttemptCreate,
  CreateCampaign,
  CreateReturn,
  CreateReview,
  CreateShipment,
  CreateStaff,
  CreateSupportTicket,
  CustomerLogin,
  CustomerNoteCreate,
  CustomerRegistration,
  CustomerTagInput,
  FollowUpTaskCreate,
  InventoryAdjust,
  LeadAssign,
  LeadCreate,
  LeadStatusChange,
  LegalDocumentUpdate,
  LoyaltyAdjust,
  LoyaltyRulesUpdate,
  ManualCallLog,
  MessageTemplateUpsert,
  MfaExchange,
  NotificationMarkRead,
  NotificationPreferencesUpdate,
  AcceptInvite,
  InviteStaff,
  PointsRuleUpsert,
  ProductCreate,
  ProductUpdate,
  ReturnAssign,
  ReturnInspectionInput,
  ReturnNote,
  ReturnPickup,
  ReviewReplyCreate,
  ReviewRequestCreate,
  StaffProfileUpdate,
  StaffSend,
  OrderStatusTransition,
  PaymentVerify,
  RecoverySettingsUpdate,
  RefundConfirm,
  RefundRequest,
  ReviewStatusUpdate,
  StaffRolesUpdate,
  StoreSettingsUpdate,
  SupportTicketAssign,
  SupportTicketReply,
  SupportTicketStatusUpdate,
  TotpCode,
  UpdateCampaign,
  VisitorEventIngest,
  VisitorLinkInput,
} from '@dostelo/validation';

/** Category as returned by GET /v1/catalog/categories. */
export interface CategorySummary extends Category {
  productCount: number;
}

/** Stock level as returned by the inventory endpoints. */
export interface StockView {
  variantId: string;
  productId: string;
  onHand: number;
  reserved: number;
  available: number;
}

/** One recorded order status change, as returned inside the
 * staff order detail. Mirrors the API's OrderStatusEventRecord. */
export interface OrderStatusEventView {
  id: string;
  orderId: string;
  status: OrderStatus;
  note: string | null;
  actorId: string | null;
  createdAt: string;
}

/** Staff order detail from GET /v1/admin/orders/:orderNumber:
 * the order, its status history, and the legal next states from
 * the API's flow policy. */
export interface OrderDetailView {
  order: Order;
  events: OrderStatusEventView[];
  allowedTransitions: OrderStatus[];
}

/** Payment detail from GET /v1/payments/:paymentId. */
export interface PaymentDetailView {
  payment: Payment;
  events: PaymentEvent[];
  refunds: Refund[];
}

export interface PaymentSummaryGroup {
  key: string;
  count: number;
  totalMinor: number;
}

/** Reconciliation summary from GET /v1/payments/summary. */
export interface PaymentSummary {
  count: number;
  totalMinor: number;
  byGateway: PaymentSummaryGroup[];
  byStatus: PaymentSummaryGroup[];
}

/** One session row from GET /v1/admin/buyer-intelligence/sessions. */
export interface BuyerSessionSummary {
  sessionId: string;
  visitorId: string;
  identityStatus: IdentityStatus;
  customerId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  eventCount: number;
  eventCounts: Partial<Record<VisitorEventType, number>>;
  productViews: number;
  cartValueMinor: number;
  leadScore: number;
  leadBand: 'hot' | 'warm' | 'cold';
  marketingUsable: boolean;
}

/** Session detail: the summary plus the score breakdown and the
 * full event timeline. */
export interface BuyerSessionDetail extends BuyerSessionSummary {
  scoreBreakdown: {
    recency: number;
    productViews: number;
    repeatSessions: number;
    cartValue: number;
    checkoutProgress: number;
  };
  events: Array<{
    id: string;
    type: VisitorEventType;
    path: string | null;
    payload: Record<string, unknown> | null;
    occurredAt: string;
  }>;
}

/** Lead detail from GET /v1/leads/:id. */
export interface LeadDetailView {
  lead: Lead;
  attempts: LeadContactAttempt[];
  followUpTasks: FollowUpTask[];
}

/** Customer timeline from GET /v1/crm/customers/:id/timeline. */
export interface CustomerTimelineView {
  customer: Customer;
  orders: Order[];
  visitor: {
    sessionCount: number;
    identityStatuses: IdentityStatus[];
    eventCount: number;
    eventCounts: Partial<Record<VisitorEventType, number>>;
    lastActivityAt: string | null;
    bestLeadScore: number;
  };
  notes: CustomerNote[];
  tags: string[];
}

/** Abandoned cart detail from GET /v1/cart-recovery/:id: the
 * recovery, its step attempts, and the communication log entries
 * the steps and staff produced for it. */
export interface AbandonedCartDetailView {
  recovery: AbandonedCart;
  attempts: RecoveryAttempt[];
  communications: CommunicationLog[];
}

/** Shipment detail from GET /v1/shipping/:id: the shipment
 * plus its recorded status history. */
export type ShipmentDetailView = ShipmentDetail;

/** Answer of POST /v1/shipping/:id/refresh: the detail plus
 * whether the courier's answer changed anything, and why not
 * when it did not. */
export interface ShipmentRefreshView extends ShipmentDetail {
  refreshed: boolean;
  refreshNote: string | null;
}

/** Staff notification feed from GET /v1/admin/notifications:
 * derived items plus the caller's unread count. */
export interface NotificationFeedView {
  items: StaffNotification[];
  unread: number;
}

/** Answer of POST /v1/admin/returns/:id/refund: the updated
 * return plus the Payments refund id when one was created
 * (null when the refund was already settled or not needed). */
export interface ReturnRefundHandOffView {
  request: ReturnRequest;
  refundId: string | null;
}

export interface MessageTemplateView extends MessageTemplate {
  source: 'built-in' | 'stored';
  updatedAt: string | null;
}

export interface StockMovementView {
  id: string;
  variantId: string;
  productId: string;
  type: 'adjustment' | 'reserve' | 'release' | 'finalize';
  deltaOnHand: number;
  deltaReserved: number;
  onHandAfter: number;
  reservedAfter: number;
  reference: string | null;
  createdAt: string;
}

export interface OwnSessionView {
  familyId: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  active: boolean;
}

export interface SecuritySettingsView {
  corsAllowlist: string[];
  corsCredentials: boolean;
  securityHeaders: string[];
  bodyLimit: string;
  loginRateLimitPerMinute: number;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  passwordMinLength: number;
  mfaChallengeTtlMinutes: number;
  requireMfaForAdmins: boolean;
  accountLockout: boolean;
  loginNotifications: string;
}

export interface ReturnDetailView {
  request: ReturnRequest;
  events: ReturnEvent[];
}

export interface CampaignSegmentSize {
  key: CampaignSegment;
  size: number;
}

export interface ApiClientOptions {
  /** API origin, for example https://api.dostelo.com. No trailing slash. */
  baseUrl: string;
  /** Fetch implementation override, for tests or non-browser runtimes. */
  fetchFn?: typeof fetch;
  /**
   * Access token source for authenticated requests: a token
   * string, or a function returning the current token (or null).
   * When it yields a token, requests carry an Authorization
   * Bearer header. Token storage and refresh are the caller's
   * job; pair this with the auth methods below.
   */
  accessToken?: string | (() => string | null);
}

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

/**
 * Typed client for the Dostelo API (/v1 namespace). Request payloads
 * use the shared Zod-inferred types from @dostelo/validation and
 * responses use the domain types from @dostelo/types, so a contract
 * change fails typecheck on both sides.
 */
export function createApiClient(options: ApiClientOptions) {
  const fetchFn = options.fetchFn ?? fetch;
  const base = options.baseUrl.replace(/\/+$/, '');

  function currentAccessToken(): string | null {
    if (!options.accessToken) return null;
    return typeof options.accessToken === 'function'
      ? options.accessToken()
      : options.accessToken;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (body) headers['content-type'] = 'application/json';
    const token = currentAccessToken();
    if (token) headers['authorization'] = `Bearer ${token}`;
    const response = await fetchFn(`${base}${path}`, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new ApiError(response.status, parsed);
    }
    return parsed as T;
  }

  return {
    // Auth (Phase 4). Login and MFA routes are rate limited on
    // the server; refresh rotates the refresh token, so always
    // store the pair returned by refreshTokens.
    registerAndLogin(
      dto: CustomerRegistration,
    ): Promise<{ customer: Customer; tokens: AuthTokens }> {
      return request('POST', '/v1/auth/register', dto);
    },
    loginCustomer(dto: CustomerLogin): Promise<AuthTokens> {
      return request('POST', '/v1/auth/login', dto);
    },
    refreshTokens(refreshToken: string): Promise<AuthTokens> {
      return request('POST', '/v1/auth/refresh', { refreshToken });
    },
    logout(refreshToken: string): Promise<{ revoked: boolean }> {
      return request('POST', '/v1/auth/logout', { refreshToken });
    },
    loginAdmin(dto: AdminLogin): Promise<AdminLoginResult> {
      return request('POST', '/v1/auth/admin/login', dto);
    },
    exchangeAdminMfa(dto: MfaExchange): Promise<AuthTokens> {
      return request('POST', '/v1/auth/admin/mfa/exchange', dto);
    },
    enrollAdminMfa(): Promise<{ secret: string; otpauthUrl: string }> {
      return request('POST', '/v1/auth/admin/mfa/enroll');
    },
    enableAdminMfa(dto: TotpCode): Promise<{ mfaEnabled: true }> {
      return request('POST', '/v1/auth/admin/mfa/enable', dto);
    },
    disableAdminMfa(dto: TotpCode): Promise<{ mfaEnabled: false }> {
      return request('POST', '/v1/auth/admin/mfa/disable', dto);
    },
    listAuditLog(query?: {
      actorId?: string;
      actorType?: string;
      action?: string;
      from?: string;
      to?: string;
      limit?: number;
    }): Promise<{ items: AuditLogEntry[] }> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined) params.set(key, String(value));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/admin/audit-log${suffix}`);
    },

    // Catalog
    listProducts(category?: string): Promise<{ items: Product[]; total: number }> {
      const query = category
        ? `?category=${encodeURIComponent(category)}`
        : '';
      return request('GET', `/v1/catalog/products${query}`);
    },
    getProduct(key: string): Promise<Product> {
      return request('GET', `/v1/catalog/products/${encodeURIComponent(key)}`);
    },
    listCategories(): Promise<{ items: CategorySummary[] }> {
      return request('GET', '/v1/catalog/categories');
    },

    // Customers
    registerCustomer(dto: CustomerRegistration): Promise<Customer> {
      return request('POST', '/v1/customers/register', dto);
    },
    getCustomer(id: string): Promise<Customer> {
      return request('GET', `/v1/customers/${encodeURIComponent(id)}`);
    },
    /** Staff customer list (admin token with customers.read).
     * Optional case-insensitive search across name, email and
     * phone. */
    listCustomers(query?: {
      search?: string;
      limit?: number;
    }): Promise<{ items: Customer[] }> {
      const params = new URLSearchParams();
      if (query?.search) params.set('search', query.search);
      if (query?.limit !== undefined) params.set('limit', String(query.limit));
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/customers${suffix}`);
    },
    listCustomerOrders(customerId: string): Promise<{ items: Order[] }> {
      return request(
        'GET',
        `/v1/orders?customerId=${encodeURIComponent(customerId)}`,
      );
    },

    // Carts
    createCart(dto: CartCreate = {}): Promise<CartView> {
      return request('POST', '/v1/carts', dto);
    },
    getCart(id: string): Promise<CartView> {
      return request('GET', `/v1/carts/${encodeURIComponent(id)}`);
    },
    addCartLine(cartId: string, dto: CartLineCreate): Promise<CartView> {
      return request(
        'POST',
        `/v1/carts/${encodeURIComponent(cartId)}/lines`,
        dto,
      );
    },
    updateCartLine(
      cartId: string,
      lineId: string,
      dto: CartLineUpdate,
    ): Promise<CartView> {
      return request(
        'PATCH',
        `/v1/carts/${encodeURIComponent(cartId)}/lines/${encodeURIComponent(lineId)}`,
        dto,
      );
    },
    removeCartLine(cartId: string, lineId: string): Promise<CartView> {
      return request(
        'DELETE',
        `/v1/carts/${encodeURIComponent(cartId)}/lines/${encodeURIComponent(lineId)}`,
      );
    },

    // Checkout and orders
    quoteCheckout(dto: CheckoutRequest): Promise<CheckoutQuote> {
      return request('POST', '/v1/checkout/quote', dto);
    },
    placeOrder(dto: CheckoutRequest): Promise<Order> {
      return request('POST', '/v1/checkout/place-order', dto);
    },
    getOrder(orderNumber: string): Promise<Order> {
      return request(
        'GET',
        `/v1/orders/${encodeURIComponent(orderNumber)}`,
      );
    },
    transitionOrderStatus(
      orderNumber: string,
      dto: OrderStatusTransition,
    ): Promise<Order> {
      return request(
        'POST',
        `/v1/orders/${encodeURIComponent(orderNumber)}/status`,
        dto,
      );
    },

    // Staff order reads (admin token with orders.read)
    listStaffOrders(status?: OrderStatus): Promise<{ items: Order[] }> {
      const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
      return request('GET', `/v1/admin/orders${suffix}`);
    },
    getStaffOrder(orderNumber: string): Promise<OrderDetailView> {
      return request(
        'GET',
        `/v1/admin/orders/${encodeURIComponent(orderNumber)}`,
      );
    },

    // Payments: staff reconciliation reads and actions. The list,
    // summary and detail reads require payments.read; verify
    // requires payments.verify; refunds require payments.refund.
    listPayments(filter?: {
      gateway?: string;
      status?: string;
      orderId?: string;
    }): Promise<{ items: Payment[] }> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filter ?? {})) {
        if (value !== undefined) params.set(key, String(value));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/payments${suffix}`);
    },
    getPaymentsSummary(): Promise<PaymentSummary> {
      return request('GET', '/v1/payments/summary');
    },
    getPayment(paymentId: string): Promise<PaymentDetailView> {
      return request('GET', `/v1/payments/${encodeURIComponent(paymentId)}`);
    },
    verifyPayment(paymentId: string, dto: PaymentVerify): Promise<Payment> {
      return request(
        'POST',
        `/v1/payments/${encodeURIComponent(paymentId)}/verify`,
        dto,
      );
    },
    requestRefund(paymentId: string, dto: RefundRequest): Promise<Refund> {
      return request(
        'POST',
        `/v1/payments/${encodeURIComponent(paymentId)}/refunds`,
        dto,
      );
    },
    confirmRefund(
      paymentId: string,
      refundId: string,
      dto: RefundConfirm,
    ): Promise<Refund> {
      return request(
        'POST',
        `/v1/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}/confirm`,
        dto,
      );
    },

    // Inventory (staff-facing; reads require inventory.read and
    // adjust requires an admin token with inventory.adjust)
    listInventory(productId?: string): Promise<{ items: StockView[] }> {
      const suffix = productId
        ? `?productId=${encodeURIComponent(productId)}`
        : '';
      return request('GET', `/v1/inventory${suffix}`);
    },
    getStock(variantId: string): Promise<StockView> {
      return request(
        'GET',
        `/v1/inventory/${encodeURIComponent(variantId)}`,
      );
    },
    adjustStock(variantId: string, dto: InventoryAdjust): Promise<StockView> {
      return request(
        'POST',
        `/v1/inventory/${encodeURIComponent(variantId)}/adjust`,
        dto,
      );
    },

    // Visitor tracking (Phase 5). Public calls for the storefront
    // tracker: events and consent carry only the random
    // first-party ids. linkVisitor needs a customer access token.
    recordVisitorEvent(
      dto: VisitorEventIngest,
    ): Promise<{ id: string; sessionId: string; marketingUsable: boolean }> {
      return request('POST', '/v1/visitor-events', dto);
    },
    recordVisitorConsent(dto: ConsentRecordInput): Promise<ConsentRecord> {
      return request('POST', '/v1/visitors/consent', dto);
    },
    linkVisitor(
      dto: VisitorLinkInput,
    ): Promise<{ visitorId: string; customerId: string; basis: string }> {
      return request('POST', '/v1/visitors/link', dto);
    },

    // Buyer Intelligence (staff; admin token with buyers.read)
    listBuyerSessions(filter?: {
      status?: IdentityStatus;
      minScore?: number;
    }): Promise<{ items: BuyerSessionSummary[] }> {
      const params = new URLSearchParams();
      if (filter?.status) params.set('status', filter.status);
      if (filter?.minScore !== undefined) {
        params.set('minScore', String(filter.minScore));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/admin/buyer-intelligence/sessions${suffix}`);
    },
    getBuyerSession(sessionId: string): Promise<BuyerSessionDetail> {
      return request(
        'GET',
        `/v1/admin/buyer-intelligence/sessions/${encodeURIComponent(sessionId)}`,
      );
    },

    // Leads (staff; reads need leads.read, assignment needs
    // leads.assign, status and tasks need leads.edit, attempts
    // need leads.contact)
    listLeads(filter?: {
      status?: LeadStatus;
      assigneeId?: string;
    }): Promise<{ items: Lead[] }> {
      const params = new URLSearchParams();
      if (filter?.status) params.set('status', filter.status);
      if (filter?.assigneeId) params.set('assigneeId', filter.assigneeId);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/leads${suffix}`);
    },
    getLead(id: string): Promise<LeadDetailView> {
      return request('GET', `/v1/leads/${encodeURIComponent(id)}`);
    },
    createLead(dto: LeadCreate): Promise<Lead> {
      return request('POST', '/v1/leads', dto);
    },
    assignLead(id: string, dto: LeadAssign): Promise<Lead> {
      return request('POST', `/v1/leads/${encodeURIComponent(id)}/assign`, dto);
    },
    changeLeadStatus(id: string, dto: LeadStatusChange): Promise<Lead> {
      return request('POST', `/v1/leads/${encodeURIComponent(id)}/status`, dto);
    },
    createFollowUpTask(
      leadId: string,
      dto: FollowUpTaskCreate,
    ): Promise<FollowUpTask> {
      return request(
        'POST',
        `/v1/leads/${encodeURIComponent(leadId)}/follow-ups`,
        dto,
      );
    },
    listFollowUpTasks(
      leadId: string,
    ): Promise<{ items: FollowUpTask[] }> {
      return request(
        'GET',
        `/v1/leads/${encodeURIComponent(leadId)}/follow-ups`,
      );
    },
    completeFollowUpTask(
      leadId: string,
      taskId: string,
    ): Promise<FollowUpTask> {
      return request(
        'POST',
        `/v1/leads/${encodeURIComponent(leadId)}/follow-ups/${encodeURIComponent(taskId)}/complete`,
      );
    },
    recordContactAttempt(
      leadId: string,
      dto: ContactAttemptCreate,
    ): Promise<LeadContactAttempt> {
      return request(
        'POST',
        `/v1/leads/${encodeURIComponent(leadId)}/contact-attempts`,
        dto,
      );
    },
    listContactAttempts(
      leadId: string,
    ): Promise<{ items: LeadContactAttempt[] }> {
      return request(
        'GET',
        `/v1/leads/${encodeURIComponent(leadId)}/contact-attempts`,
      );
    },
    optOutLead(id: string): Promise<Lead> {
      return request('POST', `/v1/leads/${encodeURIComponent(id)}/opt-out`);
    },

    // CRM (staff; timeline needs customers.read, notes and tags
    // need customers.edit)
    getCustomerTimeline(id: string): Promise<CustomerTimelineView> {
      return request(
        'GET',
        `/v1/crm/customers/${encodeURIComponent(id)}/timeline`,
      );
    },
    addCustomerNote(
      id: string,
      dto: CustomerNoteCreate,
    ): Promise<CustomerNote> {
      return request(
        'POST',
        `/v1/crm/customers/${encodeURIComponent(id)}/notes`,
        dto,
      );
    },
    addCustomerTag(
      id: string,
      dto: CustomerTagInput,
    ): Promise<{ tags: string[] }> {
      return request(
        'POST',
        `/v1/crm/customers/${encodeURIComponent(id)}/tags`,
        dto,
      );
    },
    removeCustomerTag(
      id: string,
      tag: string,
    ): Promise<{ tags: string[] }> {
      return request(
        'DELETE',
        `/v1/crm/customers/${encodeURIComponent(id)}/tags/${encodeURIComponent(tag)}`,
      );
    },

    // Cart recovery (staff; reads need recovery.read, actions
    // need recovery.edit). Sends are never faked: an attempt's
    // outcome mirrors the communication log, including
    // not-configured providers and refusals.
    listAbandonedCarts(
      status?: AbandonedCartStatus,
    ): Promise<{ items: AbandonedCart[] }> {
      const suffix = status
        ? `?status=${encodeURIComponent(status)}`
        : '';
      return request('GET', `/v1/cart-recovery${suffix}`);
    },
    getAbandonedCart(id: string): Promise<AbandonedCartDetailView> {
      return request(
        'GET',
        `/v1/cart-recovery/${encodeURIComponent(id)}`,
      );
    },
    runRecoveryScan(): Promise<{ detected: number; closed: number }> {
      return request('POST', '/v1/cart-recovery/scan');
    },
    getRecoverySettings(): Promise<RecoverySettings> {
      return request('GET', '/v1/cart-recovery/settings');
    },
    updateRecoverySettings(
      dto: RecoverySettingsUpdate,
    ): Promise<RecoverySettings> {
      return request('PUT', '/v1/cart-recovery/settings', dto);
    },
    cancelRecovery(id: string): Promise<AbandonedCart> {
      return request(
        'POST',
        `/v1/cart-recovery/${encodeURIComponent(id)}/cancel`,
      );
    },
    runRecoveryStep(id: string): Promise<AbandonedCartDetailView> {
      return request(
        'POST',
        `/v1/cart-recovery/${encodeURIComponent(id)}/run-step`,
      );
    },

    // Communication Center (staff; the log needs
    // communications.read, logging a call needs recovery.edit)
    listCommunicationLog(filter?: {
      channel?: CommunicationChannel;
      status?: CommunicationLogStatus;
      customerId?: string;
      leadId?: string;
      abandonedCartId?: string;
    }): Promise<{ items: CommunicationLog[] }> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filter ?? {})) {
        if (value !== undefined) params.set(key, String(value));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/communications/log${suffix}`);
    },
    logManualCall(dto: ManualCallLog): Promise<CommunicationLog> {
      return request('POST', '/v1/communications/calls', dto);
    },

    // Public recovery link target: the unguessable token is the
    // credential, and the view never carries contact details.
    getRecoveryCart(token: string): Promise<RecoveryCartView> {
      return request(
        'GET',
        `/v1/recovery/${encodeURIComponent(token)}`,
      );
    },

    // Shipping and Courier (staff; reads need shipping.read,
    // booking and refresh need shipping.edit). Booking is never
    // faked: with no courier credentials the shipment comes
    // back in the not-configured status with no tracking id.
    createShipment(dto: CreateShipment): Promise<Shipment> {
      return request('POST', '/v1/shipping', dto);
    },
    listShipments(filter?: {
      courier?: Courier;
      status?: ShipmentStatus;
      orderNumber?: string;
    }): Promise<{ items: Shipment[] }> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filter ?? {})) {
        if (value !== undefined) params.set(key, String(value));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/shipping${suffix}`);
    },
    getShipment(id: string): Promise<ShipmentDetailView> {
      return request('GET', `/v1/shipping/${encodeURIComponent(id)}`);
    },
    refreshShipment(id: string): Promise<ShipmentRefreshView> {
      return request(
        'POST',
        `/v1/shipping/${encodeURIComponent(id)}/refresh`,
      );
    },

    // Returns and Exchanges (staff; reads need orders.read,
    // actions need orders.edit, the refund hand-off needs
    // payments.refund). Approving restocks the returned units;
    // the refund itself is created in Payments by the hand-off.
    listReturns(filter?: {
      status?: ReturnStatus;
      orderNumber?: string;
    }): Promise<{ items: ReturnRequest[] }> {
      const params = new URLSearchParams();
      if (filter?.status) params.set('status', filter.status);
      if (filter?.orderNumber) params.set('orderNumber', filter.orderNumber);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/admin/returns${suffix}`);
    },
    getReturn(id: string): Promise<ReturnRequest> {
      return request('GET', `/v1/admin/returns/${encodeURIComponent(id)}`);
    },
    createReturn(dto: CreateReturn): Promise<ReturnRequest> {
      return request('POST', '/v1/admin/returns', dto);
    },
    approveReturn(id: string): Promise<ReturnRequest> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/approve`,
      );
    },
    rejectReturn(id: string): Promise<ReturnRequest> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/reject`,
      );
    },
    handOffReturnRefund(id: string): Promise<ReturnRefundHandOffView> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/refund`,
      );
    },
    completeReturn(id: string): Promise<ReturnRequest> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/complete`,
      );
    },

    // Customer Support (staff; reads need customers.read, writes
    // need customers.edit). Tickets are staff-created records of
    // contacts that arrived outside the storefront.
    listSupportTickets(filter?: {
      status?: SupportTicketStatus;
      customerId?: string;
      assignedToId?: string;
    }): Promise<{ items: SupportTicket[] }> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filter ?? {})) {
        if (value !== undefined) params.set(key, String(value));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/admin/support-tickets${suffix}`);
    },
    getSupportTicket(id: string): Promise<SupportTicketDetail> {
      return request(
        'GET',
        `/v1/admin/support-tickets/${encodeURIComponent(id)}`,
      );
    },
    createSupportTicket(
      dto: CreateSupportTicket,
    ): Promise<SupportTicketDetail> {
      return request('POST', '/v1/admin/support-tickets', dto);
    },
    replySupportTicket(
      id: string,
      dto: SupportTicketReply,
    ): Promise<SupportTicketDetail> {
      return request(
        'POST',
        `/v1/admin/support-tickets/${encodeURIComponent(id)}/reply`,
        dto,
      );
    },
    setSupportTicketStatus(
      id: string,
      dto: SupportTicketStatusUpdate,
    ): Promise<SupportTicketDetail> {
      return request(
        'POST',
        `/v1/admin/support-tickets/${encodeURIComponent(id)}/status`,
        dto,
      );
    },
    assignSupportTicket(
      id: string,
      dto: SupportTicketAssign,
    ): Promise<SupportTicketDetail> {
      return request(
        'POST',
        `/v1/admin/support-tickets/${encodeURIComponent(id)}/assign`,
        dto,
      );
    },

    // Reviews moderation (staff; marketing.read and
    // marketing.edit). Reviews are staff-entered; the source
    // field says whether a delivered order backs the review.
    listReviews(filter?: {
      productId?: string;
      status?: ReviewStatus;
    }): Promise<{ items: ProductReview[] }> {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filter ?? {})) {
        if (value !== undefined) params.set(key, String(value));
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/admin/reviews${suffix}`);
    },
    createReview(dto: CreateReview): Promise<ProductReview> {
      return request('POST', '/v1/admin/reviews', dto);
    },
    setReviewStatus(
      id: string,
      dto: ReviewStatusUpdate,
    ): Promise<ProductReview> {
      return request(
        'POST',
        `/v1/admin/reviews/${encodeURIComponent(id)}/status`,
        dto,
      );
    },

    // Marketing campaigns (staff; marketing.read and
    // marketing.edit). Campaigns are records with draft and
    // scheduled states; the view's sending state mirrors the
    // channel provider configuration and is never faked.
    listCampaigns(filter?: {
      status?: CampaignStatus;
    }): Promise<{ items: CampaignView[] }> {
      const suffix = filter?.status
        ? `?status=${encodeURIComponent(filter.status)}`
        : '';
      return request('GET', `/v1/admin/campaigns${suffix}`);
    },
    getCampaign(id: string): Promise<CampaignView> {
      return request('GET', `/v1/admin/campaigns/${encodeURIComponent(id)}`);
    },
    createCampaign(dto: CreateCampaign): Promise<CampaignView> {
      return request('POST', '/v1/admin/campaigns', dto);
    },
    updateCampaign(
      id: string,
      dto: UpdateCampaign,
    ): Promise<CampaignView> {
      return request(
        'PATCH',
        `/v1/admin/campaigns/${encodeURIComponent(id)}`,
        dto,
      );
    },

    // Loyalty (staff; marketing.read and marketing.edit).
    // Balances derive from delivered orders at the stored rules
    // plus recorded adjustments; nothing is stored per balance.
    getLoyaltyRules(): Promise<LoyaltyRules> {
      return request('GET', '/v1/admin/loyalty/rules');
    },
    updateLoyaltyRules(dto: LoyaltyRulesUpdate): Promise<LoyaltyRules> {
      return request('PUT', '/v1/admin/loyalty/rules', dto);
    },
    listLoyaltyBalances(): Promise<{ items: LoyaltyBalance[] }> {
      return request('GET', '/v1/admin/loyalty/customers');
    },
    getLoyaltyBalance(customerId: string): Promise<LoyaltyBalance> {
      return request(
        'GET',
        `/v1/admin/loyalty/customers/${encodeURIComponent(customerId)}`,
      );
    },
    listLoyaltyTransactions(
      customerId: string,
    ): Promise<{ items: LoyaltyTransaction[] }> {
      return request(
        'GET',
        `/v1/admin/loyalty/customers/${encodeURIComponent(customerId)}/transactions`,
      );
    },
    adjustLoyalty(
      customerId: string,
      dto: LoyaltyAdjust,
    ): Promise<LoyaltyBalance> {
      return request(
        'POST',
        `/v1/admin/loyalty/customers/${encodeURIComponent(customerId)}/adjust`,
        dto,
      );
    },

    // Reports (staff; reports.read). Read-only aggregation over
    // orders, payments and recovery records.
    getReportsSummary(query?: {
      from?: string;
      to?: string;
    }): Promise<ReportsSummary> {
      const params = new URLSearchParams();
      if (query?.from) params.set('from', query.from);
      if (query?.to) params.set('to', query.to);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/admin/reports/summary${suffix}`);
    },

    // Website store settings (staff; settings.manage). The
    // delivery fee table saved here is the table checkout
    // charges.
    getStoreSettings(): Promise<StoreSettingsView> {
      return request('GET', '/v1/admin/store-settings');
    },
    updateStoreSettings(
      dto: StoreSettingsUpdate,
    ): Promise<StoreSettingsView> {
      return request('PUT', '/v1/admin/store-settings', dto);
    },

    // Staff notifications (staff; settings.manage). The feed is
    // derived from live orders, stock and recovery records;
    // only the per-staff read marks are stored.
    getNotificationFeed(): Promise<NotificationFeedView> {
      return request('GET', '/v1/admin/notifications');
    },
    markNotificationsRead(
      dto: NotificationMarkRead,
    ): Promise<{ marked: number }> {
      return request('POST', '/v1/admin/notifications/read', dto);
    },

    // Staff and Admin Users (staff; staff.manage). Views never
    // carry password hashes or MFA secrets.
    listStaff(): Promise<{ items: StaffMemberView[] }> {
      return request('GET', '/v1/admin/staff');
    },
    createStaff(dto: CreateStaff): Promise<StaffMemberView> {
      return request('POST', '/v1/admin/staff', dto);
    },
    setStaffRoles(
      id: string,
      dto: StaffRolesUpdate,
    ): Promise<StaffMemberView> {
      return request(
        'POST',
        `/v1/admin/staff/${encodeURIComponent(id)}/roles`,
        dto,
      );
    },
    deactivateStaff(id: string): Promise<StaffMemberView> {
      return request(
        'POST',
        `/v1/admin/staff/${encodeURIComponent(id)}/deactivate`,
      );
    },
    activateStaff(id: string): Promise<StaffMemberView> {
      return request(
        'POST',
        `/v1/admin/staff/${encodeURIComponent(id)}/activate`,
      );
    },
    revokeStaffSessions(id: string): Promise<{ revoked: number }> {
      return request(
        'POST',
        `/v1/admin/staff/${encodeURIComponent(id)}/revoke-sessions`,
      );
    },

    // Integrations (staff; settings.manage). Read-only status
    // board: configuration state and missing variable names
    // only, never secret values.
    listIntegrations(): Promise<{ items: IntegrationStatus[] }> {
      return request('GET', '/v1/admin/integrations');
    },

    // Legal pages (staff; settings.manage). Stored documents;
    // the storefront still serves its ported policy text until
    // it is wired to read these.
    listLegalDocuments(): Promise<{ items: LegalDocument[] }> {
      return request('GET', '/v1/admin/legal');
    },
    getLegalDocument(slug: string): Promise<LegalDocument> {
      return request('GET', `/v1/admin/legal/${encodeURIComponent(slug)}`);
    },
    updateLegalDocument(
      slug: string,
      dto: LegalDocumentUpdate,
    ): Promise<LegalDocument> {
      return request(
        'PUT',
        `/v1/admin/legal/${encodeURIComponent(slug)}`,
        dto,
      );
    },

    // Backup and Data (staff; settings.manage). Exports are
    // produced on demand by the API and downloaded by the
    // caller; the history lists past export records.
    listBackups(): Promise<{ items: DataExportRecord[] }> {
      return request('GET', '/v1/admin/backups');
    },
    createBackup(): Promise<DataExportResult> {
      return request('POST', '/v1/admin/backups');
    },

    // Automation (staff; settings.manage). A read-only inventory
    // of the automations that actually run, with live settings.
    listAutomations(): Promise<{ items: AutomationInfo[] }> {
      return request('GET', '/v1/admin/automation');
    },
    listAutomationExecutions(filter?: {
      workflowKey?: string;
      status?: 'success' | 'failed';
      search?: string;
    }): Promise<{ items: AutomationExecution[] }> {
      const params = new URLSearchParams();
      if (filter?.workflowKey) params.set('workflowKey', filter.workflowKey);
      if (filter?.status) params.set('status', filter.status);
      if (filter?.search) params.set('search', filter.search);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/admin/automation/executions${suffix}`);
    },
    setAutomationEnabled(
      key: string,
      enabled: boolean,
    ): Promise<AutomationInfo> {
      return request(
        'POST',
        `/v1/admin/automation/${encodeURIComponent(key)}/${enabled ? 'activate' : 'pause'}`,
      );
    },

    // Message templates (staff; communications.read to view,
    // recovery.edit to change). One shared store for recovery,
    // staff sends, marketing and support canned replies.
    listMessageTemplates(): Promise<{ items: MessageTemplateView[] }> {
      return request('GET', '/v1/communications/templates');
    },
    upsertMessageTemplate(
      key: string,
      dto: MessageTemplateUpsert,
    ): Promise<MessageTemplateView> {
      return request(
        'PUT',
        `/v1/communications/templates/${encodeURIComponent(key)}`,
        dto,
      );
    },
    deleteMessageTemplate(
      key: string,
    ): Promise<{ key: string; removed: boolean; builtinRestored: boolean }> {
      return request(
        'DELETE',
        `/v1/communications/templates/${encodeURIComponent(key)}`,
      );
    },
    sendMessage(dto: StaffSend): Promise<CommunicationLog> {
      return request('POST', '/v1/communications/send', dto);
    },

    // Staff order creation (staff; orders.create). Totals are
    // computed by the server through the checkout path.
    createStaffOrder(dto: CheckoutRequest): Promise<Order> {
      return request('POST', '/v1/admin/orders', dto);
    },

    // Products admin (staff; products.*). All statuses, unlike
    // the public catalogue read.
    listAdminProducts(): Promise<{ items: Product[]; total: number }> {
      return request('GET', '/v1/admin/products');
    },
    getAdminProduct(id: string): Promise<Product> {
      return request('GET', `/v1/admin/products/${encodeURIComponent(id)}`);
    },
    createProduct(dto: ProductCreate): Promise<Product> {
      return request('POST', '/v1/admin/products', dto);
    },
    updateProduct(id: string, dto: ProductUpdate): Promise<Product> {
      return request(
        'PUT',
        `/v1/admin/products/${encodeURIComponent(id)}`,
        dto,
      );
    },
    deleteProduct(id: string): Promise<{ deleted: boolean }> {
      return request(
        'DELETE',
        `/v1/admin/products/${encodeURIComponent(id)}`,
      );
    },

    // Inventory movement ledger (staff; inventory.read).
    listStockMovements(filter?: {
      variantId?: string;
      productId?: string;
      from?: string;
      to?: string;
      limit?: number;
    }): Promise<{ items: StockMovementView[] }> {
      const params = new URLSearchParams();
      if (filter?.variantId) params.set('variantId', filter.variantId);
      if (filter?.productId) params.set('productId', filter.productId);
      if (filter?.from) params.set('from', filter.from);
      if (filter?.to) params.set('to', filter.to);
      if (filter?.limit) params.set('limit', String(filter.limit));
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return request('GET', `/v1/inventory/movements${suffix}`);
    },

    // Returns workflow (staff; orders.edit, refunded needs
    // payments.refund).
    getReturnDetail(id: string): Promise<ReturnDetailView> {
      return request(
        'GET',
        `/v1/admin/returns/${encodeURIComponent(id)}/detail`,
      );
    },
    startReturnReview(id: string): Promise<ReturnRequest> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/review`,
      );
    },
    requestReturnInfo(
      id: string,
      dto: ReturnNote,
    ): Promise<ReturnRequest> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/request-info`,
        dto,
      );
    },
    assignReturnInspector(
      id: string,
      dto: ReturnAssign,
    ): Promise<ReturnRequest> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/assign`,
        dto,
      );
    },
    scheduleReturnPickup(
      id: string,
      dto: ReturnPickup,
    ): Promise<ReturnRequest> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/schedule-pickup`,
        dto,
      );
    },
    markReturnInTransit(id: string): Promise<ReturnRequest> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/in-transit`,
      );
    },
    recordReturnReceived(id: string): Promise<ReturnRequest> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/received`,
      );
    },
    startReturnInspection(id: string): Promise<ReturnRequest> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/inspection/start`,
      );
    },
    completeReturnInspection(
      id: string,
      dto: ReturnInspectionInput,
    ): Promise<ReturnRequest> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/inspection/complete`,
        dto,
      );
    },
    markReturnRefunded(id: string): Promise<ReturnRequest> {
      return request(
        'POST',
        `/v1/admin/returns/${encodeURIComponent(id)}/refunded`,
      );
    },

    // Campaigns: segments, send, stats (staff; marketing.*).
    listCampaignSegments(
      channel: string,
    ): Promise<{ items: CampaignSegmentSize[] }> {
      return request(
        'GET',
        `/v1/admin/campaigns/segments?channel=${encodeURIComponent(channel)}`,
      );
    },
    sendCampaign(id: string): Promise<CampaignView> {
      return request(
        'POST',
        `/v1/admin/campaigns/${encodeURIComponent(id)}/send`,
      );
    },
    getCampaignStats(id: string): Promise<CampaignStats> {
      return request(
        'GET',
        `/v1/admin/campaigns/${encodeURIComponent(id)}/stats`,
      );
    },

    // Notifications: unread, hide, preferences.
    markNotificationsUnread(
      dto: NotificationMarkRead,
    ): Promise<{ marked: number }> {
      return request('POST', '/v1/admin/notifications/unread', dto);
    },
    hideNotifications(
      dto: NotificationMarkRead,
    ): Promise<{ marked: number }> {
      return request('POST', '/v1/admin/notifications/hide', dto);
    },
    getNotificationPreferences(): Promise<NotificationPreference> {
      return request('GET', '/v1/admin/notifications/preferences');
    },
    updateNotificationPreferences(
      dto: NotificationPreferencesUpdate,
    ): Promise<NotificationPreference> {
      return request('PUT', '/v1/admin/notifications/preferences', dto);
    },

    // Loyalty: points rules and the full ledger.
    listPointRules(): Promise<{ items: PointsRule[] }> {
      return request('GET', '/v1/admin/loyalty/point-rules');
    },
    upsertPointRule(
      dto: PointsRuleUpsert,
    ): Promise<{ items: PointsRule[] }> {
      return request('POST', '/v1/admin/loyalty/point-rules', dto);
    },
    listAllLoyaltyTransactions(): Promise<{ items: LoyaltyTransaction[] }> {
      return request('GET', '/v1/admin/loyalty/transactions');
    },

    // Staff: invite flow and profile edits.
    inviteStaff(
      dto: InviteStaff,
    ): Promise<{
      admin: StaffMemberView;
      inviteToken: string;
      expiresAt: string;
    }> {
      return request('POST', '/v1/admin/staff/invite', dto);
    },
    updateStaffProfile(
      id: string,
      dto: StaffProfileUpdate,
    ): Promise<StaffMemberView> {
      return request(
        'PATCH',
        `/v1/admin/staff/${encodeURIComponent(id)}`,
        dto,
      );
    },
    acceptStaffInvite(dto: AcceptInvite): Promise<StaffMemberView> {
      return request('POST', '/v1/auth/admin/accept-invite', dto);
    },

    // Security: own sessions and the server configuration report.
    listOwnSessions(): Promise<{ items: OwnSessionView[] }> {
      return request('GET', '/v1/auth/admin/sessions');
    },
    revokeOwnSessionFamily(
      familyId: string,
    ): Promise<{ revoked: boolean }> {
      return request('POST', '/v1/auth/admin/sessions/revoke', {
        familyId,
      });
    },
    revokeOtherSessionFamilies(
      keepFamilyId: string,
    ): Promise<{ revokedFamilies: number }> {
      return request('POST', '/v1/auth/admin/sessions/revoke-others', {
        keepFamilyId,
      });
    },
    getSecuritySettings(): Promise<SecuritySettingsView> {
      return request('GET', '/v1/admin/security/settings');
    },

    // Legal: drafts, publishing, versions, custom documents.
    createLegalDocument(input: {
      slug: string;
      title: string;
      description?: string;
    }): Promise<LegalDocument> {
      return request('POST', '/v1/admin/legal', input);
    },
    publishLegalDocument(slug: string): Promise<LegalDocument> {
      return request(
        'POST',
        `/v1/admin/legal/${encodeURIComponent(slug)}/publish`,
      );
    },
    unpublishLegalDocument(slug: string): Promise<LegalDocument> {
      return request(
        'POST',
        `/v1/admin/legal/${encodeURIComponent(slug)}/unpublish`,
      );
    },
    listLegalVersions(slug: string): Promise<{ items: LegalDocumentVersion[] }> {
      return request(
        'GET',
        `/v1/admin/legal/${encodeURIComponent(slug)}/versions`,
      );
    },
    restoreLegalVersion(
      slug: string,
      versionId: string,
    ): Promise<LegalDocument> {
      return request(
        'POST',
        `/v1/admin/legal/${encodeURIComponent(slug)}/versions/${encodeURIComponent(versionId)}/restore`,
      );
    },
    getLegalSyncStatus(): Promise<LegalSyncStatus> {
      return request('GET', '/v1/admin/legal/sync-status');
    },
    getPublicLegalDocument(
      slug: string,
    ): Promise<PublicLegalDocument> {
      return request('GET', `/v1/legal/${encodeURIComponent(slug)}`);
    },

    // Backups: stored snapshots and maintenance.
    getBackupSummary(): Promise<BackupSummary> {
      return request('GET', '/v1/admin/backups/summary');
    },
    listStoredBackups(): Promise<{ items: StoredBackup[] }> {
      return request('GET', '/v1/admin/backups/stored');
    },
    createStoredBackup(): Promise<StoredBackup> {
      return request('POST', '/v1/admin/backups/stored');
    },
    downloadStoredBackup(id: string): Promise<{
      filename: string;
      content: string;
      backup: StoredBackup;
    }> {
      return request(
        'GET',
        `/v1/admin/backups/stored/${encodeURIComponent(id)}/download`,
      );
    },
    deleteStoredBackup(id: string): Promise<{ deleted: boolean }> {
      return request(
        'DELETE',
        `/v1/admin/backups/stored/${encodeURIComponent(id)}`,
      );
    },
    runMaintenance(action: string): Promise<MaintenanceResult> {
      return request(
        'POST',
        `/v1/admin/backups/maintenance/${encodeURIComponent(action)}`,
      );
    },
    createExport(collections?: string[]): Promise<DataExportResult> {
      return request('POST', '/v1/admin/backups', {
        collections,
      });
    },

    // Integrations: truthful per-integration checks.
    testIntegration(key: string): Promise<IntegrationTestResult> {
      return request(
        'POST',
        `/v1/admin/integrations/${encodeURIComponent(key)}/test`,
      );
    },

    // Reviews: replies, requests, public reads.
    addReviewReply(
      id: string,
      dto: ReviewReplyCreate,
    ): Promise<ProductReview> {
      return request(
        'POST',
        `/v1/admin/reviews/${encodeURIComponent(id)}/replies`,
        dto,
      );
    },
    deleteReviewReply(
      id: string,
      replyId: string,
    ): Promise<ProductReview> {
      return request(
        'DELETE',
        `/v1/admin/reviews/${encodeURIComponent(id)}/replies/${encodeURIComponent(replyId)}`,
      );
    },
    requestReview(dto: ReviewRequestCreate): Promise<CommunicationLog> {
      return request('POST', '/v1/admin/reviews/requests', dto);
    },
    listPublicReviews(
      productId: string,
    ): Promise<{ items: ProductReview[] }> {
      return request(
        'GET',
        `/v1/catalog/products/${encodeURIComponent(productId)}/reviews`,
      );
    },
  };
}

export type DosteloApiClient = ReturnType<typeof createApiClient>;
