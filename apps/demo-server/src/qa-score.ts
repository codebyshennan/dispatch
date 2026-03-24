import type { Classification, KBResult, QAScore } from '@beacon/core';

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function computeQAScore(
  classification: Classification,
  kbArticles: KBResult[],
  draft: string,
): QAScore {
  const kbCoverage =
    (kbArticles.filter((a) => a.similarity >= 0.70).length / Math.max(kbArticles.length, 1)) * 40;

  const confidence = classification.confidence * 30;

  const complianceClean = classification.compliance_flags.length === 0 ? 20 : 0;

  const wc = wordCount(draft);
  const draftLength = wc >= 50 && wc <= 400 ? 10 : 0;

  const score = kbCoverage + confidence + complianceClean + draftLength;

  const grade: QAScore['grade'] = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';

  return { score, grade, signals: { kbCoverage, confidence, complianceClean, draftLength } };
}
