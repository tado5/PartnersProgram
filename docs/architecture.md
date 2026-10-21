# Architektúra a technické rozhodnutia

> Súvisí s: [IMPLEMENTACNY_PLAN.md](../IMPLEMENTACNY_PLAN.md) · [data-model](data-model.md) · [api](api.md) · [deployment](deployment.md)

## 1. Princípy
- **Jedna aplikácia, jeden projekt:** Next.js (App Router) + **React** + TypeScript. UI, serverová logika aj REST API sú v jednom repozitári. Žiadny samostatný React projekt.
- **Reprodukovateľnosť len z priečinka projektu:** všetky závislosti sú v `package.json` a kontajnery v `docker-compose.yml` (pozri [deployment](deployment.md)).
- **Server je jediný zdroj pravdy:** body, oprávnenia aj validáciu rieši server. Kontroly v UI slúžia iba na pohodlie používateľa.
- **Jednoduchosť MVP:** žiadne mikroslužby, fronty ani cache vrstvy.
- **Viacfiremný režim (implementované fázy 5A–10):** spoločná aplikácia a DB, oddelené programy cez `company_id`; existujúce moduly vrátane nákupového UI, verejnej karty, reportov, auditu a CSV exportov majú centrálne guardy a firemné filtre.

## 2. Prehľad
```
Prehliadač
 ├─ Superadmin (prihlásený)        →  /superadmin/firmy  správa firiem, výber firemného programu
 ├─ Admin / Predavač (prihlásený)  →  /app/*   React UI, skener QR, voliteľne Web NFC
 └─ Partner (anonymný)             →  /k/{token}  karta iba na čítanie
                │ HTTPS
                Next.js aplikácia (lokálny vývoj; produkcia v Dockeri)
 ├─ proxy.ts          predbežná ochrana /app/* a /api/*; serverové guardy rozhodujú
 ├─ app/              React stránky (Server Components čítajú, Client Components = formuláre, skener)
 ├─ app/api/          Route Handlers (JSON, CSV)
 └─ server/           services · repositories · auth · tokens · audit · reports · export
                │ Prisma
MariaDB 11.4 (Docker, lokálny port 127.0.0.1:3308, dáta v ./.data/mariadb)
```

## 3. Technologický stack
| Oblasť | Voľba | Dôvod |
|---|---|---|
| Framework | Next.js (App Router), React, TypeScript strict | jeden projekt, SSR verejnej karty |
| UI | Tailwind CSS + shadcn/ui (komponenty skopírované do projektu) | rýchle a responzívne UI |
| DB | MariaDB 11.4 LTS | požiadavka |
| ORM | Prisma (devDependency, provider `mysql`) | typy, migrácie, seed |
| Auth | Auth.js v5, Credentials provider, JWT session | bez registrácie |
| Heslá | argon2id cez `@node-rs/argon2` | predkompilované, netreba kompilátor |
| Validácia | Zod | spoločné schémy pre klienta aj server |
| QR generovanie | `qrcode` | SVG/PNG, tlač |
| QR skenovanie | `@zxing/browser` | kamera v prehliadači, iOS aj Android |
| NFC | Web NFC API (voliteľné) | iba Chrome na Androide |
| Testy | Vitest, Playwright (v kontajneri) | |

Verzie Node.js závislostí sú pevne dané v `package-lock.json`; MariaDB image je pinovaná na 11.4.

## 4. Vrstvy a pravidlá
| Vrstva | Zodpovednosť | Nesmie |
|---|---|---|
| `app/` (React) | zobrazenie, formuláre, volanie API | obsahovať biznis pravidlá |
| `app/api/` | autentifikácia → kontrola roly → Zod → service → odpoveď | pristupovať priamo k Prisma |
| `server/services` | pravidlá: body, tokeny, soft delete, audit | závisieť od HTTP |
| `server/repositories` | Prisma dotazy, transakcie | obsahovať pravidlá |
| `server/audit` | `audit.record(tx, …)` v tej istej transakcii | upravovať existujúce záznamy |

