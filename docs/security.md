# Bezpečnosť: tokeny, oprávnenia, audit, mazanie

> Súvisí s: [IMPLEMENTACNY_PLAN.md](../IMPLEMENTACNY_PLAN.md) · [data-model](data-model.md) · [api](api.md)

> Viacfiremné pravidlá a rola superadmina sú implementované vrátane verejnej karty, reportov, auditu a CSV exportov (fázy 5A–10). DB akceptácia používa izolovanú MariaDB; automatizované browserové testy lokálny Chrome a dotykový viewport. Produkčná migrácia a manuálna akceptácia na fyzických zariadeniach zostávajú samostatnými krokmi.

## 1. Tokeny QR/NFC
| Pravidlo | Riešenie |
|---|---|
| Náhodný a nepredikovateľný | `crypto.randomBytes(32)` → base64url (43 znakov, 256 bitov) |
| Bez osobných údajov | token neobsahuje ID, kód ani meno; URL má tvar `{APP_BASE_URL}/k/{token}` |
| V DB iba odtlačok | `token_hash = SHA-256(token)`; v UI a logoch sa používa iba `token_hint` (6 znakov) |
| Viac tokenov na partnera | povolené (napr. QR + NFC), každý sa deaktivuje samostatne |
| Deaktivovaný token nefunguje | platí iba pri aktívnom tokene, partnerovi aj prevádzkujúcej firme; deaktivácia tokenu je nevratná |
| Opätovná tlač | vždy nový token; pôvodný sa ponúkne na deaktiváciu (predvolene áno) |
| Okamžitý účinok | verejná karta sa necachuje (`Cache-Control: no-store`); odpoveď má bezpečnostné hlavičky |
| Ochrana proti hádaniu | obmedzenie počtu požiadaviek na `/k/*`, `/api/public/*`, `/api/scan/resolve` (predvolene 30/min/IP) a rovnaká 404 pre všetky neplatné stavy |
| NFC karta | NTAG213/215, NDEF URL záznam, po zápise **uzamknúť proti prepisu** |

Plný token existuje iba v odpovedi pri vygenerovaní (na tlač QR a zápis NFC) a nikde sa neukladá.

Mesačný odznak (Q15) sa počíta serverovo iba z netto súm nezmazaných nákupov konkrétneho partnera a firmy; verejná karta vráti iba agregované sumy, aktuálnu úroveň a históriu udelených odznakov. Každý partner môže získať odznak pri dosiahnutí firemnej hranice; neexistuje kvóta ani poradie medzi partnermi. Hranice sú predvolene vypnuté. Po uzavretí mesiaca sa uloží nemenný snapshot tieru, obratu, výpočtového základu a použitej hranice; staršie odznaky ostanú označené ako brutto, nové ako netto. Aplikačný DB účet nemá právo historické snapshoty meniť ani mazať. Uzatvárací endpoint je dostupný iba s náhodným bearer secretom, kontroluje sa konštantným časom a je limitovaný podľa IP.

## 2. Oprávnenia
- Firemné účty vytvára admin iba vo vlastnej firme alebo superadmin vo vybranej firme. Prvého admina firmy zakladá superadmin. Globálny superadmin sa pri prvom nasadení vytvorí bezpečným bootstrapom; firemné API túto rolu nikdy neprideľuje. Registrácia neexistuje a partneri sa neprihlasujú.
- Heslá: argon2id, minimálne 10 znakov, dočasné heslo sa musí zmeniť.
- Ochrana proti hádaniu hesla: 5 neúspešných pokusov → zablokovanie na 15 min, k tomu obmedzenie počtu požiadaviek podľa IP.
- Prihlásenie má jednotnú chybovú odpoveď pre neplatné, deaktivované a zablokované účty; IP limit používa `RATE_LIMIT_LOGIN_PER_MIN`.
- IP limit je v pamäti procesu, preto je určený pre jednu aplikačnú inštanciu; pri horizontálnom škálovaní treba zdieľaný rate limiter.
- Lokálne rýchle prihlásenie je vypnuté okrem `LOCAL_QUICK_LOGIN_ENABLED=true` v development režime. Dostupné je iba pre tri pevne určené testovacie účty na localhost (superadmin, admin, predavač); konfigurácia v produkcii je odmietnutá. Testovací superadmin je samostatný globálny účet bez firmy; firemné účty sa nepovyšujú.
- Dočasné aj resetované heslo sa nikdy nezapisuje do auditu. Reset zmení `password_changed_at`, čím sa existujúce JWT sessions okamžite zneplatnia.
- Session: JWT v cookie `HttpOnly`, `Secure`, `SameSite=Lax`. Pri každej požiadavke na server sa overí `is_active` a `password_changed_at`.
- JWT má verziu firemného modelu, rolu a členstvo firmy; staré jednofiremné sessions sa odmietnu. Server porovná členstvo a rolu s aktuálnym DB účtom; firemný guard kontroluje aktuálnu aktivitu firmy. Cookie výberu SA je HMAC-podpísaná, HttpOnly a viazaná na aktéra aj konkrétne prihlásenie. Nenahrádza explicitný API header.
- Session cookie nemá `Expires` ani `Max-Age` (zatvorenie prehliadača ju odstráni); platnosť JWT sa zároveň serverovo obmedzuje podľa roly a nečinnosti.
- **Dĺžka prihlásenia (Q12):**

