const currencyFormatter = new Intl.NumberFormat("sk-SK", {
  style: "currency",
  currency: "EUR",
});

const dateFormatter = new Intl.DateTimeFormat("sk-SK", {
  dateStyle: "medium",
  timeZone: "Europe/Bratislava",
});

const dateTimeFormatter = new Intl.DateTimeFormat("sk-SK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Bratislava",
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}
