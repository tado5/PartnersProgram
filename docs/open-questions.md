# Otvorené otázky a rozhodnutia

> Súvisí s: [IMPLEMENTACNY_PLAN.md](../IMPLEMENTACNY_PLAN.md)
> Po potvrdení presuňte otázku do časti „Rozhodnuté“ a premietnite ju do príslušného dokumentu.

## Stav uzamknutia fáz
| Fázy | Blokujúce otázky | Stav |
|---|---|---|
| 1 – 4 | Q4, Q5, Q12 | **🔒 uzamknuté (2026-10-07)** – pokyn na implementáciu bol daný; fáza 1 je dokončená |
| 5A | viacfiremný rozsah a superadmin | **potvrdené a implementované (2026-10-08)** – existujúce moduly izolované; DB/API regresie na izolovanej MariaDB, manuálna browserová/mobilná a reálna migračná akceptácia zostávajú |
| 5 | Q2, Q3 | otvorené |
| 6 | Q6, Q7 | rozhodnuté a implementované (2026-10-13); mobilná a DB akceptácia zostáva |
| 7 | Q13, Q14 | otvorené |
| 12 a tlač kariet | Q8, Q9, Q10, Q11 | otvorené |

---

## Rozšírenie potvrdené 2026-10-08 – superadmin a viac firiem
- Superadmin môže vytvárať firmy a ich prvých adminov, má zoznam firiem a prístup na správu všetkých ich programov.
- Každá firma má úplne oddelených používateľov, partnerov, nákupy, QR/NFC tokeny, reporty, exporty a audit. Partner sa medzi firmami nezdieľa.
- Firemný admin a predavač majú prístup iba k svojej firme; superadmin spravuje obchodné údaje vždy v explicitne vybranej firme, pod vlastnou auditovanou identitou.
- Architektonický návrh fázy 5A: spoločná aplikácia/databáza, izolácia cez `company_id`, jeden firemný účet patrí jednej firme a e-mail zostáva globálne unikátny. Rôzne domény, členstvo vo viacerých firmách, individuálne bodové pravidlá a fakturácia platformy nie sú súčasťou tejto fázy.
- Doterajšie schválenie fáz 1–4 zostáva historickým stavom jednofiremnej verzie; nové izolačné podmienky sa overia vo fáze 5A pred pokračovaním fázy 6.

## Potvrdené rozhodnutia pre fázy 1–4

### Q4 – Kód partnera ✅ `EP-7K3MX`
| Vlastnosť | Riešenie |
|---|---|
| Účel | **iba interný identifikátor pre predavača** (ručné vyhľadanie, identifikácia na kartičke) |
| Formát | `EP-` + 5 znakov, napr. `EP-7K3MX` |
| Abeceda | `23456789ABCDEFGHJKMNPQRSTVWXYZ` – bez zameniteľných `0 O 1 I L U` |
| Generovanie | náhodne (CSPRNG), nie sekvenčne; pri kolízii sa vygeneruje znova; 30⁵ ≈ 24,3 mil. kombinácií |
| Zadávanie | nezáleží na veľkosti písmen; medzery a pomlčky sa ignorujú; prefix je nepovinný (`7k3mx` = `EP-7K3MX`) |
| Stálosť | nemenný, nikdy sa nepoužije znova |
| Bezpečnosť | nie je prístupový údaj – neotvorí kartu ani neumožní zápis |
| QR/NFC | obsahujú iba náhodný token, nie kód |
| Vyhľadávanie | partnera musí byť možné nájsť aj **podľa mena alebo telefónu**; kód nie je jediný spôsob |

