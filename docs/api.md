# API

> Súvisí s: [IMPLEMENTACNY_PLAN.md](../IMPLEMENTACNY_PLAN.md) · [security](security.md) · [screens](screens.md)

API tvoria Route Handlers v `src/app/api/` v tej istej Next.js aplikácii.

> **Fázy 5A–9 implementované:** `/api/superadmin/*`, používatelia, partneri, tokeny, nákupy, reporty a firemný audit sú dostupné a firemne izolované. CSV exporty zostávajú ďalšou fázou.

## Spoločné pravidlá
- JSON; chyba má tvar `{ error: { code, message, fields? } }`.
- Kódy: `200/201`, `400` validácia, `401` neprihlásený, `403` nedostatočná rola, `404`, `405`, `409` konflikt alebo duplicitné odoslanie, `429` obmedzenie počtu požiadaviek.
- Stránkovanie: `?page=&pageSize=` → `{ items, page, pageSize, total }`.
- Každý zápisový endpoint postupuje takto: session → rola a firemný kontext → kontrola `Origin` → Zod → service → audit v transakcii.
- **Body (`points`) klient nikdy neposiela.**
- Legenda rolí: **SA** = superadmin, **A** = admin vlastnej firmy, **P** = predavač vlastnej firmy, **–** = verejné. Pri firemných endpointoch SA môže používať všetky oprávnenia A, ale len vo výslovne vybranej firme.
- Firemné endpointy nikdy nevracajú dáta všetkých firiem: A/P majú firmu zo serverom overeného účtu; SA musí poslať `X-Company-Id` overené serverom. Bez výberu firmy SA dostane `400 COMPANY_CONTEXT_REQUIRED`. Firemné payloady nesmú prideľovať `companyId` ani globálne roly; pokus o zmenu kontextu A/P sa odmietne.
- Firemné payloady sú strict Zod schémy. UI SA posiela tiež `X-Company-Selection`, ktoré musí zodpovedať podpísanej cookie aktuálneho výberu; starý formulár vráti `409 COMPANY_CONTEXT_CHANGED`. Samostatný API klient SA musí vždy explicitne zadať `X-Company-Id` a nespolieha sa na page cookie.
- Všetky ID vrátane vnorených ID a filtrov musia patriť aktuálnej firme; cudzie ID vráti `404 NOT_FOUND`. Čítania, vyhľadávania, súčty, CSV, audit a konflikty idempotencie sú filtrované rovnako.
- Neaktívna firma zablokuje firemný prístup A/P (`403 COMPANY_INACTIVE`). SA môže firmu spravovať a čítať/exportovať históriu; vydanie tokenu a vytvorenie/úprava/zmazanie nákupu vrátia `409 COMPANY_INACTIVE`.

## 0. Firmy a superadmin
| Metóda | Endpoint | Rola | Účel |
|---|---|---|---|
| GET | `/api/superadmin/companies?q=&active=&page=&pageSize=` | SA | zoznam firiem, názov, slug, IČO, stav, počet používateľov/partnerov |
| POST | `/api/superadmin/companies` | SA | `{ name, slug, ico?, admin: { email, name, temporaryPassword } }` – firma a prvý admin v jednej transakcii, s auditom |
| GET | `/api/superadmin/companies/{id}` | SA | detail firmy a jej admini |
| PATCH | `/api/superadmin/companies/{id}` | SA | `{ name?, ico? }`; slug zostáva nemenný. Sadzbu DPH, limit potvrdenia a hranice odznakov superadmin nemení – nastavuje ich iba admin firmy |
| POST | `/api/superadmin/companies/{id}/deactivate` | SA | `{ reason }` – pozastavenie programu bez zmazania dát |
| POST | `/api/superadmin/companies/{id}/activate` | SA | aktivácia, iba ak má firma aktívneho admina |
| POST | `/api/superadmin/company-context` | SA | `{ companyId }` – výber existujúcej firmy pre SSR/Server Actions, podpísaná HttpOnly cookie, audit vstupu |
| DELETE | `/api/superadmin/company-context` | SA | ukončenie kontextu a návrat do platformovej správy; nejde o mazanie firmy |
| GET | `/api/superadmin/audit-logs?companyId=&from=&to=&page=` | SA | platformový audit a audit vybranej firmy; citlivé údaje a plné tokeny sa nevracajú |
| GET/PATCH | `/api/company/settings` | GET: A, SA vo vybranej firme; PATCH: **iba A** (SA dostane 403) | `{ vatRatePercent, purchaseConfirmAboveEur, bronzeMonthlyTurnoverEur, silverMonthlyTurnoverEur, goldMonthlyTurnoverEur }`; sadzba DPH predvolene 23 % a platí pre nové nákupy; odznaky sa vypínajú `null` a hranice sú bez DPH; zmena sa audituje |

Založenie firmy s už použitým slugom/e-mailom vráti `409` bez čiastočného založenia firmy alebo admina. Fyzické mazanie firmy ani API na vytváranie superadminov nie je v MVP. Prvý superadmin sa vytvorí jednorazovým bezpečným bootstrapom.

