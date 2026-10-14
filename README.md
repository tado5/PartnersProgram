# Europodlahy – Partnerský evidenčný systém

Webová aplikácia na evidenciu partnerov, ich nákupov a získaných bodov. Technické a funkčné rozhodnutia sú v [implementačnom pláne](IMPLEMENTACNY_PLAN.md) a v priečinku [`docs/`](docs/).

**Fázy 5A–9 implementované:** globálny superadmin spravuje firmy a vo výslovne vybranej firme používa admin funkcie. Admin a predavač patria jednej firme; používatelia, partneri, tokeny, nákupy a audit sú oddelené. Nákupový flow podporuje QR, NFC v kompatibilných prehliadačoch, ručné vyhľadanie, zápis a soft delete. Verejná karta, reporty a audit prehliadač sú dostupné; PDF report sa dá stiahnuť z reportov. CSV exporty sú plánovanou fázou 10. Mobilná a databázová akceptácia zostáva samostatným krokom.

## Požiadavky

- Docker Desktop s Docker Compose
- Node.js 22 alebo novší a npm

## Spustenie

1. Skopírujte `.env.example` do `.env` a vyplňte povinné heslá, `AUTH_SECRET` a DB pripojenia podľa časti **Konfigurácia**.
2. Spustite iba databázu: `docker compose up -d db`.
3. Nainštalujte závislosti lokálne: `npm ci`.
4. Vytvorte databázy a účty: `npm run db:provision`.
5. Spustite migrácie a nastavte práva DB účtu aplikácie: `npm run db:migrate && npm run db:permissions`.
6. Vyplňte seed prihlasovacie údaje v `.env` a spustite `npm run db:seed`.
7. Spustite aplikáciu lokálne: `npm run dev`.
8. Otvorte [http://localhost:3000](http://localhost:3000).

MariaDB počúva iba na `127.0.0.1:3308`; jej dáta zostávajú v `.data/mariadb/`. Aplikácia a všetky Node nástroje bežia priamo na počítači, nie v Dockeri.

Po prihlásení seedovaným účtom sa zobrazí povinná zmena dočasného hesla. Admin môže účty vytvárať a spravovať v časti **Používatelia**; nové a resetované heslá sa musia zmeniť pri ďalšom prihlásení.

Pre samostatného superadmina nastavte spolu `SEED_SUPERADMIN_EMAIL` a `SEED_SUPERADMIN_PASSWORD` (min. 12 znakov). Seed existujúce účty nepovyšuje ani neprepisuje ich heslá. `SEED_ADMIN_*` patrí adminovi Europodlahy; iba vo vývoji sa s predavačom a ukážkovými dátami založí aj druhá firma. Bootstrap údaje po použití odstráňte. `AUTH_SECRET` musí byť stabilný aj lokálne pre podpísaný výber firmy.

Na vytvorenie troch lokálnych účtov pre rýchle testovanie spustite `npm run db:seed:local`: `superadmin.test@localhost` (globálny superadmin bez firmy), `admin.test@localhost` (admin Europodlahy) a `predavac.test@localhost` (predavač Europodlahy). Na `/login` sa na `localhost` zobrazia tlačidlá **Superadmin test**, **Admin test** a **Predavač test**; rýchle prihlásenie je povolené iba v development režime, na lokálnom hoste a pri `LOCAL_QUICK_LOGIN_ENABLED=true`. Tieto fixture účty nemajú použiteľné heslá a prihlasovací obchvat sa v produkcii zakazuje. Seed odmietne účet s kolidujúcim e-mailom v inej role/firme; nikdy ho automaticky nepovýši.

## Vývojové príkazy

Spúšťajte z koreňového priečinka projektu:

```sh
npm run lint
npm run typecheck
APP_BASE_URL=https://partners.europodlahy.sk npm run build
npm run test:phase6
npm run test:phase5a
npm run test:phase9
```

`test:phase5a` vyžaduje dostupný Docker Compose `db` a aktuálny produkčný build. Vytvorí samostatnú `europodlahy_5a_validation` (odmietne existujúcu), overí migráciu pôvodnej schémy s historickými dátami, izoláciu API/SSR, session limity, súbežné ochrany, audit, čistý `migrate deploy`, zhodu Prisma schémy a opakovaný seed; po teste DB aj testovací server odstráni. Bežnú vývojovú/testovaciu DB nemení. Mobilná/browserová akceptácia a migrácia reálnej DB sa tým nenahrádzajú.

## Konfigurácia

`.env.example` obsahuje zoznam premenných s prázdnymi citlivými hodnotami. Skutočný `.env` zostáva iba lokálne alebo na serveri a nesmie sa commitovať. `docker-compose.yml` vyžaduje neprázdne DB heslá; nemá predvolené heslá.

Pre `MARIADB_ROOT_PASSWORD`, `DB_APP_PASSWORD`, `DB_MIGRATE_PASSWORD` a `AUTH_SECRET` vygenerujte samostatné hodnoty príkazom `openssl rand -hex 32`. Výsledky vložte iba do lokálneho `.env`, nie do dokumentácie alebo commitu. DB pripojenia zostavte takto (zástupné hodnoty nahraďte lokálne):

```text
DATABASE_URL=mysql://europodlahy_app:<DB_APP_PASSWORD>@127.0.0.1:3308/europodlahy
MIGRATE_DATABASE_URL=mysql://europodlahy_migrate:<DB_MIGRATE_PASSWORD>@127.0.0.1:3308/europodlahy
SHADOW_DATABASE_URL=mysql://europodlahy_migrate:<DB_MIGRATE_PASSWORD>@127.0.0.1:3308/europodlahy_shadow
TEST_DATABASE_URL=mysql://europodlahy_migrate:<DB_MIGRATE_PASSWORD>@127.0.0.1:3308/europodlahy_test
```

Heslá obsahujúce špeciálne znaky musia byť v URL percent-encoded; hex hodnoty z uvedeného príkazu to nepotrebujú. Pri existujúcej databáze použite jej platné heslá: samotná zmena `.env` ich v databáze nezmení. Pre produkciu nastavte vlastné tajomstvá a správne `APP_BASE_URL`; v CI/CD používajte GitHub Actions Secrets alebo správcu tajomstiev cieľového prostredia.
