# Obrazovky, roly a používateľské flow

> Súvisí s: [IMPLEMENTACNY_PLAN.md](../IMPLEMENTACNY_PLAN.md) · [api](api.md) · [security](security.md)

Všetky obrazovky sú React stránky v jednej Next.js aplikácii. Aplikácia je navrhnutá mobile-first: predavač musí vedieť pohodlne dokončiť celý pracovný postup na telefóne; tablet aj desktop sú podporované a administrácia je pohodlná aj na PC. Nejde o samostatnú natívnu mobilnú aplikáciu.
Legenda: **SA** = superadmin, **A** = admin, **P** = predavač, **Pa** = partner (anonymný).

> **Fázy 5A–9 implementované:** admin a predavač používajú obrazovky iba pre vlastnú firmu; superadmin po výslovnom výbere firmy používa admin obrazovky. Pás nad obsahom zobrazuje firmu, rolu SA a stav programu; menu je v bočnom paneli (pozri časť 3). Dashboardy, mesačný report, filtre histórie nákupov, nákupový skener/formulár a firemný audit prehliadač sú dostupné. CSV exporty zostávajú plánovanou funkciou.

## 1. Používateľské flow

### 1.0 Superadmin – nová firma a správa programu
```
Login → Firmy → Pridať firmu (názov, slug, voliteľné IČO, prvý admin)
  → Uložiť firmu a admina spolu → Detail firmy → Otvoriť partnerský program
  → Firemný dashboard / partneri / tokeny / nákupy / reporty / používatelia
  → Späť na firmy → vybrať inú firmu
```
Prvý admin dostane dočasné heslo od superadmina mimo aplikácie a pri prihlásení ho musí zmeniť. Vlastný admin si následne spravuje predavačov a program firmy. Pri prepnutí firmy sa zahodia rozpracované formuláre po upozornení a vyčistí predchádzajúci firemný stav; operácie sa vykonávajú pod identitou superadmina, nie firemného admina.

Návrat na firmy z firemnej hlavičky upozorní na zahodenie formulárov. Otvorenie programu vykoná úplné načítanie dokumentu namiesto klientského prechodu; pri zmene v inom tabe sa starý program opustí. Pôvodný formulár sa nemôže odoslať cez nové cookie, pretože nesie ID pôvodného výberu. Manuálne overenie prehliadačovej histórie, cache a mobilných zariadení ešte treba vykonať.

### 1.1 Predavač – zápis nákupu (hlavný flow)
```
Login → Dashboard → Skenovanie
   ├─ QR kamerou (vždy dostupné)
   ├─ NFC (iba ak to prehliadač podporuje)
   └─ Nákup bez karty – /app/nakupy/manualne (aj priamo z dashboardu)
        ↓ partner overený
Zápis nákupu: suma s DPH · náhľad DPH, sumy bez DPH a bodov · osobne áno/nie · dátum a čas · poznámka → Uložiť
        ↓
Ak suma dosiahne nastavený firemný limit → potvrdenie zapisujúceho
        ↓
Potvrdenie (suma, body, nový stav) → „Skenovať ďalšieho“
```

### 1.2 Partner – kontrola bodov
```
Partner naskenuje QR / priloží NFC svojím telefónom → /k/{token} → karta iba na čítanie
(neplatný alebo deaktivovaný token → „Karta nie je platná“)
```

### 1.3 Admin – nový partner a karta
```
Partneri → Nový partner → Uložiť → Detail → „Vygenerovať QR“
   → jednorazový dialóg: stiahnuť PNG/SVG, tlačiť kartu, skopírovať URL pre NFC
   → (voliteľne) „Vygenerovať NFC token“ → URL zapísať na kartu a kartu uzamknúť
```

### 1.4 Admin – opätovná tlač, strata karty, vratka
- **Opätovná tlač QR:** Detail → „Vytlačiť QR znova“ → nový token, pole „Deaktivovať pôvodný QR“ je predvolene zaškrtnuté.
- **Strata NFC karty:** Detail → token → „Deaktivovať“ (s dôvodom). Ostatné tokeny fungujú ďalej.
- **Vratka alebo oprava:** Detail → nákup → Upraviť alebo Zmazať → **povinný dôvod** → zápis do auditu.

## 2. Obrazovky

