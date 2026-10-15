# Databázový model

> Súvisí s: [IMPLEMENTACNY_PLAN.md](../IMPLEMENTACNY_PLAN.md) · [security](security.md) · [api](api.md)

> **Model fázy 5A implementovaný (2026-10-08):** Prisma schéma a migrácia `20261008130000_companies` obsahujú viac firiem a superadmina. Migrácia sa validuje na izolovanej MariaDB 11.4.10; nasadenie na reálne dáta vyžaduje samostatnú zálohu a akceptáciu.

## Konvencie
- MariaDB 11.4, InnoDB, `utf8mb4` / `utf8mb4_unicode_ci`.
- PK `BIGINT UNSIGNED AUTO_INCREMENT`, čas `DATETIME(3)` v UTC, peniaze `DECIMAL(10,2)`.
- Cudzie kľúče `ON DELETE RESTRICT`. Fyzicky sa nemaže nič, čo má históriu.
- Schéma je v `prisma/schema.prisma`. Čo Prisma nevie (CHECK, triggre), rieši ručne doplnená SQL migrácia.

## Vzťahy
```
companies 1──N users / partners / partner_tokens / purchases / partner_badge_awards / audit_logs
users 1──N purchases N──1 partners 1──N partner_tokens
  │            └──────N──1─────────────────┘  (purchases.token_id)
  └──1──N audit_logs
partners 1──N partner_badge_awards
```

---

## 0. `companies`
**Účel:** firma prevádzkujúca vlastný partnerský program; nie partner typu `company`.

| Stĺpec | Typ | Poznámka |
|---|---|---|
| id | BIGINT UNSIGNED PK | globálne interné ID |
| name | VARCHAR(100) NOT NULL | zobrazované meno firmy, 2–100 znakov |
| slug | VARCHAR(80) NOT NULL UNIQUE | nemenný interný identifikátor, malé ASCII písmená, číslice a pomlčky |
| ico | CHAR(8) NULL | nepovinné; nie je prihlasovacím údajom |
| logo_data | MEDIUMBLOB NULL | normalizované PNG, najviac 512 × 256 px; bez pôvodných metadát |
| logo_version | CHAR(64) NULL | SHA-256 normalizovaného PNG; audit neobsahuje obrázok |
| vat_rate_percent | DECIMAL(5,2) NOT NULL DEFAULT 23.00 | aktuálna sadzba DPH firmy; zmena platí pre nové nákupy |
| purchase_confirm_above_eur | DECIMAL(10,2) NULL | voliteľný limit firmy; `NULL` = dodatočné potvrdenie vypnuté |
| bronze_monthly_turnover_eur | DECIMAL(10,2) NULL | hranica odznaku Bronzový partner; `NULL` = vypnuté |
| silver_monthly_turnover_eur | DECIMAL(10,2) NULL | hranica odznaku Strieborný partner; `NULL` = vypnuté |
| gold_monthly_turnover_eur | DECIMAL(10,2) NULL | hranica odznaku Zlatý partner; `NULL` = vypnuté |
| is_active | TINYINT(1) NOT NULL DEFAULT 1 | deaktivácia pozastaví program bez zmazania dát |
| deactivated_at | DATETIME(3) NULL | dôvod je v audite |
| created_by_user_id | FK → users NULL | superadmin alebo systém pri migrácii |
| created_at, updated_at | DATETIME(3) NOT NULL | UTC |

- Indexy: `UNIQUE(slug)`, `INDEX(is_active, name)`.
- Žiadne fyzické mazanie. Založenie firmy, prvého admina a auditu prebehne v jednej transakcii; dočasné heslo sa nikdy neaudituje. Firemný admin nastavuje limit potvrdenia nákupu; `NULL` ho vypína.
- Jedna spoločná doména a rovnaké bodové pravidlá; vlastné domény, logá a nastaviteľné bodové pravidlá nie sú súčasťou fázy 5A.