Platformový audit vracia stránkované metadáta udalostí (ID, aktér, firma, akcia, entita, dôvod, čas), nie neoverené historické JSON hodnoty. Bez `companyId` ide iba o platformové udalosti s NULL firmou. Dátumové filtre `from`/`to` sú kalendárne dni vrátane oboch hraníc v `APP_TIMEZONE`.

## 1. Autentifikácia a používatelia
| Metóda | Endpoint | Rola | Účel |
|---|---|---|---|
| POST | `/api/auth/callback/credentials` | – | prihlásenie (Auth.js) |
| POST | `/api/auth/signout` | SA, A, P | odhlásenie |
| GET | `/api/auth/session` | SA, A, P | aktuálny používateľ, rola a oprávnený firemný kontext |
| POST | `/api/me/password` | SA, A, P | zmena vlastného hesla |
| GET | `/api/users` | A | zoznam používateľov |
| POST | `/api/users` | A | `{ email, name, role, temporaryPassword }` – vytvorenie s vynútenou zmenou hesla |
| PATCH | `/api/users/{id}` | A | meno, rola, aktivita |
| POST | `/api/users/{id}/reset-password` | A | `{ temporaryPassword }` – reset hesla, okamžité odvolanie predchádzajúcich sessions |

Zmena vlastného hesla: `{ currentPassword, newPassword }`; nové heslo má minimálne 10 znakov. Po úspešnej zmene sa používateľ znovu prihlási.

Firemné `/api/users` povoľuje iba roly `admin` a `seller` a iba účty aktuálnej firmy, vrátane resetu hesla. Členstvo firmy je nemenné; globálne účty superadminov sa v tomto zozname ani v editáciách nezobrazujú.

## 2. Partneri
| Metóda | Endpoint | Rola | Účel |
|---|---|---|---|
| GET | `/api/partners?q=&type=&active=&page=` | A, P* | zoznam a vyhľadávanie; `q` hľadá v kóde (normalizovanom), mene (bez diakritiky, časť textu), telefóne (iba číslice, časť čísla) a IČO (*P: iba id, kód, meno, typ a čiastočne maskovaný telefón aktívnych partnerov; neaktívnych nemôže vyhľadať) |
| POST | `/api/partners` | A | `{ type, displayName, phone?, email?, contactPerson?, ico?, internalNote?, confirmDuplicates? }` – kód pridelí server; zhoda telefónu/IČO vráti `409 DUPLICATE_WARNING`, potvrdenie umožní pokračovať |
| GET | `/api/partners/{id}` | A | detail |
| PATCH | `/api/partners/{id}` | A | úprava (kód sa meniť nedá) |
| POST | `/api/partners/{id}/deactivate` | A | `{ reason }` |
| POST | `/api/partners/{id}/activate` | A | aktivácia |
| GET | `/api/partners/{id}/summary` | A, P | kód, meno, body, obrat s DPH aj bez DPH (hlavička formulára nákupu) |
| GET | `/api/partners/{id}/purchases` | A | história nákupov |

Endpoint na fyzické mazanie neexistuje.

## 3. Tokeny
| Metóda | Endpoint | Rola | Účel |
|---|---|---|---|
| GET | `/api/partners/{id}/tokens` | A | zoznam (typ, hint, označenie, stav, posledné použitie) – **nikdy plný token** |
| POST | `/api/partners/{id}/tokens` | A | `{ type: 'qr'\|'nfc', label?, deactivateTokenIds?: string[], deactivationReason? }` → vytvorí nový token; voliteľne v tej istej transakcii deaktivuje vybrané aktívne tokeny rovnakého typu s povinným dôvodom. **Iba raz** vráti `{ token, value, url, qrSvg, qrPng }`. |
| POST | `/api/tokens/{tokenId}/deactivate` | A | `{ reason }` – nevratná deaktivácia |
| POST | `/api/scan/resolve` | A, P | `{ token }` → `{ partnerId, code, displayName, type, tokenId, source }`; obmedzenie počtu požiadaviek (30/min/IP); neplatný token, token inej firmy alebo neaktívny partner/firma vráti neutrálnu 404 |

Odpoveď pri vytvorení tokenu má `Cache-Control: no-store`; `value` a URL sa vrátia iba v tejto odpovedi. QR SVG/PNG sa generujú serverovo ešte pred uložením tokenu, aby zlyhanie generovania nezanechalo token, ktorý si admin nevie stiahnuť. QR sa nedá vygenerovať neskôr, pretože token sa neukladá. Opätovná tlač = nový token.

