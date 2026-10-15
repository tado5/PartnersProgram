# Europodlahy – Partnerský evidenčný systém
## Implementačný plán (MVP) – hlavný dokument

> **Zdroj pravdy.** Pri rozpore s ostatnými dokumentmi platí tento súbor; rozpor sa musí opraviť v oboch.
> Dokumentácia je hotová pred začiatkom implementácie. Implementuje sa až po potvrdení otázok v [docs/open-questions.md](docs/open-questions.md) (aspoň tých, ktoré blokujú danú fázu).

---

## 1. Cieľ MVP
Jednoduchá, hotová webová aplikácia, ktorá:
- umožňuje superadminovi založiť viac firiem; každá firma má vlastný, dátovo oddelený partnerský program,
- eviduje vybraných partnerov (montážnik, firma, odporúčateľ),
- dáva partnerom QR kód (povinne) a voliteľne NFC kartu,
- umožňuje prihlásenému predavačovi alebo adminovi zapísať nákup k partnerovi,
- automaticky pripočíta body zo sumy bez DPH (1 € netto = 1 bod, zaokrúhlenie nadol),
- partnerovi po naskenovaní zobrazí kartu s bodmi, obratom a históriou, ktorú si môže iba prezerať.

Koncový zákazník nedostáva zľavu. Systém iba eviduje.

**Rozšírenie schválené 2026-10-08:** superadmin môže vytvárať a spravovať všetky firmy aj ich obchodné údaje. Admin a predavač majú prístup iba k svojej firme. Implementované moduly a zostávajúca akceptácia sú uvedené pri jednotlivých fázach nižšie. „Firma“ ako prevádzkovateľ programu je samostatná entita, nie typ partnera `company`.

## 2. Dokumentácia

| Súbor | Obsah |
|---|---|
| `IMPLEMENTACNY_PLAN.md` | prehľad, záväzné rozhodnutia, rozsah, fázy implementácie |
| [docs/architecture.md](docs/architecture.md) | architektúra, stack, štruktúra projektu, moduly |
| [docs/data-model.md](docs/data-model.md) | tabuľky, stĺpce, vzťahy, indexy, obmedzenia |
| [docs/api.md](docs/api.md) | endpointy, roly, vstupy a výstupy |
| [docs/screens.md](docs/screens.md) | obrazovky, roly, používateľské flow |
| [docs/security.md](docs/security.md) | tokeny, oprávnenia, audit, mazanie, verejná karta |
| [docs/deployment.md](docs/deployment.md) | lokálny vývoj, Docker, MariaDB, `.env`, build, deploy |
| [docs/open-questions.md](docs/open-questions.md) | otvorené otázky a rozhodnutia na potvrdenie |

## 3. Záväzné rozhodnutia

