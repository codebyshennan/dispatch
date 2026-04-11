import type { ZAFClientInstance, ZAFRequestOptions } from '../../sidebar/src/contexts/ClientProvider';

// ── Reap API mock data ────────────────────────────────────────────────────────
// Realistic account data for the demo customer (Sarah Chen / ACME Holdings)
// Mock data shaped after the Reap Card Issuing (CaaS) API
// https://reap.readme.io/reference
export const REAP_MOCK = {
  customer: {
    name: 'Sarah Chen',
    email: 'sarah.chen@acme-holdings.hk',
    org: 'ACME Holdings Ltd',
    entityType: 'corporate' as const,
    since: '2023-08-01',
    tags: ['enterprise', 'kyc-verified', 'hk'],
  },
  kyc: {
    status: 'verified' as const,
    level: 2,
    verifiedAt: '2024-11-15',
    nextReviewDate: '2025-11-15',
  },
  // GET /account/balance
  account: {
    id: 'acc_hk_0042',
    availableBalance: 215_250,
    totalBalance: 500_000,
    currency: 'HKD',
    products: ['Reap Card', 'Multi-Currency Account', 'FX Payments'],
  },
  // GET /cards
  cards: [
    { id: 'crd_4821a8e3f2', last4: '4821', type: 'Corporate', status: 'active' as const, spendLimit: 50_000, spent: 12_340, holderName: 'Sarah Chen' },
    { id: 'crd_9034b7c1d4', last4: '9034', type: 'Virtual',   status: 'active' as const, spendLimit: 30_000, spent:  5_820, holderName: 'Sarah Chen' },
  ],
  // GET /cards/{cardId}/transactions
  recentTransactions: [
    { id: 'txn_8821c3d1', date: '2024-03-21', merchant: 'INTL TECH SVC',   amountHKD: 8_400,  status: 'disputed' as const, cardLast4: '4821' },
    { id: 'txn_2291a4f0', date: '2024-03-20', merchant: 'AWS Asia Pacific', amountHKD: 3_200,  status: 'cleared'  as const, cardLast4: '4821' },
    { id: 'txn_0952e7b2', date: '2024-03-18', merchant: 'Grab Singapore',   amountHKD:   450,  status: 'cleared'  as const, cardLast4: '9034' },
    { id: 'txn_4417d9c8', date: '2024-03-15', merchant: 'Stripe HK Ltd',    amountHKD: 18_900, status: 'cleared'  as const, cardLast4: '4821' },
  ],
  openTickets: 2,
};

// Module-level mutable state — fine for a demo
let currentTicketId = 'demo-init';

export function setTicketId(id: string): void {
  currentTicketId = id;
}

export const mockZAFClient: { init: () => ZAFClientInstance } = {
  init: () => ({
    context: () => Promise.resolve({ ticketId: currentTicketId }),

    request: ({ url, type, data, contentType }: ZAFRequestOptions) => {
      const actualUrl = url.replace('{{setting.api_base_url}}', import.meta.env.VITE_API_URL ?? 'http://localhost:3001');
      return fetch(actualUrl, {
        method: type,
        body: data,
        headers: contentType ? { 'Content-Type': contentType } : {},
      }).then(r => r.json());
    },

    get: (paths: string | string[]) => {
      const DEMO = {
        'ticket.requester.name': 'Sarah Chen',
        'ticket.requester.email': 'sarah.chen@acme-holdings.hk',
        'ticket.organization.name': 'ACME Holdings Ltd',
        'ticket.status': 'open',
        'ticket.tags': ['enterprise', 'kyc-verified', 'hk'],
        'currentUser.id': 'agent-001',
        'ticket.comment.text': '',
      } as Record<string, unknown>;
      const arr = Array.isArray(paths) ? paths : [paths];
      const result: Record<string, unknown> = {};
      for (const p of arr) result[p] = DEMO[p] ?? null;
      return Promise.resolve(result);
    },
    invoke: () => Promise.resolve(undefined),
    on: () => {},
    off: () => {},
  }),
};
