export const AUDIT_PAGE_SIZE = 20;

export const auditActionLabels: Record<string, string> = {
  "auth.login": "Prihlásenie",
  "auth.login_failed": "Neúspešné prihlásenie",
  "company.activate": "Aktivácia firmy",
  "company.context_select": "Vstup do firemného programu",
  "company.create": "Vytvorenie firmy",
  "company.deactivate": "Deaktivácia firmy",
  "company.update": "Zmena firmy alebo nastavení",
  "company.logo_update": "Zmena loga firmy",
  "company.logo_delete": "Odstránenie loga firmy",
  "company.privacy_draft_update": "Uloženie návrhu informačného oznámenia",
  "company.privacy_publish": "Publikovanie informačného oznámenia",
  "export.csv": "Export CSV",
  "export.report_pdf": "Export PDF reportu",
  "export.partner_card": "Export partnerskej karty",
  "partner.activate": "Aktivácia partnera",
  "partner.create": "Vytvorenie partnera",
  "partner.deactivate": "Deaktivácia partnera",
  "partner.update": "Úprava partnera",
  "partner.privacy_provided": "Záznam poskytnutia informácií partnerovi",
  "purchase.create": "Zápis nákupu",
  "purchase.delete": "Zmazanie nákupu",
  "purchase.update": "Úprava nákupu",
  "token.create": "Vytvorenie tokenu",
  "token.open": "Otvorenie QR/NFC prístupu",
  "token.deactivate": "Deaktivácia tokenu",
  "user.create": "Vytvorenie používateľa",
  "user.password_change": "Zmena hesla",
  "user.password_reset": "Reset hesla",
  "user.update": "Zmena používateľa",
};

export const auditEntityLabels: Record<string, string> = {
  auth: "Prihlásenie",
  company: "Firma",
  export: "Export",
  partner: "Partner",
  purchase: "Nákup",
  token: "Token",
  user: "Používateľ",
};

const auditFieldLabels: Record<string, string> = {
  action: "Akcia",
  active: "Stav partnera",
  amount: "Suma s DPH",
  bronzeMonthlyTurnoverEur: "Hranica bronzového odznaku",
  code: "Kód",
  contactPerson: "Kontaktná osoba",
  displayName: "Zobrazované meno",
  email: "E-mail",
  entityId: "ID záznamu",
  entityType: "Typ záznamu",
  filters: "Filtre exportu",
  format: "Formát exportu",
  from: "Od",
  goldMonthlyTurnoverEur: "Hranica zlatého odznaku",
  ico: "IČO",
  internalNote: "Interná poznámka",
  includeDeleted: "Vrátane zmazaných",
  isActive: "Aktívny",
  isDeleted: "Zmazaný",
  label: "Označenie",
  logoVersion: "Verzia loga",
  noticeId: "ID informačného oznámenia",
  receiptId: "ID záznamu informovania",
  providedAt: "Informácie poskytnuté",
  publishedAt: "Publikované",
  version: "Verzia oznámenia",
  privacy: "Evidencia informovania",
  method: "Spôsob",
  month: "Mesiac",
  name: "Meno",
  netAmount: "Suma bez DPH",
  note: "Poznámka",
  partnerId: "Partner",
  partnerPresent: "Partner prítomný",
  points: "Body",
  purchaseConfirmAboveEur: "Limit potvrdenia nákupu",
  purchasedAt: "Dátum nákupu",
  q: "Vyhľadávanie",
  reason: "Dôvod",
  role: "Rola",
  rowCount: "Počet riadkov",
  silverMonthlyTurnoverEur: "Hranica strieborného odznaku",
  slug: "Slug",
  tokenHint: "Nápoveda tokenu",
  to: "Do",
  type: "Typ",
  userId: "ID používateľa",
  vatRatePercent: "Sadzba DPH",
};

const sensitiveAuditFields = new Set([
  "contactperson",
  "email",
  "internalnote",
  "note",
  "phone",
]);

export function isSensitiveAuditField(key: string) {
  return sensitiveAuditFields.has(normalizeAuditKey(key));
}

export function isSecretAuditField(key: string) {
  const normalized = normalizeAuditKey(key);
  if (/password|passwd|secret|authorization|cookie|csrf/.test(normalized)) return true;
  return normalized.includes("token") && !/(tokenhint|tokenid|tokentype)$/.test(normalized);
}

export type AuditField = {
  key: string;
  label: string;
  value: string;
};

export type AuditJsonValue = string | number | boolean | null | AuditJsonObject | AuditJsonValue[];
export type AuditJsonObject = { [key: string]: AuditJsonValue };

export function sanitizeAuditValues(value: unknown): AuditJsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return sanitizeAuditObject(value);
}

function sanitizeAuditObject(value: object): AuditJsonObject {
  const safe: AuditJsonObject = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (isSecretAuditField(key)) continue;
    safe[key] = isSensitiveAuditField(key) ? "Skryté" : sanitizeAuditValue(fieldValue);
  }
  return safe;
}

function sanitizeAuditValue(value: unknown): AuditJsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (typeof value === "object") return sanitizeAuditObject(value);
  return String(value);
}

function normalizeAuditKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function publicAuditFields(value: unknown): AuditField[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value).flatMap(([key, fieldValue]) => {
    if (!auditFieldLabels[key] || isSecretAuditField(key)) return [];
    if (isSensitiveAuditField(key)) {
      return [{ key, label: auditFieldLabels[key], value: "Skryté" }];
    }
    if (fieldValue === null) return [{ key, label: auditFieldLabels[key], value: "—" }];
    if (typeof fieldValue === "boolean") {
      return [{ key, label: auditFieldLabels[key], value: fieldValue ? "Áno" : "Nie" }];
    }
    if (typeof fieldValue === "string" || typeof fieldValue === "number") {
      return [{ key, label: auditFieldLabels[key], value: String(fieldValue).slice(0, 255) }];
    }
    if (key === "filters" && fieldValue && typeof fieldValue === "object" && !Array.isArray(fieldValue)) {
      return [{ key, label: auditFieldLabels[key], value: JSON.stringify(publicAuditValues(fieldValue)) }];
    }
    return [];
  });
}

export function publicAuditValues(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, fieldValue]) => {
      if (!auditFieldLabels[key] || isSecretAuditField(key)) return [];
      if (isSensitiveAuditField(key)) return [[key, "Skryté"]];
      if (fieldValue === null || typeof fieldValue === "string" ||
          typeof fieldValue === "number" || typeof fieldValue === "boolean") {
        return [[key, fieldValue]];
      }
      if (key === "filters" && fieldValue && typeof fieldValue === "object" && !Array.isArray(fieldValue)) {
        return [[key, JSON.stringify(publicAuditValues(fieldValue))]];
      }
      return [];
    }),
  );
}