| # | Téma | Rozhodnutie | Detail |
|---|---|---|---|
| R1 | Aplikácia | **Jedna Next.js aplikácia** (App Router, TypeScript). Frontend je **React** v rámci Next.js. UI, serverová logika aj API sú v jednom projekte. | architecture |
| R2 | Prostredie | Vývoj vyžaduje Docker pre MariaDB a Node.js 22/npm na počítači pre Next.js a nástroje. Závislosti aplikácie sa inštalujú lokálne z `package-lock.json`. | deployment |
| R3 | Databáza | MariaDB 11.4 LTS v Dockeri, konfigurácia je súčasťou projektu. | deployment |
| R4 | Tokeny | 256-bitové náhodné tokeny. V DB sa ukladá **iba SHA-256 odtlačok**. Partner môže mať **viac aktívnych tokenov** (QR aj NFC). | security |
| R5 | Opätovná tlač QR | Vygeneruje sa **nový token**. Pôvodný sa obnoviť nedá a môže sa deaktivovať (predvolene áno). | security |
| R6 | Zápis | Nákup môže zapísať **iba prihlásený admin alebo predavač svojej firmy, alebo superadmin vo výslovne vybranej firme**. QR/NFC slúži len na identifikáciu. | security |
| R7 | Verejná karta | **Iba na čítanie**, zobrazuje iba presne určený zoznam údajov. Interná poznámka sa nikdy nezobrazuje. | screens, security |
| R8 | Mazanie | Nákupy sa **nikdy nemažú fyzicky**, iba sa označia ako zmazané (soft delete). Pri úprave aj zmazaní je **povinný dôvod** a záznam v audit logu. | security, data-model |
| R9 | Audit log | **Nemenný** – DB práva umožňujú iba čítanie a vkladanie a triggre blokujú úpravu aj mazanie. | security |
| R10 | Body | `body = FLOOR(net_amount)`, kde sa nákup zadáva s DPH a netto sa vypočíta serverom. Pri 23 % DPH, 19,99 € brutto = 16,25 € netto = 16 bodov. | data-model |
| R11 | Vratky | Žiadna samostatná logika – admin nákup ručne upraví alebo zmaže (s dôvodom). | screens |
| R12 | NFC | **Voliteľné** ako alternatíva ku QR. QR musí vždy plne fungovať. NFC funguje iba tam, kde ho prehliadač podporuje. | screens |
| R13 | Doména | Musí byť **definitívna pred tlačou QR a zápisom NFC kariet**. Po jej zmene staré kódy prestanú fungovať. | deployment, open-questions |
| R14 | Reporty | Iba jednoduché: mesačný prehľad partnerov, detail partnera, história nákupov. | screens |
| R15 | Kód partnera | `EP-` + 5 náhodných znakov bez zameniteľných znakov, napr. `EP-7K3MX`. Je to **iba interný identifikátor pre predavača**, nemenný, nie je prístupovým údajom. Partnera musí byť možné nájsť aj **podľa mena alebo telefónu**. | data-model |
| R16 | Údaje partnera | **Povinné: typ, zobrazované meno.** Nepovinné: telefón, e-mail, kontaktná osoba, IČO, interná poznámka. Verejná karta zobrazuje iba meno a kód; predavač vidí telefón čiastočne maskovaný. | data-model |
| R17 | Prihlásenie | Predavač: 60 min nečinnosti, max. 10 h. Admin a superadmin: 30 min a 8 h. Bez „zapamätať si ma“. | security |
| R18 | Úvodná stránka po prihlásení | Admin aj predavač pristávajú na `/app`, kde sa zobrazí dashboard svojej firmy podľa roly. Superadmin pristáva na `/superadmin/firmy` a vyberá firmu na správu. | screens, api |
| R19 | Viac firiem | Jedna aplikácia a spoločná MariaDB; firemné údaje sú oddelené cez `company_id` a povinné serverové kontroly. Žiadne spoločné body, história, partneri ani tokeny medzi firmami. | architecture, data-model, security |
| R20 | Superadmin | Globálna rola `superadmin`: zoznam, založenie, úprava a deaktivácia firiem, vytvorenie prvého admina, správa všetkých firiem. Obchodné operácie vždy v kontexte jednej firmy; audit uchová skutočnú identitu superadmina. | screens, api, security |
| R21 | Firemné účty | Admin a predavač patria práve jednej firme; superadmin nepatrí žiadnej. E-mail účtu zostáva globálne unikátny. Admin nemôže vytvoriť superadmina ani meniť priradenie používateľa k firme. | data-model, security |
| R22 | Deaktivácia firmy | Iba superadmin s dôvodom. Okamžite zablokuje firemný prístup, skenovanie aj verejné karty bez zmazania údajov. Superadmin môže firmu naďalej spravovať, prezerať a exportovať jej údaje, nie zapisovať, upravovať alebo mazať nákupy či vydávať tokeny do neaktívneho programu. | security, api |

## 4. Rozsah

**V MVP:** autentifikácia (superadmin, admin, predavač), správa firiem superadminom, dátovo oddelené firemné programy, správa partnerov, QR/NFC tokeny, zápis nákupov, verejná karta, jednoduché reporty, audit log, CSV export, správa používateľov v rámci firmy.

**Mimo MVP:** pokladňa, eKasa, čerpanie a vyplácanie bodov, registrácia a prihlasovanie partnerov, mobilná alebo desktopová aplikácia, zložité reporty a grafy, samostatná logika vratiek, notifikácie, 2FA, viac predajní.

Viac samostatných firiem je v MVP; viac predajní v rámci jednej firmy zostáva mimo MVP. Mimo MVP sú tiež predplatné/fakturácia platformy, vlastné domény a individuálne bodové pravidlá firiem, zdieľanie partnerov a členstvo jedného účtu vo viacerých firmách. Na začiatku zostáva spoločná doména, formát kódu `EP-XXXXX`, EUR, časové pásmo `Europe/Bratislava` a pravidlo 1 € = 1 bod.

## 5. Roly (súhrn)

| Rola | Prihlásenie | Môže |
|---|---|---|
| Superadmin | áno | všetky firmy, ich založenie a prvý admin; po výbere firmy aj všetky admin funkcie jej programu; platformový audit |
| Admin | áno | iba vlastná firma: partneri, tokeny, nákupy vrátane úpravy a zmazania, reporty, audit, exporty, používatelia |
| Predavač | áno | iba vlastná firma: dashboard s rýchlym skenovaním a vlastnými dnešnými zápismi; vyhľadať partnera a zapísať nákup |
| Partner | nie | iba prezerať svoju kartu cez QR/NFC |

## 6. Fázy implementácie

Pravidlo: fáza je hotová, až keď prejdú všetky body „Hotové keď“. Každá fáza aktualizuje dotknutú dokumentáciu.

**Nové poradie od 2026-10-08:** pred fázou 6 sa implementuje fáza **5A**. Stavy fáz 1–5 nižšie opisujú pôvodnú jednofiremnú verziu; nenahrádzajú akceptáciu izolácie firiem. Fáza 5A upraví existujúce modely, autentifikáciu, partnerov a tokeny; všetky nasledujúce fázy musia používať firemný kontext.

### Fáza 0 – Dokumentácia ✅
- **Cieľ:** schválená dokumentácia (tento súbor a `docs/`).
- **Hotové keď:** zadávateľ potvrdil dokumenty a blokujúce otázky v `open-questions.md`.
- **Stav (2026-10-07):** dokumentácia je schválená; Q4, Q5 a Q12 sú potvrdené → **fázy 1–4 sú uzamknuté**.