## 5. Štruktúra projektu
```
PartnersProgram/
├─ IMPLEMENTACNY_PLAN.md
├─ docs/                          táto dokumentácia
├─ src/
│  ├─ app/
│  │  ├─ (public)/k/[token]/      verejná karta
│  │  ├─ (auth)/login/
│  │  ├─ (app)/app/               dashboard, partneri, sken, nakupy, reporty, audit, exporty, pouzivatelia
│  │  └─ api/                     route handlers
│  ├─ server/                     auth, services, repositories, tokens, audit, reports, export, rate-limit
│  ├─ components/                 React komponenty (+ ui/ zo shadcn)
│  └─ lib/                        Zod schémy, formátovanie, konštanty
├─ prisma/                        schema.prisma, migrations/, seed.ts
├─ tests/                         unit/, integration/, e2e/
├─ docker/                        mariadb/conf.d, mariadb/init, caddy/
├─ docker-compose.yml             vývoj
├─ docker-compose.prod.yml        produkcia
├─ Dockerfile
├─ .env.example
├─ .data/        (gitignored)     dáta DB, zálohy, Caddy certifikáty
├─ .npm-cache/   (gitignored)
└─ README.md
```

## 6. Moduly
| # | Modul | Zodpovednosť | Kto používa |
|---|---|---|---|
| M1 | Autentifikácia | login, session, roly, správa používateľov, ochrana proti hádaniu hesla | Admin, Predavač |
| M2 | Partneri | vytvorenie, úprava, deaktivácia, vyhľadávanie | Admin (Predavač iba vyhľadáva) |
| M3 | Tokeny QR/NFC | generovanie, hash + šifrovaná obálka, oprávnené opätovné otvorenie, výslovná náhrada, nezávislá deaktivácia, QR a obojstranná karta, URL pre NFC | Admin, SA vo vybranej firme |
| M4 | Nákupy | sken, zápis, body, úprava a soft delete s dôvodom | Predavač, Admin |
| M5 | Verejná karta | prezeranie bodov, obratu a histórie | Partner |
| M6 | Reporty a dashboardy | dashboard podľa roly, mesačný prehľad, detail partnera, história | Admin, Predavač (vlastný dnešný prehľad) |
| M7 | Audit log | nemenný záznam a jeho prehliadanie | Admin |
| M8 | Exporty | CSV | Admin |

Závislosti: M1 → M2 → M3 → M4 → M5; M4 → M6 → M8; M7 využívajú moduly M1 – M4 a M8.

## 7. Kľúčové toky
**Identifikácia partnera:** nezávislé QR a NFC URL majú spoločný tvar `{APP_BASE_URL}/k/{token}` a vedú na údaje a históriu **toho istého partnera**.
- Partner naskenuje kód svojím telefónom → otvorí sa verejná karta, ktorú si môže iba prezerať.
- Predavač naskenuje kód **v prihlásenej aplikácii** → aplikácia z URL vyberie token → `POST /api/scan/resolve` → otvorí sa formulár nákupu.
- Zápis vždy vyžaduje session admina/predavača danej firmy alebo superadmina s výslovne vybranou firmou. Samotný token na zápis nikdy nestačí.

