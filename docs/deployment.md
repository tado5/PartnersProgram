# Lokálny vývoj, databáza v Dockeri, build a deploy

> Súvisí s: [IMPLEMENTACNY_PLAN.md](../IMPLEMENTACNY_PLAN.md) · [architecture](architecture.md)

## 1. Princíp: lokálna aplikácia, databáza v Dockeri
- **Požiadavky:** Docker Desktop s Docker Compose a odporúčaný Node.js 24 LTS
  s npm (rovnaký ako Docker/CI); pri Node.js 22 použite aspoň 22.12 pre Prisma 7.
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
| Overiť DB pripojenie bez zmeny údajov | `npm run db:check` |
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
Migrácia `20261020090000_reopenable_partner_tokens` pridáva `token_encrypted VARCHAR(255) NULL`, nullable enum `active_type`, insert/update triggre a unikátny index `(company_id, partner_id, active_type)`: najviac jeden aktívny QR a jeden aktívny NFC token na partnera vo firme. Aktuálne údaje sú podľa zadania testovacie; pri duplicitách nechá aktívny najnovší token podľa `created_at`/`id` a ostatné deaktivuje s pevným migračným dôvodom. Fyzicky nič nemaže ani nemení nákupy. **Nepoužiť túto migráciu nezmenenú na reálne predexistujúce produkčné dáta** – tie vyžadujú zámerný výber zachovaného tokenu. Pred `npm run db:deploy` overiť dáta, vytvoriť zálohu a skúsiť migráciu na kópii; MariaDB DDL nemusí byť transakčné.

Pred vydaním alebo opätovným otvorením tokenov nastavte `TOKEN_ENCRYPTION_KEY` podľa časti 7. Staré hash-only tokeny sa spätne nezašifrujú: ich URL držiteľom fungujú, ak ostali aktívne, ale otvorenie v administrácii vráti `409 TOKEN_NOT_RECOVERABLE`. UI ponúka výslovnú náhradu pre toho istého partnera, bez zmeny histórie; import/obnova starej hodnoty sa nepodporuje.

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

Prisma CLI, klient a `@prisma/adapter-mariadb` používajú zhodnú verziu
**7.10.1**. Datasource URL pre CLI je v `prisma.config.ts`, nie v schéme;
migrácie čítajú `MIGRATE_DATABASE_URL`, aplikačný JS adaptér iba
`DATABASE_URL`. Existujúci podporovaný generátor `prisma-client-js` zostáva
kvôli kompatibilite importov; prechod na Prisma 7 nemení modely ani migračné SQL.
Runtime, seed aj diagnostika používajú spoločný `src/server/db-adapter.mjs`.

Adaptér percent-dekóduje meno, heslo a databázu a nastavuje UTC (`timezone: Z`).
Predvolené hodnoty sú pool **10 spojení**, connect timeout **5 s** a
čakanie na spojenie z poolu **10 s**. URL podporuje iba voliteľné kladné
celočíselné `connection_limit`, `connect_timeout` a `pool_timeout`
(časové hodnoty v sekundách). Duplicitné/nepodporované parametre spôsobia chybu,
nie tiché ignorovanie. Nastavenia starého Rust enginu sa automaticky
neprenášajú. Zvolený Docker deployment používa súkromnú internú DB sieť;
externá DB s TLS/socket požiadavkami potrebuje explicitnú konfiguráciu a
overenie adaptéra, nie odstránenie SSL parametrov alebo vypnutie overenia TLS.
Jednorazové skripty/testy musia zavolať `$disconnect()`, aby ukončili JS pool.
Pri porovnaní schémy v Prisma 7 použite
`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`;
príkaz je read-only, no vyžaduje schválený prístup k cieľovej DB.

## 7. `.env`
`.env.example` obsahuje necitlivé vývojové nastavenia a prázdne citlivé hodnoty. Pred spustením vyplňte v lokálnom `.env` heslá, `AUTH_SECRET` a DB URL podľa README. Compose pri chýbajúcom alebo prázdnom DB hesle skončí chybou; predvolené heslá nie sú povolené. Súbor `.env` je gitignored. Tajomstvá pre CI/CD patria do GitHub Actions Secrets alebo správcu tajomstiev, nie do repozitára.

