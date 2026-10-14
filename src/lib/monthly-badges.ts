export type BadgeTier = "bronze" | "silver" | "gold";

export type BadgeThresholds = {
  bronzeMonthlyTurnoverEur: string | null;
  silverMonthlyTurnoverEur: string | null;
  goldMonthlyTurnoverEur: string | null;
};

const badgeLabels: Record<BadgeTier, string> = {
  bronze: "Bronzový partner",
  silver: "Strieborný partner",
  gold: "Zlatý partner",
};

export function getMonthlyBadge(
  monthlyAmount: string,
  thresholds: BadgeThresholds,
) {
  const active = ([
    ["bronze", thresholds.bronzeMonthlyTurnoverEur],
    ["silver", thresholds.silverMonthlyTurnoverEur],
    ["gold", thresholds.goldMonthlyTurnoverEur],
  ] as const).filter((entry): entry is readonly [BadgeTier, string] => entry[1] !== null);
  const amountCents = toCents(monthlyAmount);
  const achieved = [...active].reverse().find(([, threshold]) => amountCents >= toCents(threshold));
  const next = active.find(([, threshold]) => amountCents < toCents(threshold));
  const tier = achieved?.[0] ?? null;

  return {
    tier,
    label: tier ? badgeLabels[tier] : null,
    monthlyAmount,
    nextThreshold: next?.[1] ?? null,
  };
}

export function badgeLabel(tier: BadgeTier) {
  return badgeLabels[tier];
}

export function toCents(amount: string) {
  const [whole, fraction = "00"] = amount.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}