**Životný cyklus tokenu (schválený kontrakt):**
- Jedna trvalá partnerská identita/história; najviac jeden aktívny QR a jeden NFC na `(companyId, partnerId)`, nezávislá deaktivácia. Náhrada vytvorí čerstvý náhodný token, nie nového partnera a nie novú históriu.
- Vydanie/náhrada sa serializuje transakčným zámkom firmy; existujúci aktívny token rovnakého typu musí byť výslovne vybraný na deaktiváciu s dôvodom. Nevybraný token = `ACTIVE_TOKEN_EXISTS`, neaktuálny výber = `TOKEN_SELECTION_CHANGED`. Deaktivácia a vydanie sú atomické. DB limit navyše chráni `UNIQUE(company_id, partner_id, active_type)`; insert/update triggre odvodia `active_type = type` iba pre aktívne tokeny.
- Náhodná hodnota sa ukladá ako SHA-256 hash aj AES-256-GCM obálka; associated data sú `companyId`, `partnerId`, `type`, `tokenHash`. Samostatný stabilný `TOKEN_ENCRYPTION_KEY` má 64 hex znakov, je oddelený od `AUTH_SECRET` aj DB a zálohuje sa zvlášť.
- Zoznam obsahuje iba metadáta. Same-origin `POST /api/tokens/{tokenId}/open` pre A alebo SA s explicitnou firmou vráti `{ token, value, url, qrSvg, qrPng }`, `no-store`, audit `token.open` iba typ/hint. Vyžaduje aktívnu firmu/partnera/token; cudzie/neaktívne objekty = neutrálna 404. Chýbajúci kľúč = `503 TOKEN_KEY_MISSING`, nesprávny kľúč/poškodená obálka = bezpečná 500. Hodnota, ciphertext ani URL nepatria do auditu.
- Starý hash-only token nemožno rekonštruovať (`409 TOKEN_NOT_RECOVERABLE`); UI vysvetlí výslovnú náhradu, import/obnova hodnoty sa nepodporuje. Migračné pravidlá pre existujúce testovacie duplicity a zákaz automatického výberu na reálnych produkčných dátach sú v [data-model](data-model.md#3-partner_tokens).
- Opätovne otvorené detaily poskytujú QR PNG/SVG, prednú/zadnú stranu karty SVG/PDF, systémové zdieľanie pri podpore, kopírovanie odkazu a verejnú kartu. Náhľad a PDF používajú spoločný SVG zdroj. `POST /api/partners/{id}/card` s `{ token, format: 'card'|'a4' }` nevydáva token; má `no-store` a audit `export.partner_card`. Obe strany sú 85,60 × 53,98 mm alebo uprostred A4 s orezovými značkami, 600 dpi RGB bez spadávky/CMYK.
- NFC detaily vysvetľujú fyzický zápis NDEF URI URL na NTAG213/215 kompatibilným zapisovačom; aplikácia čip automaticky nezapíše, uzamknutie až po overení. Každý bearer odkaz sprístupňuje verejnú históriu nákupov komukoľvek s odkazom, nie oprávnenie zapisovať.

**Zápis nákupu:** formulár → `POST /api/purchases` → service overí aktívnu firmu a partnera v nej, vypočíta `FLOOR(suma)` a uloží nákup aj audit v jednej transakcii.

## 9. Firemný kontext a superadmin (fáza 5A)
- `companies` predstavujú prevádzkovateľov programov; partner typu `company` je stále iba partnerom jednej takej firmy.
- Admin/predavač patria jednej firme. Superadmin je globálny účet bez firemného členstva. Prihlásenie zostáva e-mailom a heslom; e-mail je globálne unikátny.
- Centrálna služba overí session, aktuálnu rolu, členstvo a aktivitu firmy. Firemné repositories vyžadujú overený kontext a filtrujú aj jednotlivé ID, vyhľadávania, počty, agregácie, vzťahy, audit a exporty.
- Admin/predavač nemôžu ovplyvniť firmu cez payload, query alebo hlavičku. Superadmin vstupuje do firemných API s explicitným `X-Company-Id`; server overí jeho globálnu rolu a vybranú firmu. SSR/Server Actions používajú overený kontext z podpísanej HttpOnly cookie nastavenej serverom cez endpoint výberu firmy.
- Globálne endpointy `/api/superadmin/*` majú samostatný guard; firemné endpointy bez kontextu superadmina vrátia chybu, nikdy všetky záznamy.
- Prepnutie firmy invaliduje firemnú navigačnú cache, vyčistí klientsky stav a znovu načíta program. Firemné cache kľúče musia obsahovať firmu a podľa potreby rolu/používateľa; citlivé odpovede používajú `no-store`. Formulár sa nesmie odoslať do inej firmy po zmene kontextu.
- Implementácia používa `requireCompanyRole` pre API, `requireCompanyPage` pre SSR/Actions, `CompanyProvider`/`useCompanyApi` pre firemné klientské volania a `lockCompanyContext` v transakčných zápisoch. Cookie je podpísaná cez `AUTH_SECRET`, viazaná na ID aktéra a `loginAt`, bez trvalej expirácie. UI posiela aj `X-Company-Selection`; starý výber vráti `409 COMPANY_CONTEXT_CHANGED`. Výber firmy používa dokumentovú navigáciu, ktorá zahodí Next Router Cache; iné karty sú informované cez storage event, návrat z bfcache obnoví stránku.
- Verejná karta zisťuje firmu z tokenu, nie zo session alebo klientom zadanej firmy; prihlásený sken vyžaduje zhodu tokenu s aktuálnou firmou.
- Superadmin používa admin funkcie vybranej firmy, ale nepreberá identitu jej admina. Platformové operácie a firemné zásahy sú oddelene auditované.
- Nový modul M9: firmy, prvý firemný admin, výber kontextu a platformový audit. M1–M8 musia byť prispôsobené fáze 5A pred pokračovaním ďalších funkcií.

## 8. Technické konvencie
- Čas sa ukladá v UTC (`DATETIME(3)`) a zobrazuje v `Europe/Bratislava`. Mesačné hranice sa prepočítavajú do UTC.
- Peniaze sú `DECIMAL(10,2)` – žiadne `float`. V UI sa zadávanie riadi slovenskými zvyklosťami (desatinná čiarka).
- Interné ID sa nikdy neobjavia vo verejných URL.
- Jazyk UI je slovenčina.
