# API

> Súvisí s: [IMPLEMENTACNY_PLAN.md](../IMPLEMENTACNY_PLAN.md) · [security](security.md) · [screens](screens.md)

API tvoria Route Handlers v `src/app/api/` v tej istej Next.js aplikácii.

> **Fázy 5A–10 implementované:** `/api/superadmin/*`, používatelia, partneri, tokeny, nákupy, reporty, firemný audit a CSV exporty sú dostupné a firemne izolované.

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
- Neaktívna firma zablokuje firemný prístup A/P (`403 COMPANY_INACTIVE`). SA môže firmu spravovať a čítať/exportovať históriu; vydanie tokenu a vytvorenie/úprava/zmazanie nákupu vrátia `409 COMPANY_INACTIVE`. Otvorenie tokenu má osobitný kontrakt neutrálnej 404 aj pri neaktívnej firme (časť 3).

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

Registrácia `POST /api/partners` vyžaduje aj `privacy: { noticeId, providedAt, method, reason? }`.
`noticeId` je reťazec ID aktuálnej publikovanej verzie danej firmy, `providedAt` ISO dátum v UTC a `method` jedno z `in_person`, `printed`, `email`. Bez publikovaného oznámenia sa ešte pred validáciou registračného payloadu vráti `409 PRIVACY_NOTICE_REQUIRED`; chýbajúca evidencia pri publikovanom oznámení je 400. Cudzie/neexistujúce oznámenie = `404 PRIVACY_NOTICE_NOT_FOUND`, stará verzia pri registrácii = `409 PRIVACY_NOTICE_CHANGED`, budúci čas alebo čas pred publikovaním = `400 INVALID_PRIVACY_DATE`. Partner a evidencia sa vytvoria v jednej transakcii. Existujúce karty, úpravy partnerov a nákupy nie sú týmto publikačným blokovaním dotknuté.

`GET /api/partners` a `/api/exports/partners.csv` podporujú `privacy=all|missing|recorded`; filter sa týka existencie evidencie, nie súhlasu alebo právnej správnosti. Admin zoznam dostane `privacyRecorded`; predavač toto pole nedostane a nemôže použiť filter iný než `all`.

### Informačné oznámenia a evidencia poskytnutia

| Metóda | Endpoint | Rola | Účel |
|---|---|---|---|
| GET | `/api/company/privacy` | A, SA vo vybranej firme | `{ draft, current }`, vrátane tokenu `draft.updatedAt`; `no-store` |
| PUT | `/api/company/privacy` | iba vlastný A | uloženie aj neúplného návrhu; `{ controllerName, controllerAddress, controllerIco?, contactEmail, dpoContact?, body }`; odpoveď `{ draft, current }` |
| POST | `/api/company/privacy/publish` | iba vlastný A | `{ expectedUpdatedAt }` povinný ISO token uloženého návrhu; odpoveď `{ notice }`; nová nemenná verzia, účinná okamžite |
| GET | `/api/partners/{id}/privacy` | A, SA vo vybranej firme | `{ items }` – história poskytnutí, verzia, čas, spôsob, zaznamenal a dôvod |
| POST | `/api/partners/{id}/privacy` | iba vlastný A | `{ noticeId, providedAt, method, reason? }`; 201 `{ id }`; pridanie záznamu aj k historickej verzii, bez prepisu minulosti |
| GET | `/ochrana-udajov/{slug}?version=N` | verejné | publikovaná verzia aktívnej firmy; bez `version` najnovšia; 404 pri chýbajúcej/neplatnej verzii, neaktívnej alebo chýbajúcej firme |

`GET /gdpr` poskytuje hlavný dokument ochrany údajov. `?format=pdf` vráti prílohu `gdpr.pdf` s vloženým Unicode písmom a stránkovaním. Spoločný dokument neobsahuje fiktívnu identitu firmy a odkazuje na príslušnú firemnú publikovanú verziu dostupnú z partnerskej karty. `?format=pdf` na `/ochrana-udajov/{slug}?version=N` poskytuje nemennú firemnú verziu s identifikáciou a kontaktmi. Odkaz na PDF z firemnej HTML stránky je vždy pripnutý k zobrazenej verzii a uplatňuje rovnaké kontroly aktívnej firmy. Verejné stránky nevyžadujú prihlásenie či partnerov token a neposkytujú návrhy firmy.