## 1. `users`
**Účel:** interní používatelia (superadmin, admin, predavač). Partneri tu nie sú, pretože sa neprihlasujú.

| Stĺpec | Typ | Poznámka |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| company_id | FK → companies NULL | povinné pre admin/predavač; NULL iba pre superadmina |
| email | VARCHAR(191) NOT NULL | lowercase |
| name | VARCHAR(150) NOT NULL | |
| password_hash | VARCHAR(255) NOT NULL | argon2id |
| role | ENUM('superadmin','admin','seller') NOT NULL | |
| is_active | TINYINT(1) NOT NULL DEFAULT 1 | |
| must_change_password | TINYINT(1) NOT NULL DEFAULT 1 | po vytvorení alebo resete hesla |
| failed_login_count | INT UNSIGNED NOT NULL DEFAULT 0 | |
| locked_until | DATETIME(3) NULL | |
| password_changed_at | DATETIME(3) NULL | zneplatní staršie session |
| last_login_at | DATETIME(3) NULL | |
| created_at, updated_at | DATETIME(3) NOT NULL | |

- **Indexy:** globálne `UNIQUE(email)`, `INDEX(company_id, role, is_active)`.
- **Obmedzenia:** iba deaktivácia, nie mazanie; `CHECK` zabezpečí `company_id IS NULL` práve pre superadmina. Service chráni posledného aktívneho superadmina a posledného aktívneho admina každej aktívnej firmy. Firemný účet sa v MVP nepresúva medzi firmami.

## 2. `partners`
**Účel:** evidencia partnerov. Ukladá sa iba minimum údajov (Q5 v [open-questions](open-questions.md)).

| Stĺpec | Typ | Povinné | Viditeľnosť | Poznámka |
|---|---|---|---|---|
| id | BIGINT UNSIGNED PK | systém | interné | nikdy vo verejnej URL |
| company_id | FK → companies NOT NULL | systém | interné | firmu určí serverový kontext |
| code | CHAR(8) NOT NULL | systém | **verejná karta**, predavač, admin | `EP-7K3MX`, generuje systém, nemenný (pravidlá nižšie) |
| type | ENUM('installer','company','referrer') NOT NULL | ✅ | predavač, admin | montážnik / firma / odporúčateľ; filter v reportoch |
| display_name | VARCHAR(100) NOT NULL | ✅ | **verejná karta**, predavač, admin | meno osoby alebo názov firmy, 2–100 znakov |
| phone | VARCHAR(20) NULL | – | admin; predavač iba čiastočne maskovane (`*** *** 123`) | normalizovaný tvar `+421…`; ručné vyhľadanie, kontakt |
| email | VARCHAR(191) NULL | – | admin | lowercase |
| contact_person | VARCHAR(100) NULL | – | admin | kontaktná osoba pri type firma |
| ico | CHAR(8) NULL | – | admin | 8 číslic; odporúčané pri type firma |
| internal_note | VARCHAR(1000) NULL | – | admin | interná poznámka |
| is_active | TINYINT(1) NOT NULL DEFAULT 1 | systém | admin | |
| deactivated_at | DATETIME(3) NULL | systém | admin | dôvod deaktivácie je v audite |
| created_by_user_id | FK → users NULL | systém | admin | |
| created_at, updated_at | DATETIME(3) NOT NULL | systém | admin | `created_at` slúži reportom (noví partneri) |

Vedome sa **neevidujú**: adresa, DIČ/IČ DPH, dátum narodenia, bankové údaje. V MVP nie sú potrebné (žiadne vyplácanie bodov).

