export interface QueryEntryAnalysis {
  category: string;
  urgency: 'P1' | 'P2' | 'P3' | 'P4';
  sentiment: number;
  routing: 'auto_send' | 'agent_assisted' | 'escalate';
}

// ── InboxTicket ───────────────────────────────────────────────────────────────
export interface InboxTicket {
  ticketId: string;
  subject: string;
  body: string;
  from: string;
  submittedAt: string;
  status: 'processing' | 'triaged' | 'sent' | 'escalated';
  analysis?: QueryEntryAnalysis;
}

// ── Sim pool entry (ticketId and submittedAt generated at tick time) ──────────
export interface SimTicketEntry {
  subject: string;
  body: string;
  from: string;
}

// ── SEED_TICKETS (~12 entries, all start as processing on mount) ──────────────
// submittedAt values are realistic past timestamps (spread over last 2 hours)
const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();

export const SEED_TICKETS: InboxTicket[] = [
  {
    ticketId: 'seed-001',
    subject: 'Urgent: freeze my Reap card immediately',
    body: "I just lost my physical card at the airport and I'm worried about unauthorized charges. My card ends in 4821. Please freeze it now.",
    from: 'james.wong@globallogistics.hk',
    submittedAt: ago(7 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-002',
    subject: 'KYC verification stuck for 3 days',
    body: 'I submitted my KYC documents 3 days ago and my account is still under review. I need to make business payments urgently. Can you tell me the status?',
    from: 'sarah.chen@hkfintech.com',
    submittedAt: ago(15 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-003',
    subject: 'Unauthorized transaction — HKD 8,400',
    body: "There's a charge of HKD 8,400 on 21 March from 'INTL TECH SVC'. I did not authorize this and want to dispute it.",
    from: 'michael.patel@reapfintech.hk',
    submittedAt: ago(22 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-004',
    subject: 'Question about USD to SGD FX rates',
    body: 'I need to transfer USD 50,000 to a supplier in Singapore. What is your current rate and are there any fees?',
    from: 'alice.lam@hklogistics.com',
    submittedAt: ago(35 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-005',
    subject: 'Formal complaint — threatening legal action',
    body: 'I have been waiting 2 weeks for my refund. I am contacting my solicitor and filing a complaint with the SFC if this is not resolved today.',
    from: 'james.wong@globallogistics.hk',
    submittedAt: ago(48 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-006',
    subject: 'Account locked after failed login attempts',
    body: 'My account has been locked. I tried to log in several times and now I cannot access it. Please help me unlock it.',
    from: 'priya.nair@hkfintech.com',
    submittedAt: ago(55 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-007',
    subject: 'Stablecoin transfer confirmation delayed',
    body: 'I sent USDC to an external wallet 2 hours ago and it has not arrived. The transaction hash is 0xabc123. Can you check the status?',
    from: 'david.ng@reapfintech.hk',
    submittedAt: ago(63 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-008',
    subject: 'General question about virtual card limits',
    body: 'What is the maximum daily spend limit for virtual cards on the business plan? I need to make a large vendor payment.',
    from: 'alice.lam@hklogistics.com',
    submittedAt: ago(75 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-009',
    subject: 'Cannot add new team member to account',
    body: 'I am trying to invite a new finance team member but the invite button is greyed out. We are on the Pro plan. Is this a known issue?',
    from: 'sarah.chen@hkfintech.com',
    submittedAt: ago(88 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-010',
    subject: 'EUR payment failed — supplier urgent',
    body: 'My EUR wire to a German supplier failed this morning. Error code: IBAN_INVALID. The IBAN I have is DE89370400440532013000. Is it correct?',
    from: 'michael.patel@reapfintech.hk',
    submittedAt: ago(100 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-011',
    subject: 'Request for transaction history export',
    body: 'I need a full CSV export of all transactions from January to March 2026 for our annual audit. How do I download this?',
    from: 'priya.nair@hkfintech.com',
    submittedAt: ago(112 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-012',
    subject: 'Card declined at overseas merchant',
    body: 'My Reap card was declined at a hotel in Tokyo yesterday even though I have sufficient balance. Is there a restriction on overseas transactions?',
    from: 'david.ng@reapfintech.hk',
    submittedAt: ago(120 * 60000),
    status: 'processing',
  },
];

// ── SIM_TICKETS pool (~20 entries, ticketId and submittedAt generated at tick) ─
export const SIM_TICKETS: SimTicketEntry[] = [
  {
    subject: 'Urgent: freeze my Reap card',
    body: 'I dropped my wallet on the MTR. Please freeze card ending 7734 immediately.',
    from: 'kevin.leung@hklogistics.com',
  },
  {
    subject: 'KYC documents submitted — no response',
    body: 'I uploaded my passport and proof of address 5 days ago. My account is still restricted. Please advise.',
    from: 'wendy.ho@fintech-hk.com',
  },
  {
    subject: 'Suspicious charge on my account',
    body: 'I see a charge of HKD 2,200 from ONLINE STORE on 23 March that I did not make. Please investigate and issue a refund.',
    from: 'raymond.chan@reapfintech.hk',
  },
  {
    subject: 'FX rate for JPY transfer',
    body: 'What is your HKD to JPY rate today? I need to pay a supplier in Japan approximately HKD 100,000.',
    from: 'julia.tam@globalcorp.hk',
  },
  {
    subject: 'Threatening to escalate to regulator',
    body: 'This is my third complaint. My account has been suspended without explanation for 10 days. I am now contacting the HKMA.',
    from: 'kevin.leung@hklogistics.com',
  },
  {
    subject: 'Virtual card not working online',
    body: 'My virtual card keeps getting declined for online purchases. Physical card works fine. I have tried 3 different merchants.',
    from: 'wendy.ho@fintech-hk.com',
  },
  {
    subject: 'USDT withdrawal pending for 4 hours',
    body: 'I initiated a USDT withdrawal 4 hours ago and it is still showing pending. Amount: 10,000 USDT. TX reference: TXN-9921.',
    from: 'raymond.chan@reapfintech.hk',
  },
  {
    subject: 'How do I upgrade to the Enterprise plan?',
    body: 'We are a team of 15 and need to upgrade from Business to Enterprise. What is the pricing and process?',
    from: 'julia.tam@globalcorp.hk',
  },
  {
    subject: 'Duplicate transaction on statement',
    body: 'I see the same HKD 3,500 charge from CLOUD SERVICES appearing twice on 20 March. I only made one payment.',
    from: 'ben.yeung@hkfintech.com',
  },
  {
    subject: 'Card expired — replacement not received',
    body: 'My card expired last week and I have not received a replacement. I need it urgently for business travel next Monday.',
    from: 'cynthia.wu@reapfintech.hk',
  },
  {
    subject: 'GBP wire returned — reason unknown',
    body: 'A GBP 15,000 wire to a UK supplier was returned today. No reason given in the notification. Can you investigate?',
    from: 'ben.yeung@hkfintech.com',
  },
  {
    subject: 'Two-factor authentication not working',
    body: 'I am not receiving SMS OTP codes when logging in. I have tried multiple times. My phone number is +852 9xxx.',
    from: 'cynthia.wu@reapfintech.hk',
  },
  {
    subject: 'Refund not received after 14 days',
    body: 'I returned goods to a merchant on 10 March and the refund of HKD 6,800 has still not appeared on my account.',
    from: 'kevin.leung@hklogistics.com',
  },
  {
    subject: 'Request for formal invoice',
    body: 'I need a formal VAT invoice for our subscription fees paid in Q1 2026 for accounting purposes. How do I request this?',
    from: 'wendy.ho@fintech-hk.com',
  },
  {
    subject: 'Account access denied — compliance hold',
    body: 'I received an email saying my account is under a compliance review. I have been unable to access it for 3 days.',
    from: 'raymond.chan@reapfintech.hk',
  },
  {
    subject: 'USD receiving account details',
    body: 'I need to share USD receiving bank details with a US client. Where do I find the routing number and account number?',
    from: 'julia.tam@globalcorp.hk',
  },
  {
    subject: 'Card spend limit increase request',
    body: 'Our monthly card spend is approaching the limit. We need to increase it from HKD 500,000 to HKD 1,000,000 for next month.',
    from: 'ben.yeung@hkfintech.com',
  },
  {
    subject: 'ETH transfer not confirming',
    body: 'I sent 2.5 ETH from my Reap wallet 6 hours ago. The recipient says they have not received it. TX hash: 0xdef456.',
    from: 'cynthia.wu@reapfintech.hk',
  },
  {
    subject: 'Wrong currency charged on hotel stay',
    body: 'I was charged in USD instead of HKD for a hotel in Hong Kong. This resulted in an unfavourable FX conversion. I want a refund of the difference.',
    from: 'kevin.leung@hklogistics.com',
  },
  {
    subject: 'Payroll batch failed overnight',
    body: 'Our scheduled payroll batch for 47 employees failed last night. The error message says INSUFFICIENT_FUNDS but our balance is HKD 2.3M.',
    from: 'wendy.ho@fintech-hk.com',
  },
];