Publikovanie naďalej odmietne starší text obsahujúci nevyriešené značky `[DOPLNIŤ: …]`; uloženie návrhu ich povoľuje. Nový predvyplnený dokument ich neobsahuje. Validácia nie je právnym schválením ani potvrdením dodržiavania retenčnej politiky.

Publikácia vyžaduje vyplnené meno/sídlo prevádzkovateľa, platný kontaktný e-mail, voliteľné osemmiestne IČO a text 100–20 000 znakov. Chýbajúci návrh = `409 PRIVACY_DRAFT_MISSING`, zmenený alebo už použitý token = `409 PRIVACY_DRAFT_CHANGED`; neúplný text = 400 s poľami. Validácia nie je právna kontrola.

Ďalší záznam poskytnutia vyžaduje dôvod 2–255 znakov (`400 PRIVACY_REASON_REQUIRED` pri chýbaní). Aktér a firma sa určia zo session, nie z payloadu. SA nemôže meniť oznámenia ani dopĺňať históriu; pri registrácii partnera má naďalej existujúce admin oprávnenia vo výslovne vybranej firme a prvá evidencia sa uloží pod jeho identitou. Zápisy vyžadujú rovnaký pôvod. Audit: `company.privacy_draft_update`, `company.privacy_publish`, `partner.privacy_provided`. Verejný text je escapovaný, bez údajov partnera, s `no-store`, `noindex` a `no-referrer`; verejné zápisy sú 405.
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
| POST | `/api/partners/{id}/tokens` | A | `{ type: 'qr'\|'nfc', label?, deactivateTokenIds?: string[], deactivationReason? }` → nový náhodný token; pri výslovnej náhrade atomicky deaktivuje vybrané aktívne tokeny rovnakého typu s povinným dôvodom. Vráti `{ token, value, url, qrSvg, qrPng }`. |
| POST | `/api/tokens/{tokenId}/open` | A | opätovné otvorenie aktívneho tokenu aktívneho partnera a firmy; `{ token, value, url, qrSvg, qrPng }`, `no-store`, rovnaký pôvod; audit `token.open` iba s typom a hintom |
| POST | `/api/tokens/{tokenId}/deactivate` | A | `{ reason }` – nevratná deaktivácia |
| POST | `/api/partners/{id}/card` | A | `{ token, format: 'card'\|'a4' }` → PDF s prednou a zadnou stranou (2 strany). `card`: 85,60 × 53,98 mm; `a4`: karta vycentrovaná s orezovými značkami. Vyžaduje plný **QR** token z vytvorenia alebo opätovne otvorených detailov; overí jeho hash, typ, aktívny stav a príslušnosť partnerovi aj firme. NFC token vráti neutrálnu 404: tlačová grafika nesmie závisieť od NFC prístupu. Nevydáva ani nemení tokeny. Rovnaký pôvod, `no-store`, audit `export.partner_card` bez tokenu; neplatná karta = neutrálna 404. |
| POST | `/api/scan/resolve` | A, P | `{ token }` → `{ partnerId, code, displayName, type, tokenId, source }`; obmedzenie počtu požiadaviek (30/min/IP); neplatný token, token inej firmy alebo neaktívny partner/firma vráti neutrálnu 404 |

**Schválený kontrakt opätovného otvorenia a náhrady:** jeden partner má jednu trvalú identitu a históriu. V rámci `(companyId, partnerId)` môže byť aktívny najviac jeden `qr` a jeden `nfc` token. Majú nezávislé URL na rovnaké partnerské údaje a deaktivujú sa nezávisle. Všetky tokenové akcie A povoľujú aj SA, ale iba s explicitným firemným kontextom; predavač nemá prístup.

