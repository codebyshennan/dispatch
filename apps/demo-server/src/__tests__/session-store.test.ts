import { describe, it, expect, beforeEach } from 'vitest';
import { SessionStore } from '../session-store.js';

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  it('returns zeroed counters on init', () => {
    const m = store.getMetrics();
    expect(m.ticketsProcessed).toBe(0);
    expect(m.deflectionRate).toBe(0);
    expect(m.draftAcceptanceRate).toBe(0);
    expect(m.routingCounts).toEqual({ auto_send: 0, agent_assisted: 0, escalate: 0 });
    expect(m.kbGaps).toEqual([]);
  });

  describe('recordAnalysis', () => {
    it('increments ticketsProcessed and routing bucket', () => {
      store.recordAnalysis('auto_send');
      store.recordAnalysis('auto_send');
      store.recordAnalysis('escalate');
      const m = store.getMetrics();
      expect(m.ticketsProcessed).toBe(3);
      expect(m.routingCounts.auto_send).toBe(2);
      expect(m.routingCounts.escalate).toBe(1);
      expect(m.routingCounts.agent_assisted).toBe(0);
    });

    it('computes deflectionRate as auto_send / ticketsProcessed', () => {
      store.recordAnalysis('auto_send');
      store.recordAnalysis('agent_assisted');
      store.recordAnalysis('agent_assisted');
      const m = store.getMetrics();
      expect(m.deflectionRate).toBeCloseTo(1 / 3);
    });
  });

  describe('recordFeedback', () => {
    it('increments feedbackTotal on every call', () => {
      store.recordFeedback(0.5);
      store.recordFeedback(0.1);
      const m = store.getMetrics();
      expect(m.draftAcceptanceRate).toBeCloseTo(0.5); // 1 accepted out of 2
    });

    it('counts editRatio < 0.20 as accepted draft', () => {
      store.recordFeedback(0.19);
      store.recordFeedback(0.20); // boundary — NOT accepted
      store.recordFeedback(0.0);
      const m = store.getMetrics();
      // 2 accepted (0.19, 0.0), 1 not (0.20)
      expect(m.draftAcceptanceRate).toBeCloseTo(2 / 3);
    });

    it('returns 0 acceptance rate when no feedback submitted', () => {
      expect(store.getMetrics().draftAcceptanceRate).toBe(0);
    });
  });

  describe('recordKbGap', () => {
    it('inserts a new gap entry', () => {
      store.recordKbGap('fx_inquiry', 0.45);
      const m = store.getMetrics();
      expect(m.kbGaps).toHaveLength(1);
      expect(m.kbGaps[0].category).toBe('fx_inquiry');
      expect(m.kbGaps[0].maxSimilarity).toBe(0.45);
      expect(m.kbGaps[0].ticketCount).toBe(1);
    });

    it('upserts existing gap — increments ticketCount and updates maxSimilarity', () => {
      store.recordKbGap('fx_inquiry', 0.45);
      store.recordKbGap('fx_inquiry', 0.38);
      const m = store.getMetrics();
      expect(m.kbGaps).toHaveLength(1);
      expect(m.kbGaps[0].ticketCount).toBe(2);
      expect(m.kbGaps[0].maxSimilarity).toBe(0.38); // updated to latest
    });

    it('tracks multiple distinct categories', () => {
      store.recordKbGap('fx_inquiry', 0.45);
      store.recordKbGap('kyc', 0.0);
      const m = store.getMetrics();
      expect(m.kbGaps).toHaveLength(2);
    });

    it('sorts kbGaps by ticketCount descending', () => {
      store.recordKbGap('kyc', 0.3);
      store.recordKbGap('fx_inquiry', 0.4);
      store.recordKbGap('fx_inquiry', 0.35);
      const m = store.getMetrics();
      expect(m.kbGaps[0].category).toBe('fx_inquiry'); // 2 tickets
      expect(m.kbGaps[1].category).toBe('kyc');         // 1 ticket
    });
  });

  it('sessionStartedAt is an ISO timestamp set on construction', () => {
    const m = store.getMetrics();
    expect(new Date(m.sessionStartedAt).getTime()).not.toBeNaN();
  });
});