### Fáza 1 – Základ projektu
- **Cieľ:** Next.js aplikácia beží lokálne, Docker Compose spúšťa iba databázu.
- **Úlohy:** `docker-compose.yml` iba pre `db`; Next.js projekt (App Router, TS strict, ESLint, `src/`); Tailwind a shadcn/ui; štruktúra priečinkov; `.env.example` a validácia env; slovenské formátovanie meny a dátumu; npm skripty; README.
- **Závislosti:** Fáza 0, pokyn zadávateľa na začatie implementácie.
- **Riziká:** pomalý bind mount na macOS; nekompatibilita verzií → pevné verzie a `package-lock.json`.
- **Hotové keď:** na Macu s Dockerom a Node.js 22 alebo novším spustí `docker compose up -d db` databázu a `npm run dev` aplikáciu na `localhost:3000`; lint a typecheck prejdú.
- **Stav (2026-10-07):** dokončená.

### Fáza 2 – Databáza a modely
- **Cieľ:** schéma, migrácie, DB účty, seed.
- **Úlohy:** Prisma schéma pre 5 tabuliek; SQL doplnky (`CHECK`, triggre pre audit); init skript (DB `europodlahy`, `europodlahy_test` a tieňová DB Prisma, účty `migrate` a `app`); seed; repositories; Zod schémy.
- **Závislosti:** Fáza 1.
- **Riziká:** Prisma nepodporuje triggre ani CHECK → ručne upravená SQL migrácia.
- **Hotové keď:** migrácia prebehne na prázdnej DB; `UPDATE audit_logs` a `DELETE FROM purchases` účtom aplikácie zlyhajú; suma ≤ 0 zlyhá.
- **Stav (2026-10-07):** dokončená; schéma, migrácia, účty a seed overené na lokálnej MariaDB.

### Fáza 3 – Autentifikácia a roly
- **Cieľ:** prihlásenie a kontrola rolí.
- **Úlohy:** Auth.js Credentials, argon2id, JWT session (predavač: 60 min nečinnosti, max. 10 h; admin: 30 min a 8 h); `middleware.ts`; guardy `requireRole`; ochrana proti hádaniu hesla; zmena hesla a vynútená zmena dočasného hesla; správa používateľov; služba `audit.record()`.
- **Závislosti:** Fáza 2.
- **Riziká:** JWT sa nedá odvolať → kontrola `is_active` pri každej požiadavke.
- **Hotové keď:** neprihlásený používateľ je presmerovaný na login; predavač dostane 403 na admin API; deaktivovaný používateľ okamžite stratí prístup; prihlásenia sú v audite.
- **Stav (2026-10-07):** implementované; login cez Auth.js Credentials, Argon2id, JWT session, časové limity podľa roly, kontrola aktivity účtu a zmeny hesla, ochrana proti hádaniu, povinná zmena dočasného hesla, API a obrazovka správy používateľov, audit loginov a používateľských zmien. `proxy.ts` chráni routy podľa konvencie Next.js 16; rozhodujúce overenia sú v serverových guardoch. Build, lint, typecheck a unauthenticated smoke testy prešli; DB akceptačné scenáre fázového checklistu čakajú na dostupnú `.env` a databázu.

### Fáza 4 – Správa partnerov
- **Cieľ:** admin spravuje partnerov.
- **Úlohy:** API a obrazovky (zoznam, detail, formulár); náhodný kód `EP-XXXXX`; minimálny zoznam údajov (povinné: typ, meno); vyhľadávanie podľa kódu, mena a telefónu; deaktivácia s dôvodom; audit; zúžený pohľad pre predavača.
- **Závislosti:** Fáza 3.
- **Riziká:** duplicitní partneri → varovanie pri zhodnom IČO alebo telefóne; kolízia náhodného kódu → unikátny index a nové vygenerovanie.
- **Hotové keď:** admin vytvorí, upraví a deaktivuje partnera, zmeny sú v audite a predavač partnera upraviť nevie.
- **Stav (2026-10-07):** implementované API a obrazovky pre zoznam, detail, vytvorenie, úpravu, deaktiváciu a aktiváciu; kód sa generuje CSPRNG, kolízie sa opakujú, duplicity telefónu/IČO zobrazia varovanie, zápisy sa auditujú v transakcii. Predavač má vyhľadávanie aktívnych partnerov so zúženými údajmi a zápisové API je admin-only. Typcheck, lint, produkčný build, smoke testy rolí a kompletný admin CRUD scenár vrátane auditu prešli na izolovanej testovacej DB.

