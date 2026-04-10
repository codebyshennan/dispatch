export const POLICY = {
  MAX_LIMIT_SGD: 5000,
  MIN_LIMIT_SGD: 0,
  APPROVAL_THRESHOLD_ITEMS: 25,
  MAX_BULK_ITEMS: 200,
  EXCLUDED_STATUSES: ["frozen", "cancelled"] as const,
} as const;

export type CardInput = {
  cardId: string;
  cardholderName: string;
  status: string;
  currentLimit: { currency: string; amount: number };
};

export type PolicyCheckResult = {
  allowed: boolean;
  approvalRequired: boolean;
  notes: string[];
  excludedCardIds: string[];
};

export function checkPolicy(
  cards: CardInput[],
  newLimit: { currency: string; amount: number }
): PolicyCheckResult {
  // Hard block: limit exceeds maximum
  if (newLimit.amount > POLICY.MAX_LIMIT_SGD) {
    return {
      allowed: false,
      approvalRequired: false,
      notes: [
        `Requested limit SGD ${newLimit.amount} exceeds maximum allowed SGD ${POLICY.MAX_LIMIT_SGD}`,
      ],
      excludedCardIds: [],
    };
  }

  // Identify excluded cards
  const excludedCardIds: string[] = [];
  const notes: string[] = [];

  for (const card of cards) {
    if ((POLICY.EXCLUDED_STATUSES as readonly string[]).includes(card.status)) {
      excludedCardIds.push(card.cardId);
      notes.push(`Card ${card.cardId} excluded: status is ${card.status}`);
    }
  }

  const eligibleCount = cards.length - excludedCardIds.length;

  // Hard block: eligible count exceeds absolute max
  if (eligibleCount > POLICY.MAX_BULK_ITEMS) {
    return {
      allowed: false,
      approvalRequired: false,
      notes: [`Bulk operation of ${eligibleCount} items exceeds maximum of ${POLICY.MAX_BULK_ITEMS}`],
      excludedCardIds,
    };
  }

  // Soft gate: approval required above threshold
  const approvalRequired = eligibleCount > POLICY.APPROVAL_THRESHOLD_ITEMS;
  if (approvalRequired) {
    notes.push(
      `${eligibleCount} eligible cards exceeds approval threshold of ${POLICY.APPROVAL_THRESHOLD_ITEMS}. Approval required.`
    );
  }

  return { allowed: true, approvalRequired, notes, excludedCardIds };
}