## 4. Nákupy
| Metóda | Endpoint | Rola | Účel |
|---|---|---|---|
| GET | `/api/purchases?from=&to=&partnerId=&includeDeleted=&page=` | A (P: iba vlastné dnešné) | stránkovaný zoznam a história |
| POST | `/api/purchases` | A, P | `{ partnerId, amount, partnerPresent, note?, source, tokenId?, purchasedAt?, idempotencyKey, highAmountConfirmed? }` → `{ purchase: { amount, netAmount, vatAmount, vatRatePercent, points, ... }, replayed }`; `amount` je suma s DPH, sadzbu určuje server podľa firmy a body vychádzajú zo sumy bez DPH. A/P môžu nastaviť dátum pri novom nákupe; limit potvrdenia sa kontroluje z hrubej sumy |
| GET | `/api/purchases/{id}` | A | detail |
| PATCH | `/api/purchases/{id}` | A | `{ amount?, partnerPresent?, note?, purchasedAt?, partnerId?, reason }` – `amount` je suma s DPH; `reason` je **povinný**; netto suma a body sa prepočítajú s historickou sadzbou nákupu |
| DELETE | `/api/purchases/{id}` | A | `{ reason }` – **povinný**; vykoná **soft delete** |

## 5. Reporty
| Metóda | Endpoint | Rola | Účel |
|---|---|---|---|
| GET | `/api/reports/dashboard?month=YYYY-MM` | A, P | Údaje úvodného dashboardu podľa roly. A: obrat, body a počet nákupov za vybraný mesiac, počet aktívnych partnerov a posledných 10 nákupov. P: iba vlastné dnešné zápisy (partner, čas, suma, body), deň podľa `Europe/Bratislava`; parameter `month` ignoruje. |
| GET | `/api/reports/monthly?year=&month=&type=` alebo `?month=YYYY-MM&type=` | A, SA vo vybranej firme | mesačný súhrn a zoradený prehľad partnerov s obratom brutto aj netto; body a zoradenie obratu používajú netto hodnoty; dátum nákupu podľa `purchased_at` v časovom pásme aplikácie; zmazané nákupy vylúčené |
| GET | `/api/reports/pdf?month=YYYY-MM` alebo `?from=YYYY-MM-DD&to=YYYY-MM-DD` (max. 366 dní), voliteľne `&type=` | A, SA vo vybranej firme (hlavička `X-Company-Id`) | PDF (A4) na stiahnutie (`Content-Disposition: attachment`, `report-<slug>-<obdobie>.pdf`, `no-store`): hlavička s firmou, obdobím, filtrom a autorom, súhrn, top 3 partneri, tabuľka partnerov podľa obratu bez DPH so stránkovaním; písmo DejaVu Sans (diakritika). Neplatné obdobie/typ = 400, predavač = 403. Zapisuje audit `export.report_pdf`. |

Históriu nákupov poskytuje `GET /api/purchases`, detail partnera `GET /api/partners/{id}` a `/purchases`.
Dashboard endpoint vždy obmedzí údaje podľa roly na serveri; predavač nesmie získať súhrny ani zápisy iných používateľov.

## 6. Audit log
| Metóda | Endpoint | Rola | Účel |
|---|---|---|---|
| GET | `/api/audit-logs?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=&action=&entityType=&entityId=&partnerId=&page=` | A, SA vo vybranej firme | iba čítanie, stránkované po 20; dátumy sú vrátane oboch dní v `APP_TIMEZONE`; iné metódy vrátia 405 |

Odpoveď obsahuje aktéra, udalosť, dôvod, bezpečné porovnanie starých a nových hodnôt a prípadného partnera. Firemný kontext sa vždy odvodí serverovo; payload neobsahuje IP adresu, user-agent, heslá, tokeny ani nezobrazené interné/kontaktné údaje. Neplatné filtre vrátia `400 VALIDATION_ERROR`.

## 7. Exporty (CSV)
| Metóda | Endpoint | Rola |
|---|---|---|
| GET | `/api/exports/partners.csv` | A |
| GET | `/api/exports/purchases.csv?from=&to=&partnerId=&includeDeleted=` | A |
| GET | `/api/exports/monthly.csv?year=&month=` | A |
| GET | `/api/exports/audit-logs.csv?from=&to=` | A |

Formát: UTF-8 s BOM, oddeľovač `;`, desatinná čiarka, dátum `dd.mm.rrrr HH:mm`, ochrana proti CSV injection. Každý export sa zapíše do auditu.

## 8. Verejné
| Metóda | Endpoint | Účel |
|---|---|---|
| GET | `/k/{token}` | HTML stránka verejnej karty (SSR) |
| GET | `/api/public/card/{token}?page=` | `{ companyName, displayName, code, totalPoints, totalGrossAmount, totalNetAmount, vatRatePercent, monthPoints, monthGrossAmount, monthNetAmount, badge: { tier: string \| null, label: string \| null, monthlyAmount, nextThreshold }, badgeHistory, purchases: { items: [{ grossAmount, netAmount, vatRatePercent, points, ... }], ... } }` – firma sa určí iba z tokenu; história obsahuje uzavreté mesiace |
| POST | `/api/cron/close-monthly-badges` | bearer secret z `BADGE_CRON_SECRET`; idempotentne uzavrie predchádzajúci mesiac |
| GET | `/api/health` | `{ status: 'ok' }` – stav aplikácie a DB, bez detailov |

Pre `/k/*` a `/api/public/*` platí iba GET, ostatné metódy vrátia 405. Neplatný token, neaktívny partner alebo firma vrátia neutrálnu 404. Verejná karta nie je ovplyvnená firemným kontextom prihlásenej session.
