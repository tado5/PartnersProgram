# Lokálny vývoj, databáza v Dockeri, build a deploy

> Súvisí s: [IMPLEMENTACNY_PLAN.md](../IMPLEMENTACNY_PLAN.md) · [architecture](architecture.md)

## 1. Princíp: lokálna aplikácia, databáza v Dockeri
- **Požiadavky:** Docker Desktop s Docker Compose a Node.js 22 alebo novší s npm.
- MariaDB beží v Docker kontajneri; Next.js a jeho nástroje bežia lokálne v operačnom systéme.
- Závislosti sa inštalujú lokálne cez `npm ci`; globálna inštalácia nástrojov projektu netreba.
- Databázové dáta zostávajú v priečinku projektu (gitignored):

| Cesta | Obsah |
|---|---|
| `.data/mariadb/` | dáta MariaDB |
| `.data/backups/` | zálohy |

## 2. Služby v `docker-compose.yml`
| Služba | Obraz | Účel | Profil |
|---|---|---|---|
| `db` | `mariadb:11.4` | databáza, vystavená iba na `127.0.0.1:3308` | predvolený |

Databáza je dostupná z lokálnej aplikácie cez `127.0.0.1:3308`, pretože na vývojárskom počítači sú porty 3306 a 3307 už obsadené.

## 3. Prvé spustenie
```sh
cp .env.example .env
# Before continuing, fill required secrets and DB URLs in .env (see README).
npm ci
docker compose up -d db
npm run db:provision
npm run db:migrate
npm run db:permissions
npm run db:seed
npm run dev
```
Next.js aplikácia je dostupná na `http://localhost:3000`.
Pred seedovaním vyplňte v `.env` `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` a
`SEED_SELLER_EMAIL` / `SEED_SELLER_PASSWORD`; predvolené seed dáta sa vytvárajú iba v development. Pre globálneho superadmina nastavte samostatné `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`.

## 4. Bežné príkazy
| Úloha | Príkaz |
|---|---|
| Spustiť databázu | `docker compose up -d db` |
| Vytvoriť DB účty/databázy (idempotentne) | `npm run db:provision` |
| Migrovať vývojovú DB | `npm run db:migrate` |
| Migrovať testovaciu DB | `MIGRATE_DATABASE_URL='mysql://europodlahy_migrate:<heslo>@127.0.0.1:3308/europodlahy_test' npm run db:deploy` |
| Nastaviť práva účtu aplikácie | `npm run db:permissions` |
| Vložiť seed dáta | `npm run db:seed` |
| Zastaviť databázu | `docker compose stop db` |
| Spustiť aplikáciu | `npm run dev` |
| Lint / typecheck / build | `npm run lint` / `npm run typecheck` / `npm run build` |
| Reset DB (dev) | zastaviť `db`, odstrániť `.data/mariadb/`, znova spustiť DB a migrácie |