### 2.1 Login – `/login`
- **Kto:** SA, A, P.
- **Zobrazuje:** e-mail, heslo, všeobecnú chybu, info o dočasnom zablokovaní.
- **Akcie:** prihlásiť sa. Registrácia ani „zabudnuté heslo“ nie sú – reset robí admin. Pri dočasnom hesle nasleduje vynútená zmena.
- **Údaje:** Auth.js → `users`; audit prihlásení.
- Po prihlásení idú admin aj predavač na `/app` svojej firmy; superadmin na `/superadmin/firmy`. Pre deaktivovanú firmu sa prístup zamietne bez zobrazenia jej obchodných údajov.

### 2.2 Dashboard – `/app`
- **Kto:** A, P.
- **Zobrazuje (A):** hrubý obrat s DPH, čistý obrat bez DPH, body a počet nákupov za vybraný mesiac, počet aktívnych partnerov, karty **Top 3 partneri** mesiaca (poradie podľa obratu bez DPH, rovnaké ako v mesačnom reporte; zlatá/strieborná/bronzová farba s textom „1./2./3. miesto“, veľkým písmom body, pod nimi tržba bez a s DPH; prázdny stav bez nákupov), posledných 10 nákupov daného obdobia. **Výber obdobia** (spoločný komponent `PeriodPicker`, aj v mesačnom reporte): šípky ◀ ▶ na predchádzajúci/nasledujúci mesiac (nie do budúcnosti), rozbaľovací zoznam posledných 6 mesiacov vrátane aktuálneho (natívny výber na mobile, bez písania; staršie obdobia cez „Od – do“ alebo šípku ◀), rýchle voľby „Tento mesiac“ a „Minulý mesiac“ a „Od – do“ s kalendárom (`?from=YYYY-MM-DD&to=YYYY-MM-DD`, vrátane oboch dní v `Europe/Bratislava`, najviac 366 dní; neplatné obdobie = 404). Mesiac sa prenáša ako `?month=YYYY-MM`; odkaz na report a históriu nákupov zachová vybrané obdobie.
- **Zobrazuje (P):** rýchly vstup „Skenovať partnera“ a vlastné dnešné zápisy (partner, čas, hrubá a čistá suma, body); dátum sa určuje podľa `Europe/Bratislava`.
- **Akcie (A):** Skenovať, Nový nákup, Nový partner, Reporty a história nákupov.
- **Akcie (P):** Skenovať partnera; otvorenie vlastného zoznamu dnešných zápisov.
- **Údaje:** `GET /api/reports/dashboard`.

### 2.2.1 Mesačný report – `/app/reporty`
- **Kto:** A; SA po výslovnom výbere firmy.
- **Zobrazuje:** súhrnný obrat s DPH aj bez DPH, body a počet nezmazaných nákupov vo vybranom mesiaci; zoradenie partnerov podľa obratu bez DPH, počtu nákupov a bodov.
- **Akcie:** výber mesiaca alebo vlastného obdobia od–do (rovnaký `PeriodPicker` ako na dashboarde; filter typu sa pri zmene obdobia zachová) a voliteľné filtrovanie podľa typu partnera; obdobie sa počíta v `Europe/Bratislava`. Pri vlastnom období je nadpis „Report za obdobie“. Nad súhrnom sú rovnaké karty **Top 3 partneri** ako na dashboarde. Tlačidlo **„Tlačiť / stiahnuť PDF“** stiahne PDF reportu pre aktuálne obdobie a filter typu (`GET /api/reports/pdf`), ktoré sa dá vytlačiť alebo uložiť; počas generovania je tlačidlo zablokované a chyba sa zobrazí pod ním.
- **Údaje:** `GET /api/reports/monthly?year=&month=&type=`.

> **Typ partnera** (Montážnik/Firma/Odporúčateľ) je všade zobrazený ako farebný odznak s ikonou (`PartnerTypeBadge` – mesačný report, zoznam partnerov).
>
> **História nákupov** (`/app/nakupy`) sa načítava po stránkach: 50 najnovších nákupov na stránku, ďalšie sa načítajú až po prekliknutí (server vracia iba danú stránku, žiadne načítanie všetkého naraz). Stránkovanie je nad aj pod tabuľkou (← Novšie / čísla strán / Staršie →, na mobile „Strana X / Y“), s textom „Zobrazené 1–50 z N“; filtre dátumu a zmazaných sa zachovajú; stránka mimo rozsahu presmeruje na poslednú.
>
> **Zapísal a Stav** sú v histórii nákupov zobrazené ako odznaky (badge): meno zapisujúceho neutrálne sivo, stav farebne – Osobne (zelená), Neosobne (modrá), Zmazaný (červená), vždy s textom.
>
> **Body** sú v každej tabuľke a zozname (história nákupov, report, detail nákupu/partnera, formulár zápisu, verejná karta) zobrazené tučne a o stupeň väčším písmom (`font-bold text-base`, `tabular-nums`, `whitespace-nowrap`), aby boli najvýraznejším údajom bez rozbitia stĺpcov.

