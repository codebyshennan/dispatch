export interface KbGapEntry {
  category: string;
  maxSimilarity: number;
  ticketCount: number;
  detectedAt: string;
}

interface SessionState {
  ticketsProcessed: number;
  routingCounts: { auto_send: number; agent_assisted: number; escalate: number };
  feedbackTotal: number;
  acceptedDrafts: number;
  kbGapsDetected: KbGapEntry[];
  sessionStartedAt: string;
}

const VOC_THEMES_SEED = [
  { theme: 'FX fee confusion', severity: 'high' as const },
  { theme: 'Card limit queries', severity: 'high' as const },
  { theme: 'KYC re-verification', severity: 'medium' as const },
];

export class SessionStore {
  private state: SessionState;

  constructor() {
    this.state = {
      ticketsProcessed: 0,
      routingCounts: { auto_send: 0, agent_assisted: 0, escalate: 0 },
      feedbackTotal: 0,
      acceptedDrafts: 0,
      kbGapsDetected: [],
      sessionStartedAt: new Date().toISOString(),
    };
  }

  recordAnalysis(routing: 'auto_send' | 'agent_assisted' | 'escalate'): void {
    this.state.ticketsProcessed += 1;
    this.state.routingCounts[routing] += 1;
  }

  recordFeedback(editRatio: number): void {
    this.state.feedbackTotal += 1;
    if (editRatio < 0.20) {
      this.state.acceptedDrafts += 1;
    }
  }

  recordKbGap(category: string, maxSimilarity: number): void {
    const existing = this.state.kbGapsDetected.find((e) => e.category === category);
    if (existing) {
      existing.ticketCount += 1;
      existing.maxSimilarity = maxSimilarity;
    } else {
      this.state.kbGapsDetected.push({
        category,
        maxSimilarity,
        ticketCount: 1,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  getMetrics() {
    const { ticketsProcessed, routingCounts, feedbackTotal, acceptedDrafts, kbGapsDetected, sessionStartedAt } = this.state;
    return {
      ticketsProcessed,
      deflectionRate: routingCounts.auto_send / Math.max(ticketsProcessed, 1),
      draftAcceptanceRate: acceptedDrafts / Math.max(feedbackTotal, 1),
      routingCounts,
      kbGaps: [...kbGapsDetected].sort((a, b) => b.ticketCount - a.ticketCount),
      vocThemes: VOC_THEMES_SEED,
      sessionStartedAt,
    };
  }
}

export const sessionStore = new SessionStore();