### Fáza 5 – QR/NFC tokeny
- **Cieľ:** partner má jeden alebo viac aktívnych tokenov; QR plne funguje, NFC je voliteľné.
- **Úlohy:** služba `tokens` (generovanie, odtlačok, overenie, deaktivácia); API; sekcia tokenov v detaile partnera; jednorazový dialóg (QR PNG/SVG, tlačová karta, URL pre NFC); opätovná tlač = nový token; návod na zápis NFC; kontrola `APP_BASE_URL`.
- **Závislosti:** Fáza 4. Implementácia a testy bežia na `localhost`; definitívna doména (Q1) je potrebná až pred **tlačou** kariet.
- **Riziká:** admin zavrie dialóg bez stiahnutia QR → riešením je nový token.
- **Hotové keď:** QR otvorí kartu na iPhone aj Androide; NFC karta otvorí tú istú kartu; partner má súčasne aktívny QR aj NFC; deaktivovaný token vráti 404 a ostatné fungujú ďalej; v DB nie je žiadny plný token.
- **Stav (2026-10-07):** implementované generovanie 256-bit tokenov, SHA-256 odtlačky, auditované API na vytvorenie/zoznam/deaktiváciu a jednorazové QR PNG/SVG s tlačou a NFC URL; detail partnera zobrazuje a spravuje tokeny. Pridané aj obmedzenie skenovania 30 požiadaviek/min/IP. Typcheck, lint a produkčný build prešli. Akceptačné testy s DB a mobilnými zariadeniami čakajú na nakonfigurované prostredie; úplné otvorenie `/k/{token}` sa overí po implementácii verejnej karty vo fáze 7.

### Fáza 5A – Superadmin a oddelené firemné programy
- **Cieľ:** superadmin zakladá firmy a ich prvých adminov; každá firma samostatne používa celý partnerský program.
- **Úlohy – model a migrácia:** tabuľka `companies`, rola `superadmin`, firemný kontext používateľov, partnerov, tokenov, nákupov a auditu; indexy a ochrana pred väzbami medzi firmami; existujúce dáta priradiť firme Europodlahy bez straty ID, odtlačkov tokenov a histórie; zachovať nemennosť auditu.
- **Úlohy – oprávnenia:** centrálne serverové overenie firmy pri každom čítaní a zápise vrátane SSR a Server Actions; admin/predavač čerpajú firmu z overeného účtu, superadmin výslovne vyberá kontext; rola, aktivita používateľa aj firmy sa overujú pri každej požiadavke; firemné API odmietne cudzie ID neutrálnou 404.
- **Úlohy – UI/API:** `/superadmin/firmy`, pridanie a detail firmy, úprava, deaktivácia s dôvodom a aktivácia; založenie firmy a prvého admina v jednej transakcii; vstup do firemného programu s viditeľným názvom firmy a návratom na zoznam; prepnutie firmy nesmie preniesť formuláre, dáta ani cache predchádzajúcej firmy.
- **Úlohy – existujúce moduly:** upraviť autentifikáciu, používateľov, partnerov, tokeny, skenovacie API, seed a DB práva; sken cudzej firemnej karty nesmie sprístupniť partnera ani zápis. Verejná karta vo fáze 7 odvodí firmu z tokenu a overí jej aktivitu.
- **Úlohy – audit a bootstrap:** bezpečne vytvoriť prvého superadmina z jednorazových seed údajov, vynútiť zmenu hesla, nepreviesť bežných adminov automaticky na superadminov; zaznamenať správu firiem, vstupy superadmina do firemného kontextu a jeho operácie so skutočným aktérom; chrániť posledného aktívneho superadmina a posledného admina každej aktívnej firmy.
- **Závislosti:** implementované základy fáz 1–5; viacfiremný rozsah a práva superadmina potvrdené zadávateľom 2026-10-08.
- **Riziká:** únik údajov cez zabudnutý filter, priame ID, agregácie, exporty, audit, QR/NFC alebo cache; nesprávne priradenie historických dát; neúmyselné povýšenie existujúceho admina.
- **Hotové keď:** superadmin založí dve firmy s adminmi; tí vedia spravovať iba svoj program a vytvoriť vlastného predavača; pokusy o čítanie aj zápis cudzieho používateľa, partnera, tokenu či nákupu zlyhajú; superadmin môže vedome spravovať obe firmy a audit zachová jeho identitu; deaktivovaná firma okamžite stratí firemný aj tokenový prístup; prepnutie firmy nezobrazí staré dáta; migrované dáta a tokeny Europodlahy zostanú zachované a audit zostane nemenný.
- **Stav (2026-10-08):** implementované `companies`, globálny superadmin, povinné členstvo firemných účtov, compound FK, firemné guardy API/SSR/Actions a všetky existujúce moduly vrátane purchase repositories. Superadmin má API a UI zoznamu/založenia/detailu/úpravy/aktivácie/deaktivácie firiem, atomický prvý admin a explicitný kontext (`X-Company-Id`, podpísaná session HttpOnly cookie). Prepnutie zahodí klientsku cache/stav; staré formuláre sa odmietajú cez identifikátor výberu. Aktéri sa auditujú bez impersonácie; transakčné zámky chránia posledného admina/superadmina a pozastavené programy. Bezpečný oddelený bootstrap a dvojfiremné fixtures sú súčasťou seedu. **Prešli lint, typecheck, produkčný build a `test:phase5a`** na izolovanej MariaDB 11.4.10 vrátane zachovania historického auditu bez vypnutia triggerov, ID/odtlačkov, čistého deploy, API/SSR izolácie, sessions a súbežných ochrán. **Nie je tým potvrdená migrácia reálnej vývojovej/produkčnej DB, obnova produkčnej zálohy ani manuálna browserová/mobilná akceptácia.** Verejná karta, reporty a exporty zostávajú na príslušné ďalšie fázy.