### 2.3 Zoznam partnerov – `/app/partneri`
- **Kto:** A; P môže vyhľadávať aktívnych partnerov pri ručnom výbere.
- **Zobrazuje:** kód, meno, typ, telefón, stav, aktívne tokeny (QR/NFC), body, obrat bez DPH aj tržbu s DPH, posledný nákup. P vidí iba kód, meno, typ a maskovaný telefón.
- **Akcie:** hľadať (kód, meno, telefón, IČO), filtrovať (typ, stav), stránkovať; A: nový partner, detail, deaktivovať alebo aktivovať.
- **Údaje:** `GET /api/partners`.

### 2.4 Detail partnera – `/app/partneri/[id]`
- **Kto:** A; SA po výslovnom výbere firmy.
- **Zobrazuje:** údaje vrátane internej poznámky; súhrn (body, obrat s DPH aj bez DPH, aktuálny mesiac); mesačný odznak a históriu ocenení (počet mesiacov za každý tier, mesiac a obrat bez DPH); **tokeny** (typ, označenie, hint, stav, posledné použitie); históriu nákupov vrátane hrubej/netto sumy, použitej sadzby a zmazaných nákupov (označené); audit partnera.
- **Akcie:** upraviť, deaktivovať; vygenerovať QR alebo NFC token; vytlačiť QR znova; deaktivovať token; pridať nákup; upraviť alebo zmazať nákup (s dôvodom); export CSV.
- **Údaje:** `GET /api/partners/{id}`, `/tokens`, `/purchases`, `GET /api/audit-logs?partnerId=`.
- **Dialóg po vygenerovaní tokenu:** QR náhľad, PNG/SVG, tlač, skopírovanie URL pre NFC. Upozornenie: „Po zatvorení sa QR už nedá znova zobraziť.“ Opätovné vydanie môže deaktivovať staré tokeny rovnakého typu; dôvod deaktivácie je povinný.
- **NFC:** aplikácia poskytne URL a návod na zápis NDEF URL záznamu na NTAG213/215 a následné uzamknutie karty; fyzický zápis vyžaduje kompatibilný zapisovač.

### 2.5 Pridanie / úprava partnera – `/app/partneri/novy`, `/app/partneri/[id]/upravit`
- **Kto:** A.
- **Zobrazuje:**
  - povinné: **typ**, **zobrazované meno** (s označením „zobrazí sa na karte partnera“),
  - nepovinné: telefón, e-mail, kontaktná osoba, IČO (pri type firma sa zobrazí ako odporúčané), interná poznámka,
  - kód partnera (iba na čítanie, pridelí ho systém pri uložení).
- **Akcie:** uložiť, zrušiť; pri novom partnerovi voliteľne „Hneď vygenerovať QR“.
- **Údaje:** `POST /api/partners`, `PATCH /api/partners/{id}`; varovanie pri duplicitnom IČO alebo telefóne.

### 2.6 Skenovanie – `/app/sken`
- **Kto:** P, A.
- **Zobrazuje:** dve veľké karty vedľa seba (na mobile pod sebou): **QR kód** (náhľad kamery 4:3, „Zapnúť kameru“) a **NFC karta** („Načítať NFC“ je aktívne **iba pri podpore Web NFC**, inak vysvetlenie). Pod nimi odkaz „Partner nemá kartu?“ na `/app/nakupy/manualne`.
- **Akcie:** naskenovať → overiť → prejsť na zápis nákupu.
- **Údaje:** `POST /api/scan/resolve`. Prijíma sa iba URL `{APP_BASE_URL}/k/…`.
- Vyžaduje HTTPS (okrem `localhost`).

### 2.6a Nákup bez karty – `/app/nakupy/manualne`
- **Kto:** P, A. Odkaz „Nákup bez karty“ je na dashboarde vedľa „Skenovať partnera“ a na stránke skenovania.
- **Zobrazuje:** vyhľadávacie pole (meno, telefón, IČO alebo kód; hľadá sa priebežne počas písania) a zoznam **aktívnych** partnerov (meno, kód, telefón – predavač vidí maskovaný – a typ ako badge), po 20 s tlačidlom „Zobraziť ďalších“.
- **Akcie:** klik na partnera → `/app/nakupy/novy?partner={id}&source=manual`.
- **Údaje:** `GET /api/partners?active=true&q=…&page=…`.