## 5. MariaDB v Dockeri
- Obraz `mariadb:11.4`, premenné z `.env`.
- Konfigurácia `docker/mariadb/conf.d/europodlahy.cnf`: `utf8mb4`, `utf8mb4_unicode_ci`, `default-time-zone = '+00:00'`.
- Init `docker/mariadb/init/`: databázy `europodlahy`, `europodlahy_test` a `europodlahy_shadow` (tieňová databáza pre Prisma) a účty `europodlahy_migrate` a `europodlahy_app` (heslá berie z env). Po migrácii spustite `npm run db:permissions`, ktoré nastaví práva účtu aplikácie podľa [data-model](data-model.md#db-účty).
- Dáta: bind mount `./.data/mariadb:/var/lib/mysql`.
- Port je namapovaný iba na loopback hosta: `127.0.0.1:3308:3306`.
- Healthcheck `healthcheck.sh --connect --innodb_initialized`.

## 6. Pripojenie aplikácie na DB
Migrácia `20261015120000_privacy_notices` pridáva tabuľky návrhov, verziovaných oznámení a histórie informovania. Pred spustením novej verzie aplikácie aplikujte `npm run db:deploy` a potom `npm run db:permissions` (nové tabuľkové práva; oznámenia a história iba `SELECT, INSERT`). Staré údaje sa neprepisujú, ani sa nevytvára predvolený právny text či domnelá evidencia. **Každá firma musí pred registráciou ďalších partnerov publikovať vlastné právne posúdené oznámenie.** Existujúce karty a nákupy zostávajú funkčné. DB zálohy obsahujú aj verzie a históriu informovania.

Migrácia `20261015110000_company_logo` pridáva iba nullable stĺpce `logo_data` a `logo_version` do `companies`; pred spustením novej verzie aplikácie ju aplikujte štandardným `npm run db:deploy`. Logá sú súčasťou databázových záloh, nepotrebujú upload adresár ani nový verejný storage. Existujúce firmy bez loga používajú svoj názov. Pri obnove DB sa obnovia aj logá; pri rollbacku aplikácie stĺpce nemažte.

| Premenná | Účet | Použitie |
|---|---|---|
| `DATABASE_URL` | `europodlahy_app` | bežiaca aplikácia a seed |
| `MIGRATE_DATABASE_URL` | `europodlahy_migrate` | migrácie |
| `SHADOW_DATABASE_URL` | `europodlahy_migrate` → `europodlahy_shadow` | tieňová DB pre `prisma migrate dev` |
| `TEST_DATABASE_URL` | `europodlahy_migrate` → `europodlahy_test` | integračné testy |

Lokálna aplikácia sa pripája cez `mysql://<user>:<heslo>@127.0.0.1:3308/<db>`.
Prisma klient je singleton. `/api/health` overuje `SELECT 1`.

## 7. `.env`
`.env.example` obsahuje necitlivé vývojové nastavenia a prázdne citlivé hodnoty. Pred spustením vyplňte v lokálnom `.env` heslá, `AUTH_SECRET` a DB URL podľa README. Compose pri chýbajúcom alebo prázdnom DB hesle skončí chybou; predvolené heslá nie sú povolené. Súbor `.env` je gitignored. Tajomstvá pre CI/CD patria do GitHub Actions Secrets alebo správcu tajomstiev, nie do repozitára.

| Premenná | Popis |
|---|---|
| `NODE_ENV` | `development` / `production` |
| `APP_BASE_URL` | verejná URL, z ktorej sa skladá adresa v QR a na NFC. Vo vývoji `http://localhost:3000`; produkčná doména je potvrdená ako `https://partners.europodlahy.sk` |
| `DATABASE_URL`, `MIGRATE_DATABASE_URL`, `SHADOW_DATABASE_URL`, `TEST_DATABASE_URL` | DB pripojenia; shadow DB používa iba `prisma migrate dev` |
| `MARIADB_ROOT_PASSWORD`, `DB_APP_PASSWORD`, `DB_MIGRATE_PASSWORD` | heslá pre DB a init skript |
| `AUTH_SECRET` | minimálne 32 náhodných bajtov |
| `AUTH_URL`, `AUTH_TRUST_HOST` | Auth.js (za proxy `true`) |
| `SESSION_SELLER_IDLE_MINUTES`, `SESSION_SELLER_MAX_HOURS` | `60`, `10` |
| `SESSION_ADMIN_IDLE_MINUTES`, `SESSION_ADMIN_MAX_HOURS` | `30`, `8` |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | prvý admin (po seede odstrániť) |
| `SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD` | samostatný globálny účet, nastaviť spolu, min. 12 znakov hesla; bootstrap údaje potom odstrániť |
| `SEED_SELLER_EMAIL`, `SEED_SELLER_PASSWORD` | vývojový predavač; pri `NODE_ENV=development` musia byť nastavené spolu |
| `RATE_LIMIT_PUBLIC_PER_MIN`, `RATE_LIMIT_LOGIN_PER_MIN` | limity počtu požiadaviek |
| `BADGE_CRON_SECRET` | najmenej 32 znakov; bearer secret pre mesačné uzatváranie odznakov |
| `APP_TIMEZONE` | `Europe/Bratislava` |
| `NEXT_TELEMETRY_DISABLED` | `1` |

Aplikácia pri štarte validuje použité aplikačné premenné cez Zod. V produkcii odmietne `APP_BASE_URL` s `localhost` alebo `http://`.
`DATABASE_URL` je pre aplikáciu povinná. `MIGRATE_DATABASE_URL` a `SHADOW_DATABASE_URL` nie sú potrebné na spustenie aplikácie; vyžaduje ich konfigurácia Prisma pre databázové príkazy.

## 8. Build
Lokálne príkazy:
```
npm ci → lint → typecheck → test → prisma generate → next build (output: standalone)
docker build -t europodlahy-partners:<verzia> .
```
Pri buildovaní s `NODE_ENV=production` nastavte `APP_BASE_URL` na HTTPS doménu. Lokálny `.env` s `http://localhost:3000` je určený pre `npm run dev`.
`Dockerfile` (multi-stage): `deps` → `builder` → `runner` (`node:22-bookworm-slim`, non-root, `TZ=UTC`, iba standalone výstup, `public`, `prisma`).

## 9. Deploy (server s Dockerom)
- `docker-compose.prod.yml`: `app`, `db` (bez verejného portu), `proxy` (Caddy – Let's Encrypt, HSTS, presmerovanie HTTP→HTTPS).
- Produkčný `.env` na serveri (práva `600`), `APP_BASE_URL` = definitívna doména.

**Nasadenie novej verzie:**
1. záloha DB (`mariadb-dump`),
2. nahratie nového obrazu,
3. `prisma migrate deploy` (jednorazový kontajner s `MIGRATE_DATABASE_URL`),
4. `docker compose -f docker-compose.prod.yml up -d app`,
5. smoke test: `/api/health`, login, sken QR, nákup, karta, report, export.

**Rollback:** predchádzajúci tag obrazu; pri nespätnej migrácii aj obnova zálohy.

## 10. Zálohy a monitoring
- Denný `mariadb-dump` (kontajner alebo cron), komprimovaný, uchovávaný 30 dní, kópia mimo servera.
- Test obnovy raz za mesiac.
- Docker healthcheck, externý uptime check na `/api/health`, logy kontajnerov.
- Mesačné odznaky uzatvára plánovaná úloha v prvý deň mesiaca po polnoci podľa `Europe/Bratislava`
  volaním `POST /api/cron/close-monthly-badges` s hlavičkou
  `Authorization: Bearer $BADGE_CRON_SECRET`. Koncový bod spracuje predchádzajúci kalendárny
  mesiac; uzatvorenie je idempotentné a pri zlyhaní možno bezpečne zopakovať. Pri výpadku viac
  než mesiac možno spustiť `npm run badges:close -- --month=YYYY-MM` na hoste s prístupom
  k produkčnej DB. Tajomstvo musí byť náhodné, dlhé aspoň 32 znakov a uložené iba v produkčnom
  `.env`/cron prostredí; nevkladať ho priamo do crontab príkazu.

## 11. Pred tlačou kariet (kontrolný zoznam)
- [ ] `APP_BASE_URL=https://partners.europodlahy.sk` je nastavené v produkčnom prostredí.
- [ ] HTTPS na produkčnej doméne funguje.
- [ ] Testovací QR a NFC token otvoria správnu kartu na iPhone aj Androide.
- [ ] Zálohy bežia.

## 12. Nasadenie viacfiremnej verzie (fáza 5A)
Schéma, migrácia, API/UI a bootstrap sú implementované. Nasledujúci postup sa vykonáva až pri nasadení na skutočnú DB; vývojová ani produkčná DB sa pri regresnom teste nemení.

- Pred nasadením zastaviť zápisy, vytvoriť zálohu a overiť obnovu; migráciu vopred overiť na kópii DB. MariaDB DDL nemusí byť transakčné, preto nestačí spoliehať sa na automatický rollback migrácie.
- Existujúce dáta a účty priradiť firme Europodlahy bez zmeny ID a tokenových odtlačkov; historický audit rozšíriť postupom v [data-model](data-model.md#izolácia-väzieb-a-migrácia-fáza-5a), bez vypnutia triggerov alebo prepisu jeho pôvodných hodnôt.
- Doplniť tabuľkové práva aplikačného účtu na `companies` a zneplatniť existujúce sessions. Pri prvom prihlásení sa musí overiť aktuálna firma a rola.
- Nastaviť validované bootstrap premenné `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`; `npm run db:seed` vytvorí samostatného globálneho superadmina s povinnou zmenou hesla. Existujúceho admina firmy seed nikdy nepovýši; pri kolízii s inou rolou/firmou skončí chybou. Existujúce heslá a stavy zostanú bezo zmeny. Bootstrap prihlasovacie údaje po použití odstrániť z prostredia.
- `SEED_ADMIN_*` naďalej označuje firemného admina Europodlahy, nie superadmina. Superadmin používa admin session limity 30 min / 8 h. Vývojové rýchle prihlásenie nesmie byť dostupné v produkcii ani automaticky získať globálne oprávnenia.
- `APP_BASE_URL` je spoločná stabilná doména pre všetky firmy. Pridaním firmy sa existujúce QR/NFC URL nemenia; vlastné domény nie sú v MVP.
- Zálohy spoločnej DB obsahujú údaje všetkých firiem a platformový audit; prístup k nim má iba technický správca. Firemný admin má len export svojich údajov cez aplikáciu, nie prístup k celej zálohe.
- Akceptácia nasadenia zahŕňa aspoň dve firmy: ich admini nevidia cudzie dáta, superadmin vie vstúpiť do oboch, deaktivácia firmy zablokuje jej program, audit uvedie skutočného aktéra a existujúce tokeny Europodlahy zostanú zachované.

### Overenie bez zmeny reálnej DB
1. Spustiť `npm run lint`, `npm run typecheck`, produkčný `npm run build` s HTTPS `APP_BASE_URL` a vypnutým lokálnym quick login.
2. S dostupným Compose `db` spustiť `npm run test:phase5a`. Runner vytvorí jednorazovú DB `europodlahy_5a_validation`, testovací server na porte 3017 a použije iba existujúce Node/tsx/Prisma nástroje. Existujúcu DB tohto mena odmietne prepísať; po skončení odstráni iba vlastný server/DB.
3. Test pokrýva migráciu pôvodných riadkov, zachovanie všetkých pôvodných audit hodnôt a času, aktívne nemenné triggre, tokenové odtlačky a ID; matice API/SSR, firemné/compound FK, bootstrap, session limity, reset, prepnutie kontextu, sken a súbežné ochrany. Overí aj čistý `prisma migrate deploy`, zhodu schémy a opakovateľný dvojfiremný seed.
4. Pred nasadením na skutočnú DB navyše vykonať zálohu/obnovu, migračnú skúšku na jej kópii a manuálny browserový/mobilný checklist. Regresie tieto kroky nenahrádzajú.

Príkazy pre plánovanú odstávku po zálohe: `npm run db:deploy && npm run db:permissions && npm run db:seed`. Nepoužívať `migrate reset` ani vypínanie audit triggerov. Reálna migrácia ani mobilná akceptácia sa pri implementácii 5A netvrdia ako vykonané.
