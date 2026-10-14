export function netAmountFromGross(grossAmount: string, vatRatePercent: string) {
  const grossCents = amountToCents(grossAmount);
  const rateBasisPoints = amountToCents(vatRatePercent);
  const denominator = BigInt(10000) + rateBasisPoints;
  const netCents = (grossCents * BigInt(10000) + denominator / BigInt(2)) / denominator;
  return {
    grossAmount: formatCents(grossCents),
    netAmount: formatCents(netCents),
    vatAmount: formatCents(grossCents - netCents),
  };
}

export function pointsForAmount(netAmount: string) {
  return Number(amountToCents(netAmount) / BigInt(100));
}

export function purchaseNeedsConfirmation(amount: string, threshold: string | null) {
  if (threshold === null) return false;
  return amountToCents(amount) >= amountToCents(threshold);
}

function amountToCents(amount: string) {
  const [euros, cents = ""] = amount.split(".");
  return BigInt(euros) * BigInt(100) + BigInt((cents || "0").padEnd(2, "0").slice(0, 2));
}

function formatCents(cents: bigint) {
  return `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}