**Kód partnera (`code`):**
- formát `EP-` + 5 znakov z abecedy `23456789ABCDEFGHJKMNPQRSTVWXYZ` (30 znakov, bez zameniteľných `0 O 1 I L U`),
- generuje sa náhodne cez CSPRNG; pri kolízii sa generuje znova; 30⁵ ≈ 24,3 mil. kombinácií,
- je **nemenný** a nikdy sa nepoužije znova (ani po deaktivácii partnera),
- pri zadávaní nezáleží na veľkosti písmen, medzery a pomlčky sa ignorujú, prefix `EP` je nepovinný (`7k3mx` = `EP-7K3MX`),
- **je to iba interný identifikátor pre predavača, nie prístupový údaj:** neotvorí verejnú kartu a sám neumožní zápis. Slúži na ručné vyhľadanie prihláseným predavačom a na identifikáciu na kartičke. QR/NFC obsahuje iba token.
- **kód nie je jediný spôsob vyhľadania:** partnera musí byť možné nájsť aj **podľa mena** (časť mena, bez ohľadu na diakritiku a veľkosť písmen – zabezpečí collation `utf8mb4_unicode_ci`) **alebo telefónu** (časť čísla, bez ohľadu na formát a medzery; zadanie `0903 123…` sa normalizuje na `+421903123…`).

- **Indexy:** globálne `UNIQUE(code)` zostáva zachované; firemné indexy `INDEX(company_id, is_active, type)`, `INDEX(company_id, display_name)`, `INDEX(company_id, phone)`, `INDEX(company_id, ico)`.
- **Obmedzenia:** `CHECK (code REGEXP '^EP-[2-9A-HJKMNP-TV-Z]{5}$')`; `CHECK (ico IS NULL OR ico REGEXP '^[0-9]{8}$')`; `display_name` dĺžka 2–100; `phone` je nepovinný a nie je unikátny (pri zhode sa zobrazí varovanie); partner sa nemaže; neaktívny partner = jeho tokeny nefungujú a nedá sa naň zapísať nákup.
- Body a obrat sa **neukladajú** – počítajú sa súčtom z `purchases`; netto obrat pre reporty a odznaky sa agreguje z `net_amount`.
- Varovania o duplicitnom telefóne/IČO hľadajú iba v danej firme. Tá istá osoba môže mať samostatné partnerstvá v rôznych firmách bez spoločných bodov a histórie.

## 3. `partner_tokens`
**Účel:** tokeny pre QR kódy a NFC karty. **Partner môže mať viac aktívnych tokenov.**

| Stĺpec | Typ | Poznámka |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| company_id | FK → companies NOT NULL | musí sa zhodovať s firmou partnera |
| partner_id | FK → partners NOT NULL | |
| type | ENUM('qr','nfc') NOT NULL | na aký nosič je token určený |
| token_hash | CHAR(64) NOT NULL | SHA-256 hex; **plný token sa neukladá** |
| token_hint | CHAR(6) NOT NULL | prvých 6 znakov, na rozlíšenie kariet v UI |
| label | VARCHAR(80) NULL | napr. „NFC karta č. 0153“ |
| is_active | TINYINT(1) NOT NULL DEFAULT 1 | |
| created_by_user_id | FK → users NULL | |
| created_at | DATETIME(3) NOT NULL | |
| deactivated_at | DATETIME(3) NULL | |
| deactivated_by_user_id | FK → users NULL | |
| deactivation_reason | VARCHAR(255) NULL | |
| last_used_at | DATETIME(3) NULL | |

- **Indexy:** globálne `UNIQUE(token_hash)`, `INDEX(company_id, partner_id, is_active)`.
- **Obmedzenia:** počet aktívnych tokenov nie je obmedzený; deaktivácia je **nevratná**; token je platný iba ak token, partner aj prevádzkujúca firma sú aktívni.

## 4. `purchases`
**Účel:** nákupy priradené k partnerovi.

