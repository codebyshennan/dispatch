import { describe, it, expect } from 'vitest';
import { computeQAScore } from '../qa-score.js';
import type { Classification, KBResult } from '@beacon/core';

const baseClassification: Classification = {
  category: 'fx_inquiry',
  sub_category: 'rate_query',
  urgency: 'P3',
  sentiment: 0.0,
  language: 'en',
  confidence: 1.0,
  compliance_flags: [],
  crypto_specific_tags: [],
};

const highSimilarityArticle: KBResult = {
  article_id: 1,
  title: 'FX rates guide',
  html_url: 'https://help.example.com/fx',
  updated_at: '2024-01-01T00:00:00Z',
  text: 'FX rates explained...',
  similarity: 0.85,
};

const lowSimilarityArticle: KBResult = {
  ...highSimilarityArticle,
  article_id: 2,
  similarity: 0.55,
};

function makeDraft(wordCount: number): string {
  return Array(wordCount).fill('word').join(' ');
}

describe('computeQAScore', () => {
  it('returns high grade for ideal inputs', () => {
    const score = computeQAScore(baseClassification, [highSimilarityArticle], makeDraft(100));
    expect(score.grade).toBe('high');
    expect(score.score).toBeGreaterThanOrEqual(75);
  });

  describe('kbCoverage signal (max 40 pts)', () => {
    it('awards full 40pts when all articles above 0.70 similarity', () => {
      const score = computeQAScore(baseClassification, [highSimilarityArticle, highSimilarityArticle], makeDraft(100));
      expect(score.signals.kbCoverage).toBe(40);
    });

    it('awards partial pts for mixed similarity', () => {
      const score = computeQAScore(baseClassification, [highSimilarityArticle, lowSimilarityArticle], makeDraft(100));
      // 1 of 2 articles >= 0.70 → (1/2)*40 = 20
      expect(score.signals.kbCoverage).toBe(20);
    });

    it('awards 0pts when no articles returned', () => {
      const score = computeQAScore(baseClassification, [], makeDraft(100));
      expect(score.signals.kbCoverage).toBe(0);
    });
  });

  describe('confidence signal (max 30 pts)', () => {
    it('scales linearly with classification confidence', () => {
      const lowConf = { ...baseClassification, confidence: 0.5 };
      const score = computeQAScore(lowConf, [highSimilarityArticle], makeDraft(100));
      expect(score.signals.confidence).toBeCloseTo(15);
    });
  });

  describe('complianceClean signal (0 or 20 pts)', () => {
    it('awards 20pts when no compliance flags', () => {
      const score = computeQAScore(baseClassification, [highSimilarityArticle], makeDraft(100));
      expect(score.signals.complianceClean).toBe(20);
    });

    it('awards 0pts when compliance flags present', () => {
      const withFlags = { ...baseClassification, compliance_flags: ['pii_detected'] };
      const score = computeQAScore(withFlags, [highSimilarityArticle], makeDraft(100));
      expect(score.signals.complianceClean).toBe(0);
    });
  });

  describe('draftLength signal (0 or 10 pts)', () => {
    it('awards 10pts for draft with 50-400 words', () => {
      expect(computeQAScore(baseClassification, [], makeDraft(50)).signals.draftLength).toBe(10);
      expect(computeQAScore(baseClassification, [], makeDraft(400)).signals.draftLength).toBe(10);
      expect(computeQAScore(baseClassification, [], makeDraft(200)).signals.draftLength).toBe(10);
    });

    it('awards 0pts for draft below 50 words', () => {
      expect(computeQAScore(baseClassification, [], makeDraft(49)).signals.draftLength).toBe(0);
    });

    it('awards 0pts for draft above 400 words', () => {
      expect(computeQAScore(baseClassification, [], makeDraft(401)).signals.draftLength).toBe(0);
    });
  });

  describe('grade thresholds', () => {
    it('grade is medium for score 50-74', () => {
      // confidence=0.5 (15pts) + compliance=20 + draftLength=10 = 45 → low
      // tweak: confidence=0.67 (20pts) + compliance=20 + draftLength=10 = 50 → medium
      const cls = { ...baseClassification, confidence: 0.67, compliance_flags: [] };
      const score = computeQAScore(cls, [], makeDraft(100));
      expect(score.grade).toBe('medium');
    });

    it('grade is low for score below 50', () => {
      const cls = { ...baseClassification, confidence: 0.0, compliance_flags: ['flag'] };
      // kbCoverage=0, confidence=0, compliance=0, draftLength=10 → 10 → low
      const score = computeQAScore(cls, [], makeDraft(100));
      expect(score.grade).toBe('low');
    });
  });

  it('total score equals sum of all signals', () => {
    const score = computeQAScore(baseClassification, [highSimilarityArticle], makeDraft(100));
    const sum = score.signals.kbCoverage + score.signals.confidence + score.signals.complianceClean + score.signals.draftLength;
    expect(score.score).toBeCloseTo(sum);
  });
});