- **Lokálne sprevádzkovanie (2026-10-08):** migrácia `20261008130000_companies` aplikovaná aj na vývojovú DB `europodlahy` po zálohe; nastavené DB práva a samostatný globálny účet `superadmin.test@localhost`. Lokálny login má tri testovacie vstupy (superadmin/admin/predavač), dostupné iba v development na localhost. Produkčná migrácia a manuálna akceptácia zostávajú samostatné úlohy.

### Fáza 6 – Zápis nákupov
- **Cieľ:** sken a zápis nákupu za pár sekúnd cez mobilný telefón; mobile-first web UI je základná požiadavka, nie voliteľná optimalizácia.
- **Úlohy:** skener QR (vždy), Web NFC (iba ak ho prehliadač podporuje), ručné vyhľadanie; formulár (suma, osobne áno/nie, dátum a čas, poznámka); výpočet bodov na serveri; ochrana pred dvojitým uložením (`idempotency_key`); úprava a soft delete s dôvodom (admin); firemný nastaviteľný limit potvrdenia; plne použiteľné mobilné UI.
- **Závislosti:** Fázy 4, 5 a 5A; všetky nákupy, partneri, tokeny a súčty sú obmedzené na aktuálnu firmu.
- **Riziká:** kamera vyžaduje HTTPS → profil `mobile` (Caddy); Web NFC chýba na iOS → QR a ručné vyhľadanie.
- **Hotové keď:** predavač zvládne celý tok (prihlásenie, QR sken alebo ručné vyhľadanie, zadanie sumy s DPH a uloženie nákupu) pohodlne na telefóne; akceptácia prebehne na iPhone aj Androide; pri 23 % DPH 19,99 € brutto dá 16,25 € netto a 16 bodov; dvojklik nevytvorí 2 nákupy; úprava ani zmazanie bez dôvodu nie sú možné; zmazaný nákup ostane v DB a nezapočíta sa.
- **Rozhodnutia (2026-10-13):** hranica na potvrdenie sa nastavuje za každú firmu, predvolene je vypnutá a pri dosiahnutí/prekročení potvrdzuje zapisujúci používateľ; predavač môže upraviť dátum pri vytvorení nákupu, ale neskoršie úpravy/zmazanie sú iba adminovi. Predavač vždy zadáva sumu s DPH; sadzba je nastaviteľná per firma (default 23 %), sadzba a netto sa ukladajú ako nemenný snapshot, a body sa počítajú z netto sumy.
- **Stav:** funkčnosť, API, databázové nastavenie a UI sú implementované; mobilná akceptácia iPhone/Android a DB integračné scenáre zostávajú na overenie. Migrácia priraďuje existujúcim nákupom 23 % a predpokladá, že uložená suma už obsahovala DPH; historickú skutočnú sadzbu nie je možné spätne zistiť.