| Premenná | Popis |
|---|---|
| `NODE_ENV` | `development` / `production` |
| `APP_BASE_URL` | verejná URL, z ktorej sa skladá adresa v QR a na NFC. Vo vývoji `http://localhost:3000`; produkčná doména je potvrdená ako `https://partners.europodlahy.sk` |
| `DATABASE_URL`, `MIGRATE_DATABASE_URL`, `SHADOW_DATABASE_URL`, `TEST_DATABASE_URL` | DB pripojenia; shadow DB používa iba `prisma migrate dev` |
| `MARIADB_ROOT_PASSWORD`, `DB_APP_PASSWORD`, `DB_MIGRATE_PASSWORD` | heslá pre DB a init skript |
| `AUTH_SECRET` | minimálne 32 náhodných bajtov |
| `TOKEN_ENCRYPTION_KEY` | samostatný stabilný AES-256-GCM kľúč, presne 64 hex znakov; vygenerovať `openssl rand -hex 32`, odlišný od `AUTH_SECRET` a DB hesiel, uložený a zálohovaný oddelene od DB |
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
Produkčné `AUTH_URL` nastavte na rovnaký verejný HTTPS origin ako
`APP_BASE_URL`, nie na interný HTTP host/port aplikácie. Produkčný Compose to
nastavuje priamo; prihlasovacie presmerovania proxy tiež používajú
`APP_BASE_URL`.
`TOKEN_ENCRYPTION_KEY` musí byť nakonfigurovaný pred vydávaním aj opätovným otváraním tokenov; bez neho operácie vrátia `503 TOKEN_KEY_MISSING`. Nesprávny kľúč alebo poškodená AES-256-GCM obálka spôsobí 500 s bezpečnou správou. Kľúč pri redeployi ani obnove náhodne nevymieňajte: bez pôvodného kľúča sa uložené tokeny nedajú znovu otvoriť. Associated data viažu obálku na firmu, partnera, typ a hash tokenu. Prípadná rotácia potrebuje riadené prešifrovanie, nie iba zmenu premennej.
`DATABASE_URL` je pre aplikáciu povinná. `MIGRATE_DATABASE_URL` vyžaduje konfigurácia Prisma pre databázové príkazy. `SHADOW_DATABASE_URL` sa nastavuje iba vo vývojovej konfigurácii Prisma pre `migrate dev`; pri `NODE_ENV=production` sa ignoruje a na serveri ju vynechajte. Shadow databáza nikdy nesmie byť totožná s hlavnou databázou. V produkcii používajte iba `npm run db:deploy`, nie `db:migrate` ani reset.

## 8. Build
`npm run build` najprv spustí `npm run db:generate` a až po úspešnom
vygenerovaní Prisma klienta spustí `next build`. Nakoniec
`scripts/prepare-standalone.mjs` doplní `public` a `.next/static` do standalone
balíka; Next.js ich sám nekopíruje. `npm start` spúšťa
`node .next/standalone/server.js`, teda rovnaký server ako Docker, nie
nekompatibilný `next start`. Pre lokálny štart možno nastaviť
`HOSTNAME=127.0.0.1 PORT=3000 npm start`.
Tieto kroky nemenia databázu a nenahrádzajú migrácie. Na hostingu netreba
samostatný krok `npm run db:generate`; pri čistej inštalácii použite
`npm ci --include=dev`, aby boli dostupné aj build nástroje.

V Hostcreatore možno po builde zapnúť krok `npm run %s` s parametrom
`db:check`. Spustí iba `SELECT 1`, nepotrebuje existujúce aplikačné tabuľky
a nevykonáva migrácie ani seed. Pri chybe vypíše diagnostiku bez pripojovacej
URL a hesla a skončí s nenulovým návratovým kódom. Úspech potvrdzuje iba
pripojenie, nie pripravenosť schémy alebo oprávnenia na migrácie.

Lokálne príkazy:
```
npm ci → lint → typecheck → test → prisma generate → next build (output: standalone)
docker build -t europodlahy-partners:<verzia> .
```
Pri buildovaní s `NODE_ENV=production` nastavte `APP_BASE_URL` na HTTPS doménu. Lokálny `.env` s `http://localhost:3000` je určený pre `npm run dev`.
`Dockerfile` (multi-stage): `deps` → `builder` → `runner` (`node:24-bookworm-slim`, non-root, OpenSSL pre Prisma, `TZ=UTC`, iba standalone výstup, `public` a `.next/static`). Build-time DB URL-y sú syntetické a slúžia len konfigurácii Prisma; build nespúšťa migrácie ani sa nepripája na DB. `AUTH_SECRET` použitý pri build-e je neplatný placeholder a runtime ho vždy vyžaduje z produkčného prostredia.

CI používa `npm ci --include=dev` aj pri `NODE_ENV=production`, aby nechýbal
Prisma CLI, TypeScript, ESLint a testovacie nástroje. Audit gate odmieta
HIGH/CRITICAL nálezy; aktuálny production-only audit má 0 nálezov, celý strom
obsahuje 16 MODERATE záznamov vo vývojovom lint nástroji (`minimatch`).
Nie je to dôkaz nulového rizika ani súhlas s neoverenými override/downgrade.
Presné výsledky a otvorené podmienky sú v
[centrálnom checkliste](production-remediation-checklist.md).