### Q5 – Údaje o partnerovi ✅
| Údaj | Povinné | Admin | Predavač | Verejná karta |
|---|---|---|---|---|
| Kód partnera | systém | ✅ | ✅ | ✅ |
| Typ (montážnik / firma / odporúčateľ) | **✅** | ✅ | ✅ | ❌ |
| Zobrazované meno | **✅** | ✅ | ✅ | ✅ |
| Telefón | – | ✅ | čiastočne maskovaný `*** *** 123` | ❌ |
| E-mail | – | ✅ | ❌ | ❌ |
| Kontaktná osoba | – | ✅ | ❌ | ❌ |
| IČO | – (odporúčané pri firme) | ✅ | ❌ | ❌ |
| Interná poznámka | – | ✅ | ❌ | ❌ |
| Aktívny, vytvoril, vytvorené, upravené | systém | ✅ | iba aktívni partneri | ❌ |

- Verejná karta zobrazuje z údajov partnera **iba zobrazované meno a kód** (k tomu body, obrat a históriu).
- Neevidujú sa: adresa, DIČ/IČ DPH, dátum narodenia, bankové údaje.
- Detail: [data-model § partners](data-model.md#2-partners).

### Q12 – Dĺžka prihlásenia ✅
| Rola | Odhlásenie po nečinnosti | Maximálna dĺžka |
|---|---|---|
| Predavač | 60 min | 10 h |
| Admin | 30 min | 8 h |
| Superadmin (rozšírenie 2026-10-08) | 30 min | 8 h |

Bez „Zapamätať si ma“; tlačidlo Odhlásiť je stále viditeľné; deaktivácia alebo reset hesla ukončí prístup okamžite; hodnoty sú nastaviteľné v `.env`. Detail: [security § 2](security.md#2-oprávnenia).

---

## Ostatné otvorené otázky
| # | Otázka | Návrh | Blokuje |
|---|---|---|---|
| Q2 | Formát tlačenej QR karty | vizitka 85 × 55 mm: logo, zobrazované meno, kód `EP-XXXXX`, QR | fáza 5 |
| Q3 | Typ NFC kariet a kto ich zapisuje | NTAG213/215; zapisuje admin aplikáciou v telefóne, potom kartu uzamkne | fáza 5 |
| Q8 | Kde bude produkcia | VPS s Dockerom | fáza 12 |
| Q9 | Kam ukladať zálohy mimo servera | šifrovaný objektový storage alebo NAS | fáza 12 |
| Q10 | Kto bude technický správca | – | fáza 12 |
| Q11 | Informovanie partnera o spracovaní údajov (GDPR) | informácia pri odovzdaní karty, mimo aplikácie | spustenie |
| Q13 | Koľko histórie zobraziť na verejnej karte | všetky nákupy, stránkovanie po 20 | fáza 7 |
| Q14 | Kontakt firmy/predajne na verejnej karte | Ak sa schváli, musí byť vlastný pre danú firmu; spoločný statický kontakt Europodlahy nie je vhodný pre viac firiem. Kontaktné polia a DTO sa doplnia až po potvrdení. | fáza 7 |

---

## Rozhodnuté
| # | Rozhodnutie | Dátum |
|---|---|---|
| D1 | Frontend je React v rámci Next.js (App Router, TypeScript), jedna aplikácia | 2026-10-07 |
| D2 | Pri lokálnom vývoji beží MariaDB v Dockeri, Next.js aplikácia a npm príkazy lokálne | 2026-10-07 |
| D3 | Tokeny sú 256-bitové náhodné; v DB iba SHA-256 odtlačok; partner môže mať viac aktívnych tokenov | 2026-10-07 |
| D4 | Opätovná tlač QR = nový token; pôvodný sa môže deaktivovať | 2026-10-07 |
| D5 | Poznámka k nákupu je iba interná | 2026-10-07 |
| D6 | Nákupy iba soft delete; povinný dôvod pri úprave aj zmazaní; všetko v audite | 2026-10-07 |
| D7 | Vratky rieši admin ručne | 2026-10-07 |
| D8 | Body = `FLOOR(net_amount)`; suma na vstupe je s DPH a netto sumu vypočíta server | 2026-10-13 |
| D9 | NFC je voliteľné; QR musí vždy fungovať | 2026-10-07 |
| D10 | Doména musí byť stabilná pred tlačou kariet | 2026-10-07 |
| D11 | Zápis iba admin alebo predavač; partner iba čítanie; audit je nemenný | 2026-10-07 |
| D12 | Mimo MVP: pokladňa, eKasa, vyplácanie bodov, registrácia, mobilná aplikácia, zložité reporty | 2026-10-07 |
| D13 | Štruktúra dokumentácie (8 súborov) je schválená | 2026-10-07 |
| D14 | Q4: kód `EP-XXXXX` je iba interný identifikátor pre predavača; vyhľadávanie aj podľa mena a telefónu | 2026-10-07 |
| D15 | Q5: povinné sú iba typ a zobrazované meno; ostatné polia (vrátane telefónu) sú nepovinné; verejná karta zobrazuje meno a kód; predavač vidí čiastočne maskovaný telefón | 2026-10-07 |
| D16 | Q12: predavač 60 min nečinnosti / max. 10 h; admin 30 min / 8 h | 2026-10-07 |
| D17 | Fázy 1–4 sú uzamknuté; pokyn na implementáciu bol daný | 2026-10-07 |
| D18 | Docker Compose spúšťa iba vývojovú databázu; aplikácia beží mimo Dockeru | 2026-10-07 |
| D19 | Superadmin zakladá firmy a ich prvých adminov; môže spravovať všetky firmy aj ich obchodné údaje | 2026-10-08 |
| D20 | Každá firma má úplne oddelený partnerský program; žiadne zdieľané účty, partneri, body, nákupy, tokeny, reporty ani audit medzi firmami | 2026-10-08 |
| D21 | Rozšírenie 5A sa zaradí pred fázu 6; doterajšie dáta patria firme Europodlahy a rola existujúceho admina sa automaticky nepovýši | 2026-10-08 |
| D22 | Doména pre aplikáciu a QR/NFC je `https://partners.europodlahy.sk`; produkčné QR/NFC adresy používajú túto stabilnú doménu | 2026-10-13 |
| D23 | Hranica na dodatočné potvrdenie nákupu sa nastavuje samostatne pre každú firmu; predvolene je vypnutá, dosiahnutie/prekročenie hranice vyžaduje potvrdenie zapisujúceho používateľa | 2026-10-13 |
| D24 | Predavač môže nastaviť dátum pri vytváraní nákupu; už uložený nákup môže upraviť alebo zmazať iba admin | 2026-10-13 |
| D25 | Mesačné odznaky: každá firma si nastavuje vlastné hranice; všetky sú predvolene vypnuté. Odznak sa počíta z nezmazaných nákupov aktuálneho kalendárneho mesiaca podľa `purchased_at` v `Europe/Bratislava`, bez limitu počtu partnerov; každý partner, ktorý hranicu dosiahne, dostane príslušný najvyšší aktívny odznak. Po skončení mesiaca sa odznak a obrat uložia ako nemenný historický záznam; neskoršie zmeny nákupov ani hraníc históriu neprepíšu. | 2026-10-13 |
| D26 | Predavač vždy zadáva sumu nákupu s DPH. Každá firma má nastaviteľnú sadzbu (predvolene 23 %); každá transakcia uchová sadzbu a netto sumu, ktoré sa použili v čase nákupu. Body aj obrat pre odznaky sa počítajú bez DPH; história si zachová použitú sadzbu. | 2026-10-13 |
| D27 | Sadzbu DPH, limit potvrdenia nákupu a hranice odznakov nastavuje výlučne admin danej firmy; superadmin ich vidí iba na čítanie. | 2026-10-13 |

D11 naďalej zakazuje zápis partnerovi bez prihlásenia; D19 ho rozširuje o auditovaný zápis superadmina vo výslovne vybranej firme.

### Q15 – Mesačné odznaky partnera (rozhodnuté)
- **Metóda výpočtu:** súčet `net_amount` (bez DPH) nezmazaných nákupov (`is_deleted = 0`) partnera za aktuálny kalendárny mesiac. Obdobie určuje `purchased_at` v `Europe/Bratislava`, nie čas vytvorenia záznamu. Počas aktuálneho mesiaca úprava alebo soft-delete nákupu môže zmeniť priebežný odznak.
- **Úrovne:** zobrazí sa najvyššia dosiahnutá aktívna úroveň, nie tri odznaky súčasne. Pevné názvy/poradie: Bronzový, Strieborný, Zlatý partner. Každý partner, ktorý dosiahne hranicu, dostane odznak; nejde o súťaž ani kvótu.
- **Nastavenie:** hranice upravuje iba firemný admin v `/app/nastavenia`; superadmin ich vidí len na čítanie. Každá hranica sa nastavuje samostatne a prázdna/vypnutá hodnota znamená, že daný tier nie je aktívny. Všetky hranice sú predvolene vypnuté; 500/1 000/2 000 € sú príklady, nie predvolené hodnoty. Nastavené hranice musia byť kladné a striktne rastúce.
- **Zobrazenie:** verejná karta zobrazí priebežný odznak a obrat bez DPH aktuálneho mesiaca, súhrnný počet mesiacov pre každý tier a zoznam mesiacov s udeleným odznakom. Admin uvidí rovnakú históriu v detaile partnera. Predavač môže vidieť aktuálnu úroveň, nie obrat ani kontakt. Farba sa vždy doplní textovým názvom.
- **Ukladanie:** aktuálny mesiac sa počíta priebežne; po jeho skončení sa pre každého partnera s dosiahnutou aktívnou hranicou uloží jeden historický záznam s mesiacom, najvyšším tierom, obratom a použitou hranicou. Uzavretý záznam sa nemení pri neskoršej oprave/zmazaní nákupu ani zmene nastavení. Uzatváranie mesiaca je idempotentné a opakovateľné.
- **Dáta/API:** tri nullable `DECIMAL(10,2)` hranice v nastaveniach firmy; nové firmy aj migrácia dostanú `NULL` (vypnuté). Samostatná tabuľka historických ocenení má unikátny záznam za partnera a mesiac. Verejné DTO vráti aktuálny tier/obrat a agregované aj mesačné historické ocenenia.
- **Akceptačné testy:** presne na hranici a nad ňou; všetci partneri môžu dosiahnuť rovnaký tier; prechod na vyššiu aktívnu úroveň; vypnuté a čiastočne zapnuté tiery; začiatok mesiaca/DST v `Europe/Bratislava`; odlišné `purchased_at`; vylúčenie zmazaných nákupov; zmena hraníc jednej firmy bez vplyvu na druhú; uzatvorenie odznaku jednorazovo/idempotentne; neskoršie zmeny nákupu alebo limitov nemenia historický snapshot.

### DPH pri nákupoch (rozhodnuté)
- Predavač vždy zadáva jednu sumu s DPH; nevyberá medzi hrubou a čistou sumou. UI jasne označí vstup a zobrazí vypočítanú DPH, netto sumu a počet bodov.
- Každá firma má jednu sadzbu DPH, predvolene 23 %, editovateľnú adminom. Hodnota musí byť v rozsahu 0–100 % s presnosťou na dve desatinné miesta; zmena platí pre nové nákupy.
- Server uchová pri nákupe hrubú sumu, použitú sadzbu aj netto sumu. Oprava starého nákupu zachová sadzbu uloženú pri pôvodnom nákupe. Netto suma sa počíta v centoch s half-up zaokrúhlením; body sú `FLOOR(net_amount)`.
- Dashboardy, reporty, prehľady, verejná karta a história nákupov označujú hrubé a čisté sumy; hranice odznakov a body používajú sumu bez DPH. Limit dodatočného potvrdenia zostáva porovnaný so zadanou hrubou sumou.
- Migrácia spätne priraďuje 23 % všetkým existujúcim nákupom a považuje uložené `amount` za sumu s DPH. Toto je nevyhnutný predpoklad, pretože historická sadzba ani to, či bola zadaná suma s DPH, sa predtým neevidovali.