### Fáza 7 – Verejná karta
- **Cieľ:** karta partnera, ktorú si môže iba prezerať, vrátane aktuálneho mesačného odznaku a jeho histórie.
- **Úlohy:** `/k/[token]` bez cache; firma odvodená výlučne z tokenu, overenie aktivity firmy aj partnera; DTO iba s povolenými poľami vrátane názvu prevádzkujúcej firmy, aktuálneho odznaku a historických ocenení; tabuľka mesačných snapshotov a opakovateľné uzatvorenie skončeného mesiaca; správa firemných hraníc; neutrálna 404; bezpečnostné hlavičky; obmedzenie počtu požiadaviek; `last_used_at`.
- **Závislosti:** Fázy 5 a 6.
- **Hotové keď:** súčty a mesačný obrat bez DPH sa zhodujú s detailom partnera svojej firmy; každý partner dosahujúci aktívnu hranicu dostane najvyšší odznak; história zobrazuje správny počet mesiacov za každý tier a uložené ocenenia sa nemenia pri následnej úprave nákupov/hraničných hodnôt; uzatváranie mesiaca je idempotentné; token neotvorí program inej firmy a neaktívna firma vráti neutrálnu 404; na karte nie je poznámka ani kontakt; požiadavky iné ako GET vrátia 405.
- **Rozšírenie odznakov potvrdené (2026-10-13):** každá firma si môže nastaviť vlastné hranice Bronzového, Strieborného a Zlatého partnera; predvolene sú všetky vypnuté. Každý partner dosahujúci hranicu získa daný odznak, bez kvóty ani poradia. Aktuálny mesiac sa počíta priebežne; po jeho skončení sa uloží nemenné ocenenie a karta/admin zobrazia aj počet mesiacov a históriu podľa tieru. Podrobnosti v [open-questions Q15](docs/open-questions.md#q15--mesačné-odznaky-partnera).
- **Stav:** implementácia, lint, typová kontrola, unit testy a produkčný build prešli. HTTP smoke test potvrdil neutrálnu 404 pre neplatný token a 405 pre POST. Databázové integračné testy, migrácia na cieľovej DB a overenie platného/neznámeho tokenu proti DB zostávajú na vykonanie, pretože Docker/DB nie sú dostupné; mesačný cron treba nakonfigurovať pri nasadení.

### Fáza 8 – Reporty
- **Cieľ:** jednoduché prehľady.
- **Úlohy:** role-based dashboard na úvodnej stránke `/app` pre admina aj predavača; admin: mesačný obrat, body a počet nákupov, počet aktívnych partnerov a posledných 10 nákupov; predavač: výrazné tlačidlo na skenovanie a iba jeho dnešné zápisy; voliteľný výber mesiaca; mesačný prehľad partnerov s filtrom typu partnera (hranice mesiaca v `Europe/Bratislava`); história nákupov s dátumovými filtrami.
- **Závislosti:** Fázy 5A a 6; dashboardy, filtre aj súčty sú výlučne v aktuálnej firme.
- **Hotové keď:** oba typy používateľov po prihlásení vidia dashboard na `/app`; predavač vidí len svoje dnešné zápisy podľa `Europe/Bratislava`; súčty brutto/netto v reporte, detaile partnera aj na karte sa zhodujú; body a odznaky vychádzajú z netto sumy; zmazané nákupy sa nezapočítajú; nákup 31. 10. o 23:30 patrí do októbra.
- **Stav:** role-based dashboardy, tenantovo izolované report API, mesačný prehľad partnerov a dátumové filtre histórie sú implementované; typecheck, lint, unit testy a produkčný build prešli. Overenie reportov voči databázovým fixture, dvojfiremná integračná kontrola a manuálna mobilná akceptácia zostávajú na overenie v prostredí s DB a zariadeniami.

### Fáza 8A – Vylepšenia dashboardu a reportov (spätná väzba 2026-10-13)
- **Cieľ:** opraviť výber obdobia a zvýrazniť najdôležitejšie údaje (body, top partneri).
- **Úlohy:**
  1. **Oprava výberu obdobia (bug):** na dashboarde admina (`/app`) aj v Mesačnom reporte (`/app/reporty`) nejde zmeniť mesiac. Príčina: `<input type="month">` má `value` bez `onChange`, React ho preto drží iba na čítanie (v konzole varovanie „value prop without onChange“). Oprava: `defaultValue` (alebo kontrolovaný klientský komponent), overiť na iPhone/Android aj desktope; zmena mesiaca sa prejaví v metrikách, top partneroch aj zozname nákupov.
  2. **Top 3 partneri za obdobie na dashboarde admina:** pod metrikami (Obrat bez DPH, Tržba s DPH, Body, Počet nákupov, Aktívni partneri) tri karty partnerov s najväčšou tržbou vo vybranom mesiaci (poradie podľa obratu bez DPH, deterministický tie-break). Na karte meno a kód partnera; **veľkým písmom počet bodov** za obdobie, pod tým menším písmom tržba (bez DPH, prípadne aj s DPH). Farby podľa poradia: 1. zlatá, 2. strieborná, 3. bronzová (odlíšené aj textom/ikonou, nie iba farbou). Iba nezmazané nákupy aktuálnej firmy; menej ako 3 partneri = zobraziť len existujúcich, žiadny = prázdny stav. Na mobile karty pod sebou.
  3. **Zvýraznenie bodov všade:** v každej tabuľke a zozname, kde sa zobrazujú body (dashboard, história nákupov, detail nákupu/partnera, zoznam partnerov, mesačný report, verejná karta), body **tučne** a o stupeň väčším písmom (napr. `font-bold text-base` oproti `text-sm`), bez rozbitia šírky stĺpcov a zarovnania (`tabular-nums`, `whitespace-nowrap`, kontrola na úzkom displeji).
- **Závislosti:** Fáza 8.
- **Hotové keď:** mesiac sa dá zmeniť na dashboarde aj v reporte a údaje sa prepočítajú; top 3 karty zodpovedajú súčtom mesačného reportu; body sú vizuálne najvýraznejší údaj v riadku a tabuľky na mobile ani desktope nepretekajú.
- **Stav:** implementované (2026-10-13). Výber mesiaca používa `defaultValue` + `key`, takže pole je editovateľné a po odoslaní sa zosynchronizuje s URL; dashboard číta súhrn aj top 3 z `getMonthlyReport`, takže sedí s reportom. Overené v prehliadači (desktop 1366 px aj mobil 390 px): prepnutie mesiaca na dashboarde aj v reporte, bez varovaní v konzole; typecheck, lint a testy fázy 6 a 8 prešli. Doplnené podľa spätnej väzby: výber obdobia bez písania (šípky, zoznam mesiacov, Tento/Minulý mesiac, vlastné obdobie od–do s kalendárom, max. 366 dní) na dashboarde aj v reporte; stĺpce Zapísal a Stav v histórii nákupov ako farebné odznaky; typ partnera ako odznak (report, zoznam partnerov); história nákupov stránkovaná po 50 (serverové stránkovanie, ovládanie nad aj pod tabuľkou); v reporte karty Top 3 a export „Tlačiť / stiahnuť PDF“ (serverové generovanie cez pdfkit + DejaVu Sans, audit `export.report_pdf`). Zostáva manuálne overenie na fyzickom iPhone/Android. (Hotové mimo plánu: bočné menu `AppShell` – zbaliteľné na desktope, vysúvacie na telefóne; `loading.tsx` stavy pre okamžité navigácie.)

### Fáza 9 – Audit log
- **Cieľ:** úplný a nemenný audit s prehliadačom.
- **Úlohy:** kontrola pokrytia všetkých zápisov; odstránenie citlivých údajov zo záznamov; obrazovka auditu; audit v detaile partnera.
- **Závislosti:** Fázy 3 – 8 vrátane 5A (audit sa zapisuje priebežne od fázy 3); firemný admin vidí iba audit svojej firmy, platformový audit iba superadmin.
- **Hotové keď:** každá úprava a zmazanie nákupu má dôvod a pôvodné aj nové hodnoty; audit sa nedá zmeniť cez aplikáciu ani SQL.
- **Stav (2026-10-14):** implementované firemné audit rozhranie `/app/audit`, platformový prehľad `/superadmin/audit` a `GET /api/audit-logs`; firemný audit má filtre dátumu, aktéra, akcie, entity a ID, serverové stránkovanie a povinný firemný rozsah. Audit sa zobrazuje aj v detaile partnera a bezpečné porovnanie starých/nových hodnôt v detaile nákupu. Auditové zápisy pred uložením vynechávajú kľúče hesiel/tokenov a maskujú kontaktné a interné poznámky; čítanie filtruje aj historické JSON hodnoty. Záznamy zostávajú iba na čítanie. Zostáva overiť na DB matice rolí/tenantov a vizuálne browserové správanie; nemennosť DB-triggerov sa overuje v integračných akceptačných testoch fázy 11.
- **Doplnené overenie (2026-10-15):** pred začatím exportov prešlo 17 DB/HTTP testov na izolovanej dvojfiremnej MariaDB vrátane matice rolí auditu, cudzích filtrov, maskovania a nemenných triggerov; tiež čistý deploy migrácií a kontrola zhody schémy. Lokálny Chrome overil filtre, stránkovanie, detaily pred/po, izoláciu pri prepnutí firmy a odmietnutie predavača na desktope aj pri dotykovom viewporte 390 px. Opravené zatvorenie mobilného menu pri odkaze na tú istú cestu s inými filtrami. Toto nenahrádza fyzický iPhone/Android ani produkčnú migráciu.

### Fáza 10 – Exporty
- **Cieľ:** CSV pre admina.
- **Úlohy:** CSV (BOM, `;`, desatinná čiarka); partneri, nákupy, mesačný prehľad, audit; ochrana proti CSV injection; audit exportov.
- **Závislosti:** Fázy 5A, 8 a 9; exporty musia filtrovať firmu aj všetky súvisiace entity.
- **Hotové keď:** CSV sa v Exceli otvorí správne a súčty sedia s reportom.
- **Stav (2026-10-15):** implementované štyri CSV endpointy, stránka `/app/exporty`, menu a priame exporty filtrov zo zoznamov/reportu/auditu a detailu partnera. UTF-8 BOM, bodkočiarka, CRLF, desatinná čiarka, dátumy v `APP_TIMEZONE`, bezpečné bunky a audit `export.csv` s typom, bezpečnými filtrami a počtom riadkov. Exporty nie sú obmedzené stránkou ani počtom riadkov; DB čítania sú dávkované v konzistentnej transakcii. Mesačné súčty používajú rovnakú službu ako report. Prešli integračné testy všetkých štyroch endpointov (roly, dve firmy, filtre, cudzie ID, dátumy, zmazané, súčty, audit), browserové stiahnutie na desktope aj pri 390 px a produkčný build. **Implementácia je hotová, akceptácia fázy nie je úplne uzavretá:** lokálny Excel pri priamom otvorení používa iné miestne nastavenie; kompletný import UTF-8/bodkočiarka/desatinná čiarka a fyzický iPhone/Android zostávajú na manuálne overenie podľa `docs/screens.md`.

### Fáza 11 – Testy
- **Cieľ:** overiť funkčnosť a bezpečnosť.
- **Úlohy:** unit testy (body, suma, tokeny, CSV, hranice mesiaca); integračné testy na DB `europodlahy_test` (matica superadmin/admin/predavač/neprihlásený × aspoň dve firmy, audit, soft delete, tokeny, migrácia); E2E v Playwright kontajneri vrátane prepínania firmy, deaktivácie, priamych cudzích ID, reportov, exportov a cache; manuálny checklist na zariadeniach.
- **Závislosti:** Fázy 1 – 10 (testy sa píšu priebežne).
- **Hotové keď:** všetky testy prejdú, matica rolí je pokrytá úplne a manuálny checklist je odškrtnutý.
- **Priebežná akceptácia (2026-10-15):** `test:phase5a` pokrýva izolovanú DB, matice auditu, migrácie a nemennosť. `test:browser` pridáva skutočný lokálny Chrome s desktopovým/dotykovým viewportom; okrem auditu preveruje ručné vyhľadanie a zápis nákupu 19,99 € → 16,25 € netto / 16 bodov a verejnú kartu bez interných údajov. Kompletná fáza 11 nie je uzavretá: checklist fyzických zariadení a Excelu v `docs/screens.md` zostáva otvorený.
- **Lokálne overenie fázy 11 (2026-10-15):** `npm run test:phase11` prešlo: 23 unit, 17 pôvodných DB/HTTP, 50 nových HTTP/inventárnych, 8 CSV a 14 browserových testov (počty runnera zahŕňajú nadradené testy). Inventár 33 API route súborov / 45 explicitných metód má 180 rolových prípadov a kontroly chýbajúceho firemného kontextu; Auth.js overuje session/signout a cron chýbajúci bearer, nie všetky interné akcie. Doplnené limity/expirácia/IP a proxy 429/405, vydanie a odtlačok tokenu, cudzie ID/payloady a deaktivované programy. Browser overil aj cudzie SSR ID, zmenu mesiaca a obdobia, PDF, úpravu a soft delete s dôvodom/auditom, escapovanie poznámky, zahodenie formulára pri prepnutí firmy v inom tabe, deaktiváciu a odhlásenie/návrat v histórii. Akceptácia používa lokálny Chrome, nie plánovaný Playwright kontajner; skutočné iOS/Android, kamera/NFC a úplný Excel import sú odložené až po nasadení podľa dohody. **Lokálna automatizovaná časť je overená; celá fáza 11 zostáva podmienená manuálnym checklistom. Nasadenie sa tým nevykonalo.**

### Fáza 12 – Príprava na nasadenie
- **Cieľ:** aplikácia pripravená na produkčnú prevádzku.
- **Úlohy:** standalone build; `Dockerfile`; `docker-compose.prod.yml` s Caddy a HTTPS; `migrate deploy`; produkčný `.env` s definitívnou doménou; zálohy a test obnovy; `/api/health`; prevádzková dokumentácia.
- **Závislosti:** Fáza 11, Q8 – Q10.
- **Hotové keď:** inštalácia podľa `deployment.md` prebehne na čistom serveri a smoke test (login, sken, nákup, karta, report, export) prejde na produkčnej doméne.

### Fáza 13 – PWA (inštalácia na plochu a do telefónu) – robí sa na konci
- **Cieľ:** aplikáciu `partners.europodlahy.sk` možno nainštalovať ako aplikáciu na Windows/macOS (Edge, Chrome), Android (Chrome) a iOS/iPadOS (Safari → Zdieľať → „Pridať na plochu“) – vlastné okno bez adresného riadku, ikona na ploche/v menu Štart.
- **Úlohy:** `src/app/manifest.ts` (názov, `short_name`, `start_url: /app`, `scope: /`, `display: standalone`, farby témy); ikony 192/512 px + maskovateľná ikona + `apple-touch-icon` 180 px (z loga Europodlahy – dodá zákazník, SVG alebo PNG ≥ 512×512); meta pre iOS (`appleWebApp`, `themeColor`, safe-area pre notch); minimálny service worker iba pre offline stránku „Ste offline“ – **žiadne cachovanie API ani firemných dát**; krátky návod na inštaláciu pre predavačov.
- **Obmedzenia:** vyžaduje HTTPS (produkcia); iOS nepodporuje Web NFC ani v PWA (QR a ručný zápis fungujú); kamera v iOS PWA vyžaduje opätovné povolenie; aktualizácie sú automatické (aplikácia stále beží zo servera), žiadny App Store / Google Play ani `.exe`.
- **Závislosti:** Fáza 12 (HTTPS na produkčnej doméne), logo.
- **Hotové keď:** Lighthouse/Chrome hlási aplikáciu ako inštalovateľnú; inštalácia a spustenie overené na Windows (Edge), Androide (Chrome) a iPhone (Safari); po odhlásení ani offline sa nezobrazia žiadne cachované firemné údaje.

### Orientačný odhad (1 vývojár)
| Fáza | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | **Spolu** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Dni | 1 | 1,5 | 2 | 1,5 | 1,5 | 2,5 | 1 | 1 | 1 | 1 | 2–3 | 1,5 | **17–19** |

Pôvodný odhad vyššie je pre jednofiremnú verziu. Rozšírenie 5A vrátane migrácie, zapojenia existujúcich modulov a izolačných scenárov pridáva orientačne **4–6 dní**; nový celkový odhad je **21–25 dní**, nie odhad zostávajúcej práce. Fáza 13 (PWA) pridáva orientačne **1 deň**.

## 7. Pravidlá pre implementáciu
1. Najprv dokumentácia, potom kód. Zmena rozhodnutia sa najprv zapíše sem a do príslušného `docs/` súboru.
2. Databáza lokálneho vývoja beží v Docker Compose; aplikácia a Node.js príkazy bežia lokálne.
3. Každá zápisová operácia má kontrolu roly, validáciu a audit.
4. Žiadne fyzické mazanie nákupov, partnerov ani používateľov.
5. Žiadne tajomstvá v repozitári – iba `.env.example`.
6. Každá firemná operácia má povinný, serverovo overený firemný kontext; žiadny automatický „všetky firmy“ režim obchodných endpointov.
7. Superadmin nezastupuje identitu firemného admina; pri správe vybranej firmy zostáva v audite skutočným aktérom.