| Stĺpec | Typ | Poznámka |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| company_id | FK → companies NOT NULL | firma partnera aj použitého tokenu |
| partner_id | FK → partners NOT NULL | |
| amount | DECIMAL(10,2) NOT NULL | zadaná suma s DPH (EUR) |
| net_amount | DECIMAL(10,2) NOT NULL | suma bez DPH vypočítaná a uložená pri zápise |
| vat_rate_percent | DECIMAL(5,2) NOT NULL | sadzba použitá pri tomto nákupe; historický snapshot |
| points | INT UNSIGNED NOT NULL | `FLOOR(net_amount)`, počíta server |
| partner_present | TINYINT(1) NOT NULL | 1 = partner bol osobne, 0 = nebol |
| note | VARCHAR(500) NULL | **iba interná** |
| purchased_at | DATETIME(3) NOT NULL | predvolene čas zápisu; mení iba admin |
| source | ENUM('qr','nfc','manual') NOT NULL | |
| token_id | FK → partner_tokens NULL | |
| idempotency_key | CHAR(36) NULL | ochrana pred dvojitým uložením |
| created_by_user_id | FK → users NOT NULL | |
| updated_by_user_id | FK → users NULL | |
| is_deleted | TINYINT(1) NOT NULL DEFAULT 0 | soft delete |
| deleted_at | DATETIME(3) NULL | |
| deleted_by_user_id | FK → users NULL | |
| created_at, updated_at | DATETIME(3) NOT NULL | |

- **Indexy:** `INDEX(company_id, partner_id, is_deleted, purchased_at)`, `INDEX(company_id, purchased_at)`, `INDEX(company_id, created_by_user_id, created_at)`, globálne `UNIQUE(idempotency_key)` zostáva; konflikt nikdy nesmie vrátiť nákup inej firmy.
- **Obmedzenia:**
  - `CHECK (amount > 0 AND amount <= 999999.99)` – záporné sumy (vratky) sa nezapisujú,
  - `CHECK (net_amount = ROUND(amount * 100 / (100 + vat_rate_percent), 2))`,
  - `CHECK (points = FLOOR(net_amount))`,
  - `CHECK ((is_deleted = 0 AND deleted_at IS NULL) OR (is_deleted = 1 AND deleted_at IS NOT NULL))`,
  - účet aplikácie nemá právo `DELETE`,
  - dôvod úpravy alebo zmazania sa ukladá do `audit_logs.reason` (povinný),
  - všetky súčty filtrujú `is_deleted = 0`.

## 5. `partner_badge_awards` (fáza 7)
**Účel:** nemenný snapshot ocenenia, ktoré partner získal za uzavretý kalendárny mesiac. Záznam vznikne iba pri dosiahnutí aspoň jednej aktívnej hranice.

| Stĺpec | Typ | Poznámka |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| company_id | FK → companies NOT NULL | |
| partner_id | FK → partners NOT NULL | partner musí patriť rovnakej firme |
| period_start | DATE NOT NULL | prvý deň oceneného mesiaca v `Europe/Bratislava` |
| tier | ENUM('bronze','silver','gold') NOT NULL | najvyšší dosiahnutý tier daného mesiaca |
| monthly_turnover | DECIMAL(14,2) NOT NULL | obrat snapshotovaný pri uzavretí mesiaca |
| threshold_eur | DECIMAL(10,2) NOT NULL | hranica tieru platná pri uzavretí mesiaca |
| calculation_basis | ENUM('gross','net') NOT NULL | historické záznamy ostanú `gross`; nové uzávierky ukladajú `net` |
| awarded_at | DATETIME(3) NOT NULL | čas uloženia snapshotu v UTC |

- **Kľúče/indexy:** `UNIQUE(company_id, partner_id, period_start)`, `INDEX(company_id, period_start, tier)`.
- **Obmedzenia:** zložený FK zabezpečí, že partner patrí firme v zázname; fyzické mazanie je zakázané. Mesačné uzatvorenie je idempotentné a vytvorí najviac jeden snapshot na partnera a mesiac.
- **Nemennosť:** po uzatvorení záznam nemení ani úprava/zmazanie starého nákupu, ani zmena firemnej hranice. Zmeny sa prejavia iba v priebežnom odznaku aktuálneho mesiaca a v budúcich uzávierkach.