| Rola | Odhlásenie po nečinnosti | Maximálna dĺžka bez ohľadu na aktivitu |
|---|---|---|
| Predavač | **60 min** | **10 h** (jedna zmena) |
| Admin | **30 min** | **8 h** |
| Superadmin | **30 min** | **8 h** |

  - JWT obsahuje `loginAt` (kontrola maximálnej dĺžky) a `lastActivityAt` (kontrola nečinnosti; obnovuje sa najviac raz za 5 min). Overuje ich serverový guard.
  - Cookie je session cookie: zatvorením prehliadača sa používateľ odhlási. Voľba „Zapamätať si ma“ neexistuje.
  - Po vypršaní nasleduje presmerovanie na login a návrat na pôvodnú stránku. Rozpísaný formulár nákupu sa neodošle bez platnej session.
  - Tlačidlo **Odhlásiť** je stále viditeľné v hlavičke (zdieľaný tablet pri pulte).
  - Admin môže okamžite ukončiť prístup predavača deaktiváciou alebo resetom hesla.
  - Hodnoty sú nastaviteľné v `.env` (pozri [deployment](deployment.md#7-env)).
- Kontrola rolí:
  1. `middleware.ts` – prístup k `/app/*` a `/api/*`,
  2. guard `requireRole()` v každom route handleri a serverovej stránke (**rozhodujúca kontrola**),
  3. UI iba skrýva akcie, nejde o bezpečnostnú kontrolu.

| Akcia | Superadmin | Admin | Predavač | Partner |
|---|---|---|---|---|
| Zoznam a správa firiem, prvý admin | ✅ | ❌ | ❌ | ❌ |
| Správa partnerov | ✅ vo vybranej firme | ✅ vlastná firma | iba vyhľadanie vo vlastnej firme, maskovaný telefón | ❌ |
| Tokeny – generovanie, deaktivácia | ✅ vo vybranej firme | ✅ vlastná firma | ❌ | ❌ |
| Sken a zápis nákupu | ✅ vo vybranej firme | ✅ vlastná firma | ✅ vlastná firma | ❌ |
| Úprava a zmazanie nákupu | ✅ s dôvodom | ✅ vlastná firma, s dôvodom | ❌ | ❌ |
| Nastavenie firemného limitu potvrdenia | ✅ vo vybranej firme | ✅ vlastná firma | ❌ | ❌ |
| Reporty, firemný audit, exporty, firemní používatelia | ✅ vo vybranej firme | ✅ vlastná firma | ❌ | ❌ |
| Platformový audit | ✅ | ❌ | ❌ | ❌ |
| Verejná karta (iba čítanie) | platný token | platný token | platný token | platný token |

**Zápis nákupu vyžaduje platnú session admina/predavača danej firmy alebo superadmina s výslovne vybranou firmou.** Token sám o sebe nikdy neoprávňuje na zápis.

### Izolácia firiem
- Firemný kontext admina/predavača sa odvodzuje z aktuálneho DB účtu, nie z klientom poslaného `companyId`. Server pri každej požiadavke kontroluje aj aktivitu firmy.
- Superadmin má prístup ku všetkým firmám, ale obchodné API vždy pracuje s jednou explicitne vybranou firmou. Samotná superadmin rola neodstraňuje firemné filtre. Admin/predavač nesmú meniť kontext ani prideliť superadmin rolu.
- Cudzí používateľ, partner, token alebo nákup v firemnom API vráti neutrálnu 404. Overiť treba aj vnorené ID, query filtre, agregácie, súvisiace záznamy a konflikty idempotencie.
- QR/NFC sken cudzej firmy v prihlásenom programe vráti rovnakú 404 ako neplatná karta. Verejný token identifikuje iba svojho partnera vo svojej firme.
- Deaktivácia firmy okamžite blokuje jej adminov/predavačov, skenovanie aj verejné karty. Účty, partneri a tokeny sa hromadne nedeaktivujú; po aktivácii firmy platia pôvodné individuálne stavy. Superadmin môže neaktívnu firmu spravovať a čítať/exportovať históriu, ale nevydáva tokeny ani nezapisuje, neupravuje alebo nemaže nákupy do neaktívneho programu.
- Firemné cache, klientsky stav a SSR sa nesmú miešať medzi firmami alebo rolami. Zmena firemného kontextu musí zneplatniť rozpracované formuláre viazané na pôvodnú firmu.
- Superadmin zostáva skutočným aktérom v audite; nepoužíva sa impersonácia firemného admina. Vstup do kontextu firmy sa audituje.
- Zachovať aspoň jedného aktívneho superadmina a jedného aktívneho admina každej aktívnej firmy; ochrany sa vynucujú aj pri súbežných požiadavkách.
- Firemné zápisy a aktivácia/deaktivácia uzamknú riadok firmy pred kontrolou aktívnych adminov. Globálnu deaktiváciu podporuje iba interná služba `setSuperadminActivity` (žiadny verejný HTTP endpoint): serializuje sa na trvalom riadku Europodlahy a uzamkne superadminov. Firemné používateľské API globálne účty nikdy neupravuje. Bootstrap existujúce účty nedeaktivuje, neaktivuje ani nepovyšuje.

## 3. Mazanie a úpravy
- **Nákupy:** iba soft delete (`is_deleted = 1`, `deleted_at`, `deleted_by_user_id`). Fyzické mazanie neposkytuje API a nepovoľujú ho ani DB práva (účet aplikácie nemá `DELETE`).
- Každá firma môže nastaviť vlastný limit potvrdenia; `NULL` znamená vypnuté. Pri sume rovnej alebo vyššej ako limit musí používateľ pri zápise výslovne potvrdiť správnosť sumy. Server opätovne overí limit v transakcii pred vložením nákupu.
- **Firmy, partneri, používatelia, tokeny:** iba deaktivácia.
- **Povinný dôvod** pri: úprave nákupu, zmazaní nákupu, deaktivácii tokenu, partnera a firmy.
- **Vratky:** admin nákup ručne upraví alebo zmaže. Záporné sumy sa nepovoľujú.
- Klient nikdy neposiela čistú sumu, sadzbu DPH ani body ako autoritatívne hodnoty. Server uloží sadzbu platnú pre firmu, vypočíta netto sumu a body pri novom nákupe; oprava používa historickú sadzbu nákupu. DB vynucuje vzťah netto sumy k hrubej sume a sadzbe aj `points = FLOOR(net_amount)`.
- Duplicitný zápis zabraňuje `idempotency_key` z formulára.

## 4. Audit log
**Nemenný, iba pridávanie záznamov:**
1. Účet aplikácie má na `audit_logs` iba `SELECT, INSERT`.
2. Triggre `BEFORE UPDATE` a `BEFORE DELETE` vyvolajú chybu.
3. Aplikácia neobsahuje žiadnu funkciu na úpravu ani mazanie auditu.
4. Záznam sa ukladá v **tej istej transakcii** ako zmena.

**Zaznamenávané akcie:**
| Oblasť | Akcie |
|---|---|
| Nákupy | `purchase.create`, `purchase.update`*, `purchase.delete`* |
| Partneri | `partner.create`, `partner.update`, `partner.deactivate`*, `partner.activate`, `partner.privacy_provided` |
| Tokeny | `token.create`, `token.deactivate`* |
| Používatelia | `user.create`, `user.update`, `user.password_reset` |
| Prihlásenie | `auth.login`, `auth.login_failed`, `user.password_change` |
| Exporty | `export.csv` (typ a filtre); `export.report_pdf` (obdobie `month`/`from`/`to`, typ partnera) |
| Firmy | `company.create`, `company.update`, `company.deactivate`*, `company.activate`, `company.logo_update`, `company.logo_delete`, `company.privacy_draft_update`, `company.privacy_publish` |
| Superadmin | `company.context_select` (vstup do firemného programu) |

\* povinný `reason`. Pri úpravách sa ukladajú `old_values` aj `new_values`.
**Nikdy sa neukladá:** heslo, `password_hash`, plný token. Pred uložením sa auditové JSON hodnoty filtrujú: tajné kľúče sa vynechajú a kontaktné údaje, interné poznámky a nákupové poznámky sa nahradia značkou „Skryté“. Historické nemenné záznamy sa spätne neprepisujú; ich citlivé polia sa pri zobrazení/API filtrujú.

Firemné udalosti majú `company_id` danej firmy aj pri zásahu superadmina; `user_id` je vždy skutočný aktér. Platformové udalosti bez konkrétnej firmy majú `company_id = NULL` a sú prístupné iba superadminovi. Firemný admin nikdy nevidí platformový audit ani audit inej firmy. `/app/audit` a `GET /api/audit-logs` sú iba na čítanie a vyžadujú admina alebo superadmina vo výslovne vybranej firme; výsledky sú stránkované a filtrované v rámci tejto firmy. `/superadmin/audit` je prístupný iba superadminovi a zobrazuje samostatne platformové udalosti alebo audit jedinej vybranej firmy. Historický audit zostáva nemenný aj pri migrácii (pozri [data-model](data-model.md#izolácia-väzieb-a-migrácia-fáza-5a)).

## 5. Verejná karta – iba na čítanie
- Iba GET; žiadne formuláre, server actions ani zápisové API na verejných cestách (iné metódy vrátia 405).
- DTO sa skladá výlučne z povolených polí a sumy sú označené ako s DPH, bez DPH a sadzba použitá pri nákupe; body aj odznaky používajú netto sumu. `companyName` označuje prevádzkovateľa programu; interné `companyId` sa nezverejňuje.
- **Interná poznámka, kontakty, IČO, predavač a zmazané nákupy sa nikdy nezobrazujú.**
- Kód partnera (`EP-XXXXX`) sa zobrazuje, ale nie je prístupový údaj – kartu ani zápis neotvorí (pozri [data-model](data-model.md#2-partners)).
- Hlavičky: `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.

## 6. Webová bezpečnosť
- V produkcii HTTPS a HSTS (Caddy).
- CSP, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` (kamera iba pre `/app/sken`).
- CSRF: Auth.js token pre login; pre zápisové API kontrola `Origin` / `Sec-Fetch-Site` a cookie `SameSite`.
- SQL injection: iba Prisma; `$queryRaw` iba s tagged template.
- XSS: escapovanie v Reacte, žiadne `dangerouslySetInnerHTML`.
- CSV injection: hodnoty začínajúce `= + - @`, TAB alebo CR dostanú na začiatok apostrof.
- Tajomstvá sú iba v `.env` (gitignored), do repozitára ide iba `.env.example`.

## 7. Informovanie o spracúvaní osobných údajov
- Každá firma spravuje vlastný návrh informačného oznámenia; publikovať ho môže iba jej admin. Superadmin má náhľad, predavač nemá prístup k nastaveniam ani evidencii informovania.
- Návrh možno uložiť neúplný. Publikovanie vyžaduje identifikáciu a sídlo prevádzkovateľa, platný kontaktný e-mail a text oznámenia (100–20 000 znakov); prípadné IČO má osem číslic. Kontrola polí nie je právnym posúdením obsahu. Predvyplnené znenie a retenčné pravidlá musí firma overiť podľa skutočného spracúvania.
- Publikovaná verzia je nemenná, účinná od publikovania. Publikovanie vyžaduje token skontrolovaného návrhu `expectedUpdatedAt`; súbežné/stará verzia návrhu vráti konflikt. História oznámení a poskytnutí je chránená DB triggermi a právami iba `SELECT, INSERT`.
- Registrácia nového partnera vyžaduje aktuálne publikované oznámenie a výslovný záznam skutočného poskytnutia jeho verzie: dátum/čas, spôsob (`in_person`, `printed`, `email`) a zaznamenávajúci používateľ. Poskytnutie nesmie predchádzať publikovaniu verzie ani byť v budúcnosti. Registrácia a evidencia sa uložia atomicky. Pri zmene verzie počas registrácie sa formulár musí obnoviť.
- Evidencia nie je súhlas so spracúvaním ani dôkaz prečítania. Oznámenie treba poskytnúť pred získaním údajov alebo pri ich získavaní; odkaz na karte je doplnkový. Výber spôsobu e-mail nič neodosiela. Existujúci partneri nemajú automaticky doplnený dátum ani domnelé potvrdenie.
- Pri existujúcom partnerovi môže vlastný admin pridať záznam aj k staršej publikovanej verzii. Ďalší záznam vyžaduje dôvod (2–255 znakov); pôvodná história zostáva zachovaná. Nová verzia automaticky neruší predchádzajúce záznamy a systém nerozhoduje o potrebe opätovného informovania.
- Verejná stránka `/ochrana-udajov/{slug}?version=N` nevyžaduje token ani prihlásenie, zobrazuje iba publikovaný text aktívnej firmy a určené firemné kontakty. Text sa escapuje, nepodporuje HTML. Návrhy, údaje partnerov ani aktéri publikovania sa nezverejňujú.
- Verejná karta upozorňuje, že ktokoľvek s platným odkazom vidí zobrazené údaje. Spracúvané údaje sa tým nestávajú anonymnými.
- Audit ukladá metadáta publikácie a poskytnutia, nie celé oznámenia ani kontakty prevádzkovateľa. Dôvody záznamov nemajú obsahovať zbytočné osobné údaje.

**Mimo implementovaného rozsahu:** právne schválenie textov a základov, zmluvy so sprostredkovateľmi, lehoty uchovávania, vybavovanie žiadostí a skutočný výmaz/anonymizácia vrátane väzieb, auditu a záloh. Deaktivácia ani soft delete nie sú výmaz. Nemennosť histórie sama osebe neoprávňuje uchovávať údaje navždy; retenčný a výmazový proces treba samostatne právne aj technicky vyriešiť. Táto funkcionalita pokrýva podporu informovania, nie kompletný súlad s GDPR.

**Hlavný GDPR dokument:** `/gdpr` a jeho PDF pokrývajú údaje a procesy aplikácie. Nový firemný návrh je automaticky predvyplnený bez zástupných značiek. Názov a IČO sa preberajú z profilu; sídlo a e-mail sa vyžadujú pred publikovaním. Lehoty sú navrhnutou retenčnou politikou, nie zákonným univerzálnym pravidlom: správa programu + 3 roky, audit a tokeny 12 mesiacov, exporty 30 dní, zálohy 90 dní. Firma môže pravidlá upraviť v nastaveniach a musí zabezpečiť ich dodržiavanie mimo tohto formulára. Automatické mazanie sa týmto rozšírením neimplementuje a DB nemennosť histórie zostáva samostatným obmedzením pre retenčný proces. Nemožno tvrdiť, že politika už zodpovedá prevádzke alebo zaručuje GDPR súlad. Podmienky prenosov mimo EHP nepredstavujú potvrdenie umiestnenia hostingu; konkrétne prenosy musí firma overiť a opísať. PDF firemnej verzie vychádza z nemenného snapshotu.

Podklady: [EDPB – informovanie a práva osôb](https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en), [zásady spracúvania](https://www.edpb.europa.eu/sme/learn-the-basics/data-protection-basics_en), [prevádzkovateľ a sprostredkovateľ](https://www.edpb.europa.eu/sme/learn-the-basics/data-controller-or-data-processor_en).

## 8. Bezpečnostné testy (povinné pred nasadením)
Lokálna automatizovaná akceptácia: `npm run test:phase11` (aktuálny produkčný build, izolovaná MariaDB a lokálny Chrome). Inventár route/metód je v `tests/phase11-http.test.ts`; pri pridaní explicitnej API metódy vyžaduje scenár. Rolové kontroly nepovažujeme za úplné funkčné pokrytie všetkých kombinácií payloadov. Auth.js je pokrytý session/signout kontrolami a osobitnými login/session scenármi; cron kontrolou bearer oprávnenia a existujúcimi integračnými scenármi uzatvárania mesiaca.

- Matica rolí: každý endpoint × superadmin / admin / predavač / neprihlásený, aspoň dve firmy vrátane neaktívnej.
- Zápis cez verejnú URL nie je možný.
- Deaktivovaný token, neaktívny partner aj neaktívna firma vrátia 404; sken tokenu inej firmy tiež.
- Poznámka sa na verejnej karte nezobrazí.
- Audit: `UPDATE`/`DELETE` zlyhá; každá zápisová akcia vytvorí záznam.
- Obmedzenie počtu požiadaviek vráti 429; XSS v poznámke sa nevykoná; CSV injection je neutralizovaná.
- Priame cudzie ID, vnorené vzťahy, vyhľadávanie, reporty, audit a exporty nevrátia údaje inej firmy; klient nemôže zmeniť členstvo/rolu na superadmina.
- Superadmin založí firmu s prvým adminom atomicky; vstup a zásahy do firmy sa auditujú pod jeho identitou; prepnutie firmy neprenesie dáta, cache ani rozpracovaný formulár.