### 2.7 Zápis nákupu – `/app/nakupy/novy?partner={id}`
- **Kto:** P, A.
- **Zobrazuje:** hlavičku partnera (meno, kód, body) a formulár:
  - suma s DPH € (povinná, > 0, čiarka aj bodka); formulár zobrazí použitú sadzbu, výšku DPH a sumu bez DPH,
  - **osobne áno / nie** (povinné, bez predvolenej hodnoty),
  - poznámka (nepovinná, s označením „interná – partner ju nevidí“),
  - dátum a čas (pri vytvorení ho môžu upraviť A aj P),
  - náhľad „Pripočíta sa X bodov“, vypočítaných zo sumy bez DPH.
- **Akcie:** uložiť → potvrdenie → skenovať ďalšieho. Pri sume rovnej alebo vyššej ako firemný limit sa vyžaduje dodatočné potvrdenie zapisujúceho používateľa.
- **Údaje:** `GET /api/partners/{id}/summary`, `POST /api/purchases`.

### 2.8 Úprava nákupu – `/app/nakupy/[id]`
- **Kto:** A.
- **Zobrazuje:** nákup, kto ho zapísal a jeho históriu z auditu.
- **Akcie:** upraviť (suma, osobne, poznámka, dátum, partner) alebo zmazať; **povinné pole „Dôvod“**.
- **Údaje:** `GET/PATCH/DELETE /api/purchases/{id}`.

### 2.8.1 História nákupov – `/app/nakupy`
- **Kto:** A, P (P iba vlastné dnešné nákupy).
- **Zobrazuje:** stránkovanú históriu; admin môže filtrovať dátumový rozsah a partnera, prípadne zahrnúť zmazané nákupy.
- **Akcie:** zmeniť dátumový rozsah, stránkovať a zobraziť/skryť zmazané nákupy; lokálne dátumy sa interpretujú v `Europe/Bratislava`.
- **Údaje:** `GET /api/purchases` a tenantovo obmedzený serverový zoznam.

### 2.9 Verejná karta – `/k/[token]`
- **Kto:** Pa (ktokoľvek s platným QR/NFC).
- **Zobrazuje (iba tieto polia):** spoločné logo aplikácie, názov prevádzkujúcej firmy, zobrazované meno, kód partnera, body celkom, hrubý obrat s DPH, čistý obrat bez DPH, body a oba obraty za aktuálny mesiac, odznak aktuálneho mesiaca, počet mesiacov za každý tier a históriu ocenených mesiacov (mesiac, odznak, obrat bez DPH), históriu nákupov (dátum, suma s DPH, suma bez DPH, sadzba DPH, body, osobne/neosobne). Firma je odvodená z tokenu; vlastné firemné logá sa vo fáze 5A neriešia.
- **Nezobrazuje:** poznámku, kontakty, IČO, predavača, zmazané nákupy, interné ID, iné tokeny.
- **Akcie:** iba prezeranie a stránkovanie.
- **Údaje:** `getPublicCard(token)` / `GET /api/public/card/{token}`; 20 nákupov na stránku, bez cache; pri zobrazení sa aktualizuje posledné použitie tokenu.

### 2.10 Reporty – `/app/reporty`
- **Kto:** A.
- **Zobrazuje:** (1) mesačný prehľad partnerov so súčtom, (2) odkaz na detail partnera s obdobím, (3) históriu nákupov s filtrami (obdobie, partner, predavač, zmazané).
- **Akcie:** filtrovať, triediť, exportovať CSV. Bez grafov.
- **Údaje:** `GET /api/reports/monthly`, `GET /api/purchases`.

### 2.11 Audit log – `/app/audit`
- **Kto:** A; SA po výslovnom výbere firmy.
- **Zobrazuje:** čas, používateľa, akciu, entitu, partnera, dôvod a bezpečné porovnanie pôvodných a nových hodnôt; citlivé kontaktné údaje, heslá a tokeny sa nezobrazujú.
- **Vzhľad:** kompaktný zoznam s oddelenými riadkami; porovnanie pred/po sa rozbalí cez „Podrobnosti zmeny“. Rovnaký štýl sa používa v detaile partnera a nákupu, platformový audit má kompaktné riadky bez JSON podrobností.
- **Farebné označenie:** dátum má jemný jantárový badge s ikonou kalendára, čas neutrálny sivý badge s hodinami; typ udalosti používa jantárovú, indigovú alebo teal paletu existujúcich odznakov projektu. Dátum aj čas sa zobrazujú v `Europe/Bratislava`.
- **Akcie:** filtrovať a stránkovať. **Bez úprav a mazania; export patrí do fázy 10.**
- **Filtre:** dátum od–do (vrátane oboch dní v `APP_TIMEZONE`), používateľ, akcia, typ a ID záznamu, ID partnera.
- **Údaje:** `GET /api/audit-logs`.