## 6. `audit_logs`
**Účel:** nemenný záznam udalostí.

| Stĺpec | Typ | Poznámka |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| company_id | FK → companies NULL | povinné pre firemné udalosti; NULL iba pre platformové udalosti |
| user_id | FK → users NULL | NULL = anonymná alebo systémová udalosť |
| action | VARCHAR(64) NOT NULL | zoznam akcií v [security](security.md#4-audit-log) |
| entity_type | VARCHAR(32) NOT NULL | `company`, `purchase`, `partner`, `token`, `user`, `auth`, `export` |
| entity_id | BIGINT UNSIGNED NULL | |
| partner_id | BIGINT UNSIGNED NULL | rýchly filter v detaile partnera |
| old_values | JSON NULL | bez hesiel a tokenov |
| new_values | JSON NULL | bez hesiel a tokenov |
| reason | VARCHAR(255) NULL | povinný pri úprave/zmazaní nákupu a deaktivácii |
| ip_address | VARCHAR(45) NULL | |
| user_agent | VARCHAR(255) NULL | |
| created_at | DATETIME(3) NOT NULL | |

- **Indexy:** `INDEX(company_id, entity_type, entity_id, created_at)`, `INDEX(company_id, partner_id, created_at)`, `INDEX(company_id, user_id, created_at)`, `INDEX(company_id, action, created_at)`, `INDEX(company_id, created_at, id)` pre zoradený firemný audit.
- **Obmedzenia:** `JSON_VALID` na JSON stĺpcoch; triggre `BEFORE UPDATE` a `BEFORE DELETE` vyvolajú chybu; účet aplikácie má iba `SELECT, INSERT`.

## Informačné oznámenia a evidencia poskytnutia

Migrácia `20261015120000_privacy_notices` pridáva tri tabuľky bez zmeny existujúcich partnerov:

| Tabuľka | Údaje | Pravidlá |
|---|---|---|
| `company_privacy_drafts` | `company_id` PK/FK; `controller_name` (150), `controller_address` (500), nullable `controller_ico` (8), `contact_email` (191), nullable `dpo_contact` (500), `body` TEXT, `updated_at` | jeden upraviteľný návrh na firmu; monotónny čas revízie pre publikovanie |
| `company_privacy_notices` | globálne `id`, `company_id`, `version`, snapshot polí návrhu, `published_at`, `published_by_user_id` | unique `(company_id, version)` a `(company_id, id)`; kladná verzia, text 100–20 000 znakov; po publikovaní nemenné |
| `company_privacy_receipts` | `id`, `company_id`, `partner_id`, `notice_id`, `provided_at`, `method`, `recorded_by_user_id`, `recorded_at`, nullable `reason` | iba pridávanie; enum spôsobu `in_person/printed/email`; zložené FK k partnerovi a oznámeniu z rovnakej firmy |

Časy sú `DATETIME(3)` v UTC; verejná verzia je účinná od `published_at`. Aktér publikovania/poskytnutia sa overí v service pod zámkom firmy. Pri ďalšom zázname informovania sa vyžaduje dôvod 2–255 znakov (DB stĺpec má rezervu 500); nesmie sa prepisovať starší záznam. Zložené FK vynucujú firmu partnera aj oznámenia. Triggre zakazujú `UPDATE/DELETE` publikovaných oznámení a evidencie aj migračnému účtu.

Účet aplikácie má na návrhy `SELECT, INSERT, UPDATE`, na publikované oznámenia a evidenciu iba `SELECT, INSERT`. Existujúci partneri nemajú automatický záznam; stav informovania sa odvodzuje z existencie evidencie. Texty oznámení sa neukladajú do auditu. Verejná stránka zobrazuje iba snapshot oznámenia, nie aktéra či údaje partnera.

Tieto tabuľky nie sú evidenciou súhlasov. Retencia, opravy osobných údajov a zákonné výmazové postupy vyžadujú samostatný návrh vrátane správy nemenných historických údajov.

---

## Izolácia väzieb a migrácia (fáza 5A)
- Partneri, tokeny a nákupy majú povinné `company_id`; `UNIQUE(company_id, id)` a zložené cudzie kľúče zamedzia prepojeniu tokenu s cudzím partnerom a nákupu s cudzím partnerom/tokenom. Auditovaný partner musí patriť rovnakej firme ako audit.
- Firemní používatelia uvedení ako aktéri musia patriť rovnakej firme; výnimkou je overený globálny superadmin. Túto podmienku kontroluje service v transakcii, keďže superadmin nemá firemné členstvo.
- Existujúca DB sa migruje počas odstávky po zálohe: vytvoriť firmu Europodlahy, priradiť existujúce firemné účty a obchodné dáta, potom zaviesť povinnosť stĺpcov, indexy a FK. Existujúci admin ostáva firemným adminom; nevytvorí sa z neho automaticky superadmin.
- Historický audit sa nesmie aktualizovať cez `UPDATE` ani vypnutím ochranných triggerov. Priradenie starej histórie k Europodlahy sa urobí pri pridaní nového stĺpca `company_id` riadeným DDL s dočasnou predvolenou hodnotou ID firmy; po doplnení historických riadkov sa default odstráni. Pôvodné hodnoty, ID a časy auditu zostanú bezo zmeny; postup sa musí overiť na MariaDB 11.4 pred nasadením.
- Migrácia vytvorí Europodlahy s ID 1 v novej tabuľke a pridá všetky company stĺpce s dočasným default 1; defaulty následne odstráni. Audit sa nikdy neaktualizuje. MariaDB nedovoľuje `ON UPDATE CASCADE` na FK stĺpci použitom v CHECK; nové firemné/compound väzby preto používajú `ON UPDATE RESTRICT` (interné ID sa nemenia). Nákup s tokenom musí mať zhodnú firmu **aj partnera** (`company_id, partner_id, token_id`).
- ID partnerov/nákupov, odtlačky tokenov a existujúce URL zostávajú zachované. Migrácia zneplatní staré sessions, aby sa firemné oprávnenia odvodzovali až z nového prihlásenia.

## Firemný limit potvrdenia nákupu (fáza 6)
- Migrácia `20261013110000_company_purchase_confirmation` pridá do `companies` nepovinný `purchase_confirm_above_eur`; existujúce aj nové firmy majú predvolene `NULL` (potvrdenie vypnuté).
- Limit môže meniť iba firemný admin v nastaveniach svojej firmy; superadmin ho vidí len na čítanie. Zmena sa audituje.
- Pred uložením server uzamkne kontext firmy a pri sume rovnej alebo vyššej ako limit vyžaduje explicitné potvrdenie zapisujúceho používateľa.

## DPH a bodovanie nákupov
- Migrácia `20261013130000_purchase_vat` pridá firemnú sadzbu DPH s defaultom `23.00 %`; existujúce nákupy dostanú pri migrácii snapshot 23 % a ich pôvodná suma sa považuje za sumu s DPH. Netto suma sa dopočíta na centy a body sa upravia na `FLOOR(net_amount)`. Keďže predchádzajúca verzia sadzbu neukladala, historické nákupy nemožno spätne priradiť k inej skutočnej sadzbe.
- Predavač vždy zadáva sumu z dokladu vrátane DPH. Server uloží hrubú sumu, sadzbu a vypočítanú sumu bez DPH; výpočet používa celočíselnú centovú aritmetiku a zaokrúhlenie half-up. Body aj obrat pre odznaky vychádzajú z netto sumy.
- Zmena firemnej sadzby sa audituje a ovplyvní iba nové nákupy. Pri oprave sumy už uloženého nákupu sa použije jeho uložená sadzba, nie aktuálne nastavenie firmy.
- Historické `partner_badge_awards` sa nemenia. Pred migráciou uložené ocenenia majú `calculation_basis='gross'`; nové sa ukladajú ako `net`, aby sa ich pôvodný výpočet dal správne vysvetliť.

## Mesačné odznaky partnera (Q15, fáza 7)
- Tri firemné hranice na `companies` sú nullable a predvolene `NULL` (všetky vypnuté). Každá firma ich nastavuje nezávisle; po nastavení musia byť kladné a striktne rastúce. Hodnoty 500/1 000/2 000 € sú príklady, nie predvolené nastavenia.
- Aktuálny tier sa neukladá v `partners`; server sčíta `purchases.net_amount` pre daného partnera a firmu, `is_deleted = 0`, za kalendárny mesiac podľa `purchased_at` v `Europe/Bratislava`; následne vyberie najvyššiu dosiahnutú aktívnu hranicu bez DPH.
- Po skončení mesiaca sa idempotentným mesačným uzatvorením vytvorí `partner_badge_awards` snapshot pre každého partnera, ktorý dosiahol odznak. Snapshot obsahuje tier, mesačný obrat aj hranicu platnú ku koncu obdobia (rekonštruovanú z auditu nastavení); karta a detail partnera zobrazia počty mesiacov za každý tier a zoznam ocenených mesiacov.
- Použije sa existujúci index `purchases(company_id, partner_id, is_deleted, purchased_at)`. Zmena alebo soft-delete nákupu upraví aktuálny súčet; uzatvorený mesiac sa spracúva plánovaným príkazom `npm run badges:close`.
- Odznaky nie sú súťažou ani kvótou: každý partner, ktorý dosiahne rovnakú aktívnu hranicu, dostane daný odznak. Ak žiadna aktívna hranica nie je dosiahnutá, odznak je `NULL`.
- Odznak sa zverejní iba v obmedzenom DTO karty a v interných pohľadoch podľa rolí; tým sa nesprístupnia kontaktné ani interné polia partnera.

## DB účty
| Účet | Práva | Použitie |
|---|---|---|
| `europodlahy_migrate` | DDL + DML na `europodlahy`, `europodlahy_test` a `europodlahy_shadow` | migrácie, seed, integračné testy |
| `europodlahy_app` | `SELECT, INSERT, UPDATE` na `companies`, `users`, `partners`, `partner_tokens`, `purchases`, `company_privacy_drafts`; `SELECT, INSERT` na `partner_badge_awards`, `audit_logs`, `company_privacy_notices`, `company_privacy_receipts`; bez `DELETE` ani `UPDATE` nemennej histórie | bežiaca aplikácia; po migráciách spustiť `npm run db:permissions` |

Účty a databázy vytvárajú init skripty v `docker/mariadb/init/`. Po migrácii sa spustí `npm run db:permissions`, aby sa nastavili tabuľkové práva aplikačného účtu.

## Seed
- Ak sú nastavené spolu: prvý firemný admin z `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (`must_change_password = 1`). Bez nich možno spustiť iba samostatný bootstrap superadmina.
- Iba vo vývoji: testovací predavač, približne 20 partnerov a nákupy za 3 mesiace.
- **Fáza 5A:** bezpečný bootstrap samostatného globálneho superadmina cez `SEED_SUPERADMIN_EMAIL` / `SEED_SUPERADMIN_PASSWORD`, s povinnou zmenou hesla; Europodlahy a jej admin zostávajú samostatní. Existujúci účet s rovnakou rolou/firmou zostane bez zmeny hesla či stavu; iná rola/firma spôsobí odmietnutie bootstrapu. Vývojový seed má dve firmy s vlastnými adminmi, predavačmi, partnermi, nákupmi a QR/NFC odtlačkami; druhá firma používa účty s prefixom `second.`. Plné fixture tokeny sa neukladajú ani nevypisujú.
