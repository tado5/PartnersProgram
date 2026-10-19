import type { z } from "zod";

const fieldLabels: Record<string, string> = {
  name: "Meno / názov",
  email: "E-mail",
  password: "Heslo",
  currentPassword: "Súčasné heslo",
  newPassword: "Nové heslo",
  temporaryPassword: "Dočasné heslo",
  "admin.name": "Meno prvého admina",
  "admin.email": "E-mail prvého admina",
  "admin.temporaryPassword": "Dočasné heslo prvého admina",
  role: "Rola",
  type: "Typ",
  displayName: "Zobrazované meno",
  phone: "Telefón",
  contactPerson: "Kontaktná osoba",
  ico: "IČO",
  internalNote: "Interná poznámka",
  amount: "Suma nákupu s DPH",
  partnerPresent: "Prítomnosť partnera",
  purchasedAt: "Dátum a čas nákupu",
  partnerId: "Partner",
  tokenId: "QR / NFC token",
  source: "Spôsob zápisu",
  note: "Interná poznámka",
  reason: "Dôvod",
  deactivationReason: "Dôvod deaktivácie",
  label: "Označenie",
  deactivateTokenIds: "Tokeny na deaktiváciu",
  slug: "Slug firmy",
  companyId: "Firma",
  vatRatePercent: "Sadzba DPH firmy",
  purchaseConfirmAboveEur: "Limit potvrdenia nákupu",
  bronzeMonthlyTurnoverEur: "Hranica bronzového partnera",
  silverMonthlyTurnoverEur: "Hranica strieborného partnera",
  goldMonthlyTurnoverEur: "Hranica zlatého partnera",
  controllerName: "Prevádzkovateľ",
  controllerAddress: "Sídlo prevádzkovateľa",
  controllerIco: "IČO prevádzkovateľa",
  contactEmail: "Kontaktný e-mail pre ochranu údajov",
  dpoContact: "Zodpovedná osoba",
  body: "Informačné oznámenie",
  privacy: "Poskytnutie informácií o spracúvaní údajov",
  "privacy.noticeId": "Verzia informačného oznámenia",
  "privacy.method": "Spôsob poskytnutia oznámenia",
  "privacy.providedAt": "Dátum a čas poskytnutia oznámenia",
  "privacy.reason": "Dôvod ďalšieho záznamu alebo opravy",
  noticeId: "Verzia informačného oznámenia",
  method: "Spôsob poskytnutia oznámenia",
  providedAt: "Dátum a čas poskytnutia oznámenia",
  expectedUpdatedAt: "Uložený návrh oznámenia",
  idempotencyKey: "Identifikátor zápisu",
  from: "Od dátumu",
  to: "Do dátumu",
  entityId: "ID záznamu",
  userId: "Používateľ",
  file: "Logo firmy",
  highAmountConfirmed: "Potvrdenie správnosti sumy",
};

export function fieldLabel(field: string) {
  return fieldLabels[field] ?? fieldLabels[field.split(".").at(-1) ?? ""] ?? (field || "Formulár");
}

export function fieldFormatHint(field: string) {
  const key = field.split(".").at(-1);
  if (key === "phone") return "Zadajte slovenské telefónne číslo, napr. +421 903 123 456.";
  if (key === "ico" || key === "controllerIco") return "Zadajte presne 8 číslic.";
  if (key === "slug") return "Použite malé písmená bez diakritiky, číslice a pomlčky medzi slovami.";
  if (key === "amount" || key === "purchaseConfirmAboveEur") return "Zadajte sumu od 0,01 do 999 999,99 € s najviac 2 desatinnými miestami.";
  if (key?.endsWith("MonthlyTurnoverEur")) return "Zadajte sumu od 0,01 do 99 999 999,99 € s najviac 2 desatinnými miestami.";
  if (key === "vatRatePercent") return "Zadajte sadzbu od 0 do 100 % s najviac 2 desatinnými miestami.";
  if (key === "purchasedAt" || key === "providedAt" || key === "expectedUpdatedAt") return "Zadajte platný dátum a čas.";
  if (key?.endsWith("Id")) return "Zadajte platné kladné číselné ID.";
  return "Zadajte hodnotu v požadovanom formáte.";
}

export function characterCount(count: number | bigint) {
  return `${count} ${count === 1 ? "znak" : count === 2 || count === 3 || count === 4 ? "znaky" : "znakov"}`;
}

function issueMessage(issue: z.core.$ZodIssue, field: string) {
  if (issue.code === "custom" && issue.message !== "Invalid input") return issue.message;
  if (issue.code === "too_small") {
    if (issue.origin === "string") return `Zadajte aspoň ${characterCount(issue.minimum)}.`;
    return `Hodnota musí byť aspoň ${issue.minimum}.`;
  }
  if (issue.code === "too_big") {
    if (issue.origin === "string") return `Zadajte najviac ${characterCount(issue.maximum)}.`;
    if (issue.origin === "array") return `Vyberte najviac ${issue.maximum} položiek.`;
    return `Hodnota môže byť najviac ${issue.maximum}.`;
  }
  if (issue.code === "invalid_format") {
    if (issue.format === "email") return "Zadajte platnú e-mailovú adresu.";
    if (issue.format === "datetime") return "Zadajte platný dátum a čas.";
    return fieldFormatHint(field);
  }
  if (issue.code === "invalid_value") return "Vyberte jednu z dostupných možností.";
  if (issue.code === "unrecognized_keys") return "Formulár obsahuje nepodporované polia. Obnovte stránku a skúste znova.";
  if (issue.code === "invalid_type") return issue.expected === "date" ? "Zadajte platný dátum a čas." : "Vyplňte platnú hodnotu.";
  return fieldFormatHint(field);
}

export function validationFields(issues: readonly z.core.$ZodIssue[]) {
  return issues.map((issue) => {
    const field = issue.path.join(".");
    return { field, message: issueMessage(issue, field) };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function formatApiError(error: unknown, fallback: string): string {
  if (!isRecord(error)) return fallback;
  const message = typeof error.message === "string" && error.message ? error.message : fallback;
  if (!Array.isArray(error.fields)) return message;
  const details = error.fields.flatMap((item: unknown) =>
    isRecord(item) && typeof item.field === "string" && typeof item.message === "string"
      ? [`${fieldLabel(item.field)}: ${item.message}`]
      : [],
  );
  return details.length ? `${message} ${[...new Set(details)].join(" ")}` : message;
}