### 2.12 Exporty – `/app/exporty`
- **Kto:** A.
- **Akcie:** stiahnuť CSV partnerov, nákupov, mesačného prehľadu a auditu.
- **Údaje:** `GET /api/exports/*.csv`.

### 2.13 Používatelia – `/app/pouzivatelia`
- **Kto:** A (je potrebná, pretože neexistuje registrácia).
- **Akcie:** vytvoriť predavača alebo admina, deaktivovať, resetovať heslo, zmeniť rolu.
- **Údaje:** `/api/users`.

## 3. Navigácia podľa roly
Navigácia je bočný panel (spoločný komponent `AppShell` pre `/app` aj `/superadmin`). Na desktope (≥ `lg`) je stále viditeľný a dá sa zbaliť na úzky pruh s ikonami; stav sa pamätá v `localStorage`. Na telefóne je panel skrytý a otvára sa tlačidlom ☰ v hornej lište ako vysúvací panel (zatvorí sa krížikom, klepnutím mimo, klávesom Esc alebo po prechode na inú stránku). V päte panela je meno, rola a odhlásenie; pás s názvom firmy zostáva nad obsahom.

| Položka | SA | A | P |
|---|---|---|---|
| Firmy, Pridať firmu, platformový audit | ✅ | ❌ | ❌ |
| Dashboard | po výbere firmy | ✅ vlastná firma | ✅ vlastná firma (zjednodušený) |
| Skenovať | po výbere firmy | ✅ | ✅ (rýchly vstup z dashboardu) |
| Partneri | po výbere firmy | ✅ | iba vyhľadanie v rámci zápisu |
| Reporty, Audit, Exporty, Používatelia | po výbere firmy | ✅ vlastná firma | ❌ |
| Späť na firmy / zmeniť firmu | ✅ | ❌ | ❌ |

## 4. Obrazovky superadmina (fáza 5A)
| Cesta | Obsah a akcie |
|---|---|
| `/superadmin/firmy` | stránkovaný zoznam firiem, názov, slug, IČO, stav, počty používateľov/partnerov; vyhľadanie, filter stavu, pridanie, detail a otvorenie programu |
| `/superadmin/firmy/nova` | povinný názov a slug firmy, voliteľné IČO; meno, e-mail a dočasné heslo prvého admina; spoločné uloženie |
| `/superadmin/firmy/[id]` | údaje a admini firmy; úprava názvu/IČO, náhľad (iba na čítanie) sadzby DPH, limitu potvrdenia a hraníc odznakov, reset hesla alebo správa adminov v kontexte firmy, deaktivácia s dôvodom, aktivácia a vstup do programu |
| `/superadmin/audit` | platformové udalosti a filtrovanie udalostí vybranej firmy; zobrazuje firmu a skutočného aktéra, bez úprav a mazania |

### 2.14 Nastavenia firmy – `/app/nastavenia`
- **Kto:** A (úprava). SA vo vybranej firme vidí hodnoty iba na čítanie; nastavenia programu patria výlučne adminovi danej firmy.
- **Zobrazuje a upravuje:** sadzbu DPH firmy (predvolená 23 %, 0–100 %); nová sadzba platí iba pre nové nákupy. Tiež limit sumy s DPH, od ktorého zápis vyžaduje dodatočné potvrdenie; prázdna hodnota znamená vypnuté. Tri mesačné obratové hranice odznakov Bronzový/Strieborný/Zlatý partner sa počítajú bez DPH; všetky sú predvolene vypnuté.
- **Údaje:** `GET/PATCH /api/company/settings`; zmena sa zapisuje do auditu.

Neaktívna firma má viditeľné upozornenie: superadmin smie prezerať/exportovať históriu a spravovať firmu, nie vydávať tokeny alebo zapisovať/meniť/mazať nákupy. Pred aktiváciou musí mať firma aktívneho admina.