Vytvorenie nikdy ticho nenahrádza existujúci token. Ak niektorý aktívny token rovnakého typu nie je výslovne uvedený v `deactivateTokenIds`, vráti `409 ACTIVE_TOKEN_EXISTS`. Neaktuálny výber na deaktiváciu vráti `409 TOKEN_SELECTION_CHANGED`; náhrada vyžaduje `deactivationReason`. Pod transakčným zámkom firmy sa starý token deaktivuje a vytvorí nový náhodný token pre **toho istého partnera**; pri chybe sa neuloží ani časť operácie. Nákupy, body a história sa nemenia, druhý typ tokenu zostáva platný. Limit navyše vynucuje DB unikátny index cez triggermi odvodený `active_type` (pozri [data-model](data-model.md#3-partner_tokens)).

Zoznam vracia iba metadáta, nikdy hodnotu, URL ani šifrovanú obálku. Vytvorenie a otvorenie majú `Cache-Control: no-store`; QR SVG/PNG sa generujú serverovo. Nové tokeny majú SHA-256 odtlačok aj AES-256-GCM šifrovanú hodnotu v DB, nie čitateľný token. Vydanie aj otvorenie vyžadujú samostatný `TOKEN_ENCRYPTION_KEY`; chýbajúci kľúč = `503 TOKEN_KEY_MISSING`, nesprávny kľúč alebo poškodená obálka = 500 s bezpečnou správou bez tajomstiev. Associated data viažu šifrovanie na `companyId`, `partnerId`, `type` a `tokenHash`.
Pri vydaní sa QR SVG/PNG pripravia pred uložením tokenu, aby zlyhanie generovania nezanechalo čiastočne vydaný token. Plná hodnota sa pre PDF posiela iba v tele POST, nie v URL exportnej požiadavky alebo audite.

Otvorenie cudzieho alebo neaktívneho tokenu, partnera či firmy vráti neutrálnu 404. Starý aktívny token iba s hashom vráti `409 TOKEN_NOT_RECOVERABLE`: hash nemožno spätne rekonštruovať, UI ponúkne výslovnú náhradu, nie import ani obnovu starej hodnoty. Úspešné otvorenie audituje `token.open` iba s typom/hintom; audit nikdy neobsahuje hodnotu, ciphertext ani URL.

Z otvorených detailov možno kedykoľvek znova stiahnuť QR PNG/SVG aj prednú a zadnú stranu karty ako SVG/PDF bez nového tokenu. Náhľad a PDF používajú spoločný SVG zdroj; PDF obsahuje 600 dpi RGB grafiku, bez spadávky a CMYK profilu. Verejná URL je bearer odkaz: sprístupňuje verejnú históriu nákupov komukoľvek, kto ho má, **nikdy neoprávňuje na zápis**.

## 4. Nákupy
| Metóda | Endpoint | Rola | Účel |
|---|---|---|---|
| GET | `/api/purchases?from=&to=&partnerId=&includeDeleted=&page=` | A (P: iba vlastné dnešné) | stránkovaný zoznam a história |
| POST | `/api/purchases` | A, P | `{ partnerId, amount, partnerPresent, note?, source, tokenId?, purchasedAt?, idempotencyKey, highAmountConfirmed? }` → `{ purchase: { amount, netAmount, vatAmount, vatRatePercent, points, ... }, replayed }`; `amount` je suma s DPH, sadzbu určuje server podľa firmy a body vychádzajú zo sumy bez DPH. A/P môžu nastaviť dátum pri novom nákupe; limit potvrdenia sa kontroluje z hrubej sumy |
| GET | `/api/purchases/{id}` | A | detail |
| PATCH | `/api/purchases/{id}` | A | `{ amount?, partnerPresent?, note?, purchasedAt?, partnerId?, reason }` – `amount` je suma s DPH; `reason` je **povinný**; netto suma a body sa prepočítajú s historickou sadzbou nákupu |
| DELETE | `/api/purchases/{id}` | A | `{ reason }` – **povinný**; vykoná **soft delete** |

### Logo firmy

| Metóda | Endpoint | Rola | Účel |
|---|---|---|---|
| GET | `/api/company/logo` | A, P, SA vo vybranej firme | PNG aktuálnej firmy; `no-store`, `nosniff`; 404 bez loga |
| PUT | `/api/company/logo` | iba vlastný A | `multipart/form-data`, pole `file`; PNG/JPEG/WebP do 2 MiB, najviac 16 miliónov pixelov; normalizácia na PNG do 512 × 256 px, bez metadát; 400 neplatný obrázok, 413 veľký súbor |
| DELETE | `/api/company/logo` | iba vlastný A | odstránenie loga; návrat k názvu firmy |

Zápisy vyžadujú rovnaký pôvod; SA nemôže meniť logo. Audit `company.logo_update` / `company.logo_delete` uchováva iba hash verzie, nikdy binárny obrázok. Verejná karta odvodí logo z firmy platného tokenu a vloží normalizované PNG; neexistuje verejný endpoint vyhľadávania log podľa ID firmy.

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
| GET | `/api/exports/partners.csv?q=&type=&active=all` | A, SA vo vybranej firme |
| GET | `/api/exports/purchases.csv?from=&to=&partnerId=&includeDeleted=false` | A, SA vo vybranej firme |
| GET | `/api/exports/monthly.csv?month=YYYY-MM&type=` alebo `?from=YYYY-MM-DD&to=YYYY-MM-DD&type=` | A, SA vo vybranej firme |
| GET | `/api/exports/audit-logs.csv?from=&to=&userId=&action=&entityType=&entityId=&partnerId=` | A, SA vo vybranej firme |

Formát: UTF-8 s BOM, oddeľovač `;`, riadky CRLF, desatinná čiarka, dátum `dd.mm.rrrr HH:mm` v `APP_TIMEZONE`, escapované úvodzovky a ochrana proti CSV injection. Odpoveď je príloha `text/csv`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. Export nie je stránkovaný a zahŕňa všetky zodpovedajúce riadky; UI neposiela `page`.

`active` je `all`, `true` alebo `false`; typ partnera má rovnaké hodnoty ako pri zozname partnerov. Dátumy nákupov a auditu sú celé kalendárne dni vrátane koncového dňa v `APP_TIMEZONE`. Prázdne filtre znamenajú bez obmedzenia. Zmazané nákupy sa štandardne vynechajú; `includeDeleted=true` ich zahrnie s označením stavu. Mesačný prehľad používa rovnaký výpočet ako report, vždy bez zmazaných nákupov; vlastné obdobie je najviac 366 dní. Podporovaný je aj pôvodný zápis `year=YYYY&month=M`.

Admin nesmie zmeniť firmu hlavičkou; superadmin posiela explicitné `X-Company-Id` a UI aj `X-Company-Selection`. Predavač dostane 403, neprihlásený 401, neplatné filtre 400, cudzie vzťahové ID neutrálnu 404. Neaktívnu firmu môže exportovať iba superadmin. Auditový CSV obsahuje iba bezpečné hodnoty ako auditové UI, nie IP, user-agent, heslá ani tokeny. Úspešné vytvorenie súboru zapíše `export.csv` s typom, filtrami a počtom riadkov; pri zlyhaní zápisu auditu sa súbor nevráti.

## 8. Verejné
| Metóda | Endpoint | Účel |
|---|---|---|
| GET | `/k/{token}` | HTML stránka verejnej karty (SSR) |
| GET | `/api/public/card/{token}?page=` | `{ companyName, displayName, code, totalPoints, totalGrossAmount, totalNetAmount, vatRatePercent, monthPoints, monthGrossAmount, monthNetAmount, badge: { tier: string \| null, label: string \| null, monthlyAmount, nextThreshold }, badgeHistory, purchases: { items: [{ grossAmount, netAmount, vatRatePercent, points, ... }], ... } }` – firma sa určí iba z tokenu; história obsahuje uzavreté mesiace |
| POST | `/api/cron/close-monthly-badges` | bearer secret z `BADGE_CRON_SECRET`; idempotentne uzavrie predchádzajúci mesiac |
| GET | `/api/health` | `{ status: 'ok' }` – stav aplikácie a DB, bez detailov |

Pre `/k/*` a `/api/public/*` platí iba GET, ostatné metódy vrátia 405. Neplatný token, neaktívny partner alebo firma vrátia neutrálnu 404. Verejná karta nie je ovplyvnená firemným kontextom prihlásenej session.
