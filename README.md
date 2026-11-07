# PartnersProgram – systém na správu partnerských programov

Viacfiremná webová aplikácia na správu oddelených partnerských programov, partnerov, nákupov a získaných bodov. Europodlahy je jedna z firiem využívajúcich aplikáciu. Technické a funkčné rozhodnutia sú v [implementačnom pláne](IMPLEMENTACNY_PLAN.md) a v priečinku [`docs/`](docs/).

**Fázy 5A–10 implementované:** globálny superadmin spravuje firmy a vo výslovne vybranej firme používa admin funkcie. Admin a predavač patria jednej firme; používatelia, partneri, tokeny, nákupy a audit sú oddelené. Nákupový flow podporuje QR, NFC v kompatibilných prehliadačoch, ručné vyhľadanie, zápis a soft delete. Verejná karta, reporty a audit prehliadač sú dostupné; PDF report sa dá stiahnuť z reportov. CSV partnerov, nákupov, prehľadu a auditu je dostupné v **Exporty CSV** a priamo pri príslušných zoznamoch. Manuálna akceptácia fyzických zariadení, Excelu a produkčnej migrácie zostáva samostatným krokom.

**Logo firmy:** vlastný admin ho spravuje v nastaveniach firmy (PNG/JPEG/WebP do 2 MiB). Server ukladá zmenšené PNG priamo v DB; logo používa firemné menu, verejná partnerská karta aj PDF report. Bez loga sa zobrazí názov firmy. Superadmin môže logo iba prezerať. Súvisiaca migrácia: `20261015110000_company_logo`.

**Informovanie o osobných údajoch:** vlastný admin pripravuje a publikuje verziované oznámenie v nastaveniach firmy. Nový partner vyžaduje aktuálnu publikovanú verziu a evidenciu skutočného poskytnutia; existujúci partneri sa automaticky neoznačujú za informovaných. História je v detaile partnera, zoznam a CSV podporujú filter evidencie. Verejná karta odkazuje na oznámenie bez tokenu. Nejde o súhlas ani kompletné GDPR riešenie; právny obsah a retenčný/výmazový proces zostávajú samostatnou povinnosťou. Migrácia `20261015120000_privacy_notices` vyžaduje aj `npm run db:permissions`.

**GDPR dokument:** verejná stránka `/gdpr` obsahuje hlavný slovenský dokument a stiahnutie PDF. V nastaveniach firmy je text automaticky predvyplnený, názov a IČO sa preberú z údajov firmy; sídlo a kontaktný e-mail sa doplnia tam, keďže ich profil firmy zatiaľ neeviduje. Admin môže podľa potreby upraviť kontakty, podmienky a lehoty a publikovať firemnú verziu. Každá verzia má vlastné PDF na `/ochrana-udajov/{slug}?version=N&format=pdf`. Predvolené retenčné pravidlá nie sú univerzálne zákonné lehoty ani automatický výmaz: firma musí zabezpečiť ich dodržiavanie. Rozšírenie nevyžaduje ďalšiu DB migráciu.

**Validácia formulárov:** neplatné polia sa po opustení alebo odoslaní označia a zobrazí sa slovenský zoznam chýb s názvami polí. Odoslanie presunie používateľa na prvú chybu; položka v zozname umožní návrat na konkrétne pole aj na mobile. Serverové validačné chyby zobrazujú konkrétne polia namiesto samotného všeobecného upozornenia. Povinný dôvod či potvrdenie sa vysvetlí pri pokuse o akciu; tlačidlá zostávajú blokované počas spracovania. Pravidlá overovania na serveri zostávajú zachované.

**Detail partnera:** po údajoch partnera nasledujú mesačné ocenenia, QR/NFC tokeny, nákupy, evidencia informovania o spracúvaní údajov a nakoniec audit. Pri existujúcej evidencii informovania je formulár skrytý za tlačidlom **Zaznamenať ďalšie poskytnutie / opravu**; nový záznam pôvodnú históriu neprepisuje. Ak evidencia ešte chýba, formulár zostáva otvorený.

