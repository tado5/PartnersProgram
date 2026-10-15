export type CsvValue = string | number | boolean | null | undefined;

export type CsvCell = {
  value: CsvValue;
  kind?: "decimal";
};

export function decimalCell(value: string | number): CsvCell {
  return { value, kind: "decimal" };
}

export function formatCsvDate(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} ${get("hour")}:${get("minute")}`;
}

export function serializeCsv(rows: readonly (readonly (CsvValue | CsvCell)[])[]) {
  const lines = rows.map((row) => row.map(serializeCell).join(";"));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function serializeCell(input: CsvValue | CsvCell) {
  const cell: CsvCell = input !== null && typeof input === "object" && "value" in input
    ? input as CsvCell
    : { value: input as CsvValue };
  const value = cell.value === null || cell.value === undefined
    ? ""
    : String(cell.value);
  const formatted = cell.kind === "decimal" || typeof cell.value === "number"
    ? value.replace(".", ",")
    : value;
  const safe = cell.kind === "decimal" || typeof cell.value === "number"
    ? formatted
    : neutralizeFormula(formatted);
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function neutralizeFormula(value: string) {
  return /^(?:[\s\p{Cc}]*[=+\-@]|\t|\r)/u.test(value) ? `'${value}` : value;
}