## 9. Deploy (server s Dockerom)
- `docker-compose.prod.yml`: `app` (non-root, bez publikovaného portu), `db` (iba interná sieť, bez verejného portu), `migrate` (spustí sa len explicitne cez profil `migration`) a `proxy` (`caddy:2.10.2-alpine`, Let's Encrypt, HSTS, presmerovanie HTTP→HTTPS). Databázový init vytvára iba produkčnú DB a oddelené migračné/aplikačné účty; migračný účet má práva iba v aplikačnej DB. Aplikačné tabuľkové práva nastavujú po migrácii existujúce `db:permissions`.
- Produkčný `.env` na serveri (práva `600`) obsahuje **cesty** k samostatným tajným súborom, nie ich hodnoty. Nastavte `APP_BASE_URL` = definitívna HTTPS doména a tieto premenné na cesty k čitateľným súborom, ktoré vytvorí bezpečný secret manager alebo prevádzkovateľ: `MARIADB_ROOT_PASSWORD_FILE`, `DB_APP_PASSWORD_FILE`, `DB_MIGRATE_PASSWORD_FILE`, `DATABASE_URL_FILE`, `MIGRATE_DATABASE_URL_FILE`, `AUTH_SECRET_FILE`, `TOKEN_ENCRYPTION_KEY_FILE`, `BADGE_CRON_SECRET_FILE`. Vlastníctvo a oprávnenia tajných súborov obmedzte na správcu služby. Súbory URL musia obsahovať príslušné DB účty; URL heslá percent-enkódujte. Compose pripojí každé tajomstvo len službám, ktoré ho potrebujú; runtime aplikácia nedostane migračné ani root prihlasovacie údaje. Entry point načíta hodnoty z read-only secret mountov do runtime procesu; nevypisuje ich. Docker daemon administrátori stále môžu kontrolovať kontajnerové procesy a secret mounty, preto obmedzte prístup k serveru a Docker socketu. Skutočné secret súbory a produkčné hodnoty sa v tomto repozitári nevytvárajú.
- DNS pre `APP_BASE_URL` musí smerovať na server a firewall musí povoľovať TCP 80/443 (UDP 443 je voliteľný HTTP/3). Caddy nastavuje `X-Real-IP` na IP priameho klienta; aplikačný port nie je publikovaný.
- Táto konfigurácia počíta s jednou inštanciou aplikácie. Rate limiting je
  v pamäti procesu, nie spoločný medzi replikami, a reštart ho vynuluje.
  Pred škálovaním treba overiť a zaviesť spoločné limity na dôveryhodnom
  ingress-e alebo v spoločnom úložisku; repliky nezapínajte s predpokladom,
  že súčasný limit platí globálne. Pred Caddy nepridávajte ďalšie proxy bez
  nového overenia dôveryhodných IP a HTTPS hlavičiek.

Pre každý release vytvorte nemenné tagy obrazu, napr. `partners-program:2026-11-02.1`, a zachovajte tag predchádzajúceho release pre rollback. `APP_IMAGE` a `MIGRATE_IMAGE` sú samostatné hodnoty; v produkčnom prostredí nespoliehajte na predvolené `:local` tagy. Pripravte obrazy:
```sh
APP_IMAGE=partners-program:2026-11-02.1 \
MIGRATE_IMAGE=partners-program-migrate:2026-11-02.1 \
docker compose -f docker-compose.prod.yml build app migrate
```

Pri prvej inštalácii DB služba vytvorí prázdnu produkčnú DB. Pred použitím aplikácie je nutné zálohovať/overiť prípadné existujúce dáta, migrovať schému a nastaviť aplikačné práva:
```sh
docker compose -f docker-compose.prod.yml --profile migration run --rm migrate
docker compose -f docker-compose.prod.yml exec -T db bash /docker/grant-app-privileges.sh
```
Tieto príkazy spúšťajú DB/migrácie alebo menia DB oprávnenia. Na existujúcej DB ich vykonajte až po schválenej zálohe, kontrole migrácie na kópii a explicitnom schválení prevádzkovateľa. Init skripty sa spúšťajú iba pri prázdnom MariaDB volume; zmena `.env` sama osebe nemení účty v už inicializovanej DB.

**Nasadenie novej verzie:**
1. záloha DB (`./scripts/db-backup.sh`); overte vytvorený súbor cez `./scripts/db-restore-test.sh <backup.sql.gz>`,
2. nahratie nového obrazu,
3. `prisma migrate deploy` (jednorazový kontajner s `MIGRATE_DATABASE_URL`),
4. `APP_IMAGE=partners-program:2026-11-02.1 docker compose -f docker-compose.prod.yml up -d --no-build app proxy`,
5. smoke test: `/api/health`, login, sken QR, nákup, karta, report, export; s nakonfigurovaným tokenovým kľúčom aj vydanie a opätovné otvorenie testovacieho tokenu bez nového vydania, nezávislosť QR/NFC a stiahnutie oboch strán karty.

**Rollback:** pri chybe kompatibilnej so schémou prepnite `APP_IMAGE` na zachovaný predchádzajúci release a spustite `docker compose -f docker-compose.prod.yml up -d --no-build app proxy`; potom overte healthcheck a smoke scenáre. Pred nasadením release zaznamenajte aktuálny image tag aj schému/migráciu. Ak release aplikoval migráciu, ktorá nie je spätne kompatibilná, nevracajte iba aplikáciu: zastavte zápisy a vykonajte vopred schválený plán obnovy zálohy alebo opravy dopredu. Obnova zálohy do produkcie je deštruktívna a vyžaduje samostatný explicitný súhlas.

## 10. Zálohy a monitoring
- Ručná lokálna záloha: `./scripts/db-backup.sh`. Skript dumpuje iba DB `europodlahy` s `--single-transaction`, triggers, routines, events a BLOB support; komprimuje do `.data/backups`, vytvára súbor s právami `0600` v adresári `0700`, testuje gzip stream a publikuje súbor až po úspechu. Používa read-only secret mount z databázového kontajnera; URL/heslo sa nevypisuje. Zálohy obsahujú citlivé osobné a účtovné údaje. Naplánujte denný beh mimo tejto aplikácie, retenčnú dobu 30 dní a šifrovanú kópiu mimo hosta cez schválený secret/backup manager; automatické mazanie a vzdialené úložisko sa v tomto repozitári nenastavujú.
- Izolovaná skúška: `./scripts/db-restore-test.sh .data/backups/<backup-file>.sql.gz`. Skript kontroluje gzip stream, vytvorí výhradne pomenovaný jednorazový MariaDB kontajner s `--network none` a nový jednorazový volume, obnoví dump a overí počet tabuliek a dokončených Prisma migrácií. Po úspechu aj chybe odstráni iba tento kontajner a jeho presne pomenovaný volume. Skript nikdy neobnovuje do Compose ani inej existujúcej databázy. Nezadávajte cudzie zálohy, ktoré ste neoprávnení čítať.
- Naplánujte pravidelný (mesačný) restore-test a zaznamenajte dátum, backup ID, obnovený počet tabuliek/migrácií a výsledok bez osobných údajov. Kľúč `TOKEN_ENCRYPTION_KEY` a DB backup musia mať samostatné, riadené obnovovacie postupy; nikdy ho neprikladajte k dumpu.
- DB záloha obsahuje tokenové hashe aj šifrované obálky, nie `TOKEN_ENCRYPTION_KEY`. Stabilný kľúč zálohujte bezpečne **oddelene od DB** s obmedzeným prístupom; pri teste obnovy overte znovuotvorenie tokenu s pôvodným kľúčom. Kľúč, hodnoty tokenov, ciphertext ani tokenové URL nepatria do logov či auditu.
- Docker healthcheck overuje `/api/health` a `SELECT 1`; endpoint vracia iba `{"status":"ok"}` alebo `{"status":"unavailable"}` bez detailov DB. Healthcheck sám neodosiela upozornenia a Compose reštartuje proces po jeho ukončení, nie iba preto, že je označený ako `unhealthy`. Externý HTTPS uptime check na `/api/health`, alerty pre nedostupnosť, DB unhealthy, zaplnenie disku, backup zlyhanie/starnutie a obnovu treba nakonfigurovať v cieľovom monitoringu. Vyberte poskytovateľa, náklady, príjemcov a eskaláciu; v repozitári nie sú vymyslené.
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
- [ ] `TOKEN_ENCRYPTION_KEY` je nastavený, stabilný a samostatne zálohovaný; opätovné otvorenie tokenu funguje.
- [ ] Testovací QR a NFC token otvoria správnu kartu na iPhone aj Androide.
- [ ] Opätovná tlač z otvorených detailov nevydá nový token; PDF oboch strán má 85,60 × 53,98 mm alebo kartu uprostred A4 s orezovými značkami. Tlač 100 %, skúšobný hárok; výstup je 600 dpi RGB bez spadávky/CMYK profilu, nie univerzálny výrobný podklad.
- [ ] NFC URL zapísať ako NDEF URI na NTAG213/215 kompatibilným zapisovačom, overiť načítanie a až potom uzamknúť; aplikácia čip automaticky nezapisuje.
- [ ] QR/NFC, zdieľané odkazy a exporty chrániť: bearer odkaz sprístupňuje verejnú históriu nákupov, nikdy právo na zápis.
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