**QR/NFC a opätovná tlač – schválený kontrakt:** partner má jednu trvalú identitu a históriu, najviac jeden aktívny QR a jeden aktívny NFC token vo firme. Nezávislé odkazy otvárajú tie isté údaje a deaktivujú sa nezávisle. Admin alebo SA vo výslovne vybranej firme môže aktívny token znova otvoriť cez `POST /api/tokens/{tokenId}/open`: náhľad/stiahnutie QR PNG/SVG, prednej aj zadnej strany karty SVG/PDF, zdieľanie pri podpore, kopírovanie odkazu a otvorenie verejnej karty. Tlač nevydáva nový token; výslovná náhrada vyžaduje výber starého tokenu rovnakého typu a dôvod, atomicky ho vyradí bez zmeny partnera/histórie. Zoznam vracia iba metadáta. Staré hash-only tokeny nemožno rekonštruovať (`TOKEN_NOT_RECOVERABLE`); UI vysvetlí náhradu, nie import/obnovu. Bearer odkaz sprístupňuje verejnú históriu nákupov, **nikdy právo zapisovať**. NFC URL treba fyzicky zapísať ako NDEF URI na NTAG213/215 a uzamknúť až po overení; aplikácia čip automaticky nezapisuje.

Nové tokeny majú hash aj AES-256-GCM šifrovanú hodnotu. Pred vydávaním a otváraním nastavte samostatný stabilný `TOKEN_ENCRYPTION_KEY` (64 hex znakov), zálohovaný oddelene od DB. Migrácia `20261020090000_reopenable_partner_tokens` vynucuje limit aktívnych tokenov; pri súčasných **testovacích** duplicitách zachová najnovší podľa času/ID a ostatné deaktivuje, bez mazania či zmeny nákupov. **Na reálne predexistujúce produkčné dáta ju nemožno použiť nezmenenú:** vyžadujú zámerný výber zachovaného tokenu. Podrobnosti: [API](docs/api.md#3-tokeny), [dátový model](docs/data-model.md#3-partner_tokens), [nasadenie a zálohy](docs/deployment.md).

**Tmavý vzhľad:** spoločné štýly mapujú aj staršie hover utility na priesvitné zvýraznenie a svetlý text. Zoznamy partnerov, výber partnera, exporty a QR/NFC akcie tak pri prejdení myšou neprechádzajú na biele pozadie.

## Požiadavky

- Docker Desktop s Docker Compose
- Node.js 22 alebo novší a npm

## Spustenie

1. Skopírujte `.env.example` do `.env` a vyplňte povinné heslá, `AUTH_SECRET`, samostatný `TOKEN_ENCRYPTION_KEY` pre vydávanie/otváranie tokenov a DB pripojenia podľa časti **Konfigurácia**.
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
npm run test:phase10
npm run test:acceptance
npm run test:phase11
```

`test:phase5a` vyžaduje dostupný Docker Compose `db` a aktuálny produkčný build. Vytvorí samostatné schémy `europodlahy_5a_validation` a `europodlahy_5a_validation_shadow` (odmietne existujúce), overí migráciu pôvodnej schémy s historickými dátami, izoláciu API/SSR, session limity, súbežné ochrany, audit, čistý `migrate deploy`, zhodu Prisma schémy a opakovaný seed; po teste obe schémy aj testovací server odstráni. Bežnú vývojovú/testovaciu DB nemení. Mobilná/browserová akceptácia a migrácia reálnej DB sa tým nenahrádzajú.

`test:browser` pridá k izolovaným DB kontrolám skutočný headless Google Chrome (`channel: chrome`, vyžaduje lokálne nainštalovaný Chrome): audit na desktope aj pri dotykovom viewporte 390 px, prepínanie firmy, ručný zápis nákupu a verejnú kartu. `test:acceptance` navyše spustí integračné CSV testy a browserové sťahovanie exportov. Aplikácia pri týchto testoch beží iba lokálne na porte 3017; testovací HTTPS origin sa presmeruje do lokálneho servera. Nepoužíva sa externá služba ani reálna firemná DB. Testy odmietnu existujúce validačné schémy; po skončení odstránia len vlastné schémy a server.

`test:unit` spustí všetky jednotkové testy bez DB. `test:phase11` spojí jednotkové testy s celou izolovanou akceptáciou a rozšírenými HTTP/browserovými scenármi. Vyžaduje aktuálny produkčný build rovnako ako `test:acceptance`; nič nenasadzuje. Inventár API kontroluje 37 route súborov / 53 explicitných metód a role neprihlásený/predavač/admin/superadmin; pri novej metóde bez scenára zlyhá. Auth.js a cron majú vlastné kontrolné scenáre, nie úplnú permutáciu všetkých interných akcií. Browser dopĺňa cudzie ID, zmenu obdobia/PDF, úpravu a soft delete s dôvodom, prepnutie firmy v druhom tabe, deaktiváciu firmy, návrat v histórii po odhlásení, logá a GDPR oznámenia/evidenciu poskytnutia.

Pred integračnými testami vytvorte aktuálny build: `LOCAL_QUICK_LOGIN_ENABLED=false APP_BASE_URL=https://partners.europodlahy.sk npm run build`. Lokálny `.env` sa nemení. Mobilný viewport v Chrome **nenahrádza Safari na iPhone, Chrome na fyzickom Androide, kameru ani NFC**; manuálny checklist je v [docs/screens.md](docs/screens.md#5-manuálna-akceptácia-na-zariadeniach).

CSV používa slovenské nastavenie čísel. Ak Excel po priamom otvorení nerozdelí stĺpce alebo nerozpozná čísla, zvoľte **Dáta → Z textu/CSV**, kódovanie **UTF-8**, oddeľovač **bodkočiarka** a slovenské miestne nastavenie (desatinná čiarka). Nezmeňte kvôli importu globálne nastavenia počítača.

## Konfigurácia

`.env.example` obsahuje zoznam premenných s prázdnymi citlivými hodnotami. Skutočný `.env` zostáva iba lokálne alebo na serveri a nesmie sa commitovať. `docker-compose.yml` vyžaduje neprázdne DB heslá; nemá predvolené heslá.

Pre `MARIADB_ROOT_PASSWORD`, `DB_APP_PASSWORD`, `DB_MIGRATE_PASSWORD` a `AUTH_SECRET` vygenerujte samostatné hodnoty príkazom `openssl rand -hex 32`. Výsledky vložte iba do lokálneho `.env`, nie do dokumentácie alebo commitu. DB pripojenia zostavte takto (zástupné hodnoty nahraďte lokálne):

```text
DATABASE_URL=mysql://europodlahy_app:<DB_APP_PASSWORD>@127.0.0.1:3308/europodlahy
MIGRATE_DATABASE_URL=mysql://europodlahy_migrate:<DB_MIGRATE_PASSWORD>@127.0.0.1:3308/europodlahy
SHADOW_DATABASE_URL=mysql://europodlahy_migrate:<DB_MIGRATE_PASSWORD>@127.0.0.1:3308/europodlahy_shadow
TEST_DATABASE_URL=mysql://europodlahy_migrate:<DB_MIGRATE_PASSWORD>@127.0.0.1:3308/europodlahy_test
```

Pre `TOKEN_ENCRYPTION_KEY` vygenerujte **ďalšiu samostatnú hodnotu** cez `openssl rand -hex 32` (presne 64 hex znakov), nepoužívajte `AUTH_SECRET` ani DB heslo. Uchovávajte ju stabilnú medzi nasadeniami a bezpečne zálohujte oddelene od DB. Chýbajúci kľúč blokuje vydanie/otvorenie chybou `503 TOKEN_KEY_MISSING`; nesprávny kľúč či poškodená obálka vráti bezpečnú 500. Náhodná výmena kľúča znemožní znovuotvorenie existujúcich šifrovaných tokenov.

Heslá obsahujúce špeciálne znaky musia byť v URL percent-encoded; hex hodnoty z uvedeného príkazu to nepotrebujú. Pri existujúcej databáze použite jej platné heslá: samotná zmena `.env` ich v databáze nezmení. Pre produkciu nastavte vlastné tajomstvá a správne `APP_BASE_URL`; v CI/CD používajte GitHub Actions Secrets alebo správcu tajomstiev cieľového prostredia.
