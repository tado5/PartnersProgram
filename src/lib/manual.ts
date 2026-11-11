export type ManualRole = "superadmin" | "admin" | "seller";
export type ManualSection = {
  title: string;
  steps: readonly string[];
  result: string;
  warning?: string;
};
export type ManualArticle = {
  slug: string;
  title: string;
  summary: string;
  audience: "all" | "management" | "company-admin" | "superadmin";
  sections: readonly ManualSection[];
  related: readonly string[];
  action?: { href: string; label: string };
};

export const manualRoleLabels: Record<ManualRole, string> = {
  superadmin: "Superadministrátor",
  admin: "Administrátor firmy",
  seller: "Predavač",
};

export const manualArticles: readonly ManualArticle[] = [
  {
    slug: "zaciname", title: "Začíname", audience: "all",
    summary: "Zorientujte sa v aplikácii a pripravte sa na prvý pracovný deň.",
    sections: [
      {
        title: "Prihlásenie a prvé použitie",
        steps: [
          "Otvorte prihlasovaciu stránku a zadajte e-mail a heslo, ktoré vám odovzdal správca. Aplikácia nemá samostatnú registráciu používateľov.",
          "Na vlastnom zariadení môžete pred prihlásením zaškrtnúť Zapamätať si prihlásenie. Bez tejto voľby platia bežné časové limity relácie.",
          "Ak používate dočasné heslo, najprv si nastavte vlastné. Po zmene sa prihláste novým heslom.",
          "Skontrolujte meno a rolu v menu. Vo firemnom programe skontrolujte aj názov firmy.",
          "Na počítači používajte bočný panel; na telefóne ho otvorte tlačidlom menu v hornej lište. Posledná položka Manuál obsahuje návody pre vaše oprávnenia.",
        ],
        result: "Predavač a firemný administrátor začínajú na Prehľade. Superadministrátor začína v zozname firiem.",
        warning: "Nezdieľajte prihlasovacie údaje. Po skončení práce na spoločnom zariadení použite Odhlásiť.",
      },
      {
        title: "Inštalácia na plochu telefónu",
        steps: [
          "Na úvodnej alebo prihlasovacej stránke vyberte Nainštalovať pre Android alebo Nainštalovať pre iOS.",
          "V Androide potvrďte ponúknutú inštaláciu. Ak sa výzva nezobrazí, v Chrome otvorte ponuku a vyberte Nainštalovať aplikáciu alebo Pridať na plochu.",
          "Na iPhone alebo iPade otvorte stránku v Safari a vyberte Zdieľať, Pridať na plochu a Pridať. Ak sa ponúka Otvoriť ako webovú aplikáciu, nechajte túto možnosť zapnutú.",
          "Aplikáciu potom otvorte ikonou na ploche a prihláste sa svojím účtom.",
        ],
        result: "PartnersProgram môžete otvárať z plochy bez obchodu s aplikáciami.",
        warning: "Aplikácia potrebuje internet. Inštalácia neznamená automatické prihlásenie ani možnosť pracovať offline.",
      },
      {
        title: "Čo môže moja rola",
        steps: [
          "Predavač vyhľadáva aktívnych partnerov, skenuje karty a zapisuje nákupy. V histórii vidí len svoje dnešné zápisy.",
          "Administrátor firmy spravuje partnerov, karty, používateľov, nákupy, reporty, exporty a nastavenia svojej firmy.",
          "Superadministrátor spravuje firmy a po výslovnom výbere vstupuje do ich programu pod vlastnou identitou. Logo, pravidlá programu a publikovanie oznámenia o ochrane údajov patria firemnému administrátorovi.",
        ],
        result: "Menu aj kapitoly manuálu zodpovedajú vašej role. Manuál sám žiadne oprávnenie nerozširuje.",
      },
    ],
    related: ["nastavenie-firmy", "firmy", "zapis-nakupu", "heslo"],
  },
  {
    slug: "firmy", title: "Firmy a prvý administrátor", audience: "superadmin",
    summary: "Vytvorenie firmy, úprava jej údajov a správa dostupnosti programu.",
    action: { href: "/superadmin/firmy", label: "Otvoriť firmy" },
    sections: [
      {
        title: "Vytvorenie firmy",
        steps: [
          "V menu Firmy otvorte Pridať firmu.",
          "Vyplňte názov a nemenný slug: malé písmená bez diakritiky, čísla a prípadne pomlčky medzi slovami. IČO je nepovinné.",
          "Vyplňte meno, e-mail a dočasné heslo prvého administrátora. Dočasné heslo musí mať aspoň 10 znakov.",
          "Použite Uložiť. Firmu a prvého administrátora aplikácia vytvorí spolu.",
          "Odovzdajte administrátorovi prihlasovaciu adresu a dočasné heslo bezpečným spôsobom mimo aplikácie. Automatické odoslanie e-mailu nie je súčasťou tohto kroku.",
        ],
        result: "Firma má prvého administrátora, ktorý si pri prihlásení musí zmeniť heslo.",
      },
      {
        title: "Úprava, pozastavenie a obnovenie firmy",
        steps: [
          "Vyhľadajte firmu v zozname a otvorte detail. Upravte názov alebo IČO a uložte údaje; slug sa nemení.",
          "Na pozastavenie vyplňte Dôvod deaktivácie a použite Deaktivovať firmu.",
          "Na obnovenie použite Aktivovať firmu. Firma musí mať aktívneho administrátora.",
          "Sadzbu DPH, limit potvrdenia nákupu a hranice ocenení vidíte v detaile iba na čítanie. Upravuje ich administrátor danej firmy.",
        ],
        result: "Pozastavený program neumožňuje bežný prístup firmy, verejné karty ani nové nákupy. História sa nemaže; superadministrátor ju môže prezerať a exportovať.",
        warning: "Deaktivácia ovplyvní všetkých používateľov a karty firmy. Nie je to vymazanie firmy ani jej údajov.",
      },
    ],
    related: ["prepinanie-firiem", "pouzivatelia", "platformovy-audit"],
  },
  {
    slug: "prepinanie-firiem", title: "Vstup do programu firmy", audience: "superadmin",
    summary: "Bezpečne vyberte firmu a rozlišujte globálnu správu od firemného programu.",
    action: { href: "/superadmin/firmy", label: "Vybrať firmu" },
    sections: [{
      title: "Otvorenie a zmena firmy",
      steps: [
        "V zozname alebo detaile firmy použite Otvoriť program firmy.",
        "Pred prácou skontrolujte názov firmy v hlavičke. Operácie robíte ako superadministrátor, nie ako prihlásený firemný administrátor.",
        "Vo firemnom menu sú partneri, karty, nákupy, používatelia, reporty, audit a exporty. Firemné nastavenia vrátane loga a oznámenia sú pre vás iba na čítanie.",
        "Na zmenu firmy použite Späť na firmy / zmeniť firmu. Najprv dokončite rozpracované formuláre; pri prepnutí sa neuložené údaje zahodia.",
        "Ak firmu prepnete v inom tabe, nepokračujte v starom formulári. Otvorte správny program znova.",
      ],
      result: "Pracujete výslovne vo vybranej firme. Manuál v globálnej správe možno čítať aj bez jej výberu.",
      warning: "Pri pozastavenej firme je história dostupná superadministrátorovi, ale vydávanie kariet a zápis či zmena nákupov sú blokované.",
    }],
    related: ["firmy", "partneri", "qr-karty", "reporty"],
  },
  {
    slug: "platformovy-audit", title: "Globálny audit", audience: "superadmin",
    summary: "Dohľadajte platformové udalosti a zodpovedného používateľa.",
    action: { href: "/superadmin/audit", label: "Otvoriť globálny audit" },
    sections: [{
      title: "Vyhľadanie udalosti",
      steps: [
        "Otvorte Audit v globálnom menu superadministrátora.",
        "Použite dostupné filtre, prípadne vyberte firmu a prechádzajte strany výsledkov.",
        "Skontrolujte čas, firmu, akciu a skutočného používateľa, ktorý ju vykonal.",
        "Na podrobnosti zmien partnera alebo nákupu vstúpte do programu príslušnej firmy a použite jej Audit log.",
      ],
      result: "Viete rozlíšiť platformové udalosti a udalosti konkrétnej firmy.",
      warning: "Audit slúži na prezeranie. Udalosti sa tu neupravujú ani nemažú.",
    }],
    related: ["prepinanie-firiem", "audit"],
  },
  {
    slug: "nastavenie-firmy", title: "Prvé nastavenie firmy", audience: "company-admin",
    summary: "Pripravte pravidlá, logo a oznámenie pred registráciou prvých partnerov.",
    action: { href: "/app/nastavenia", label: "Otvoriť nastavenia" },
    sections: [
      {
        title: "Odporúčané poradie prvého nastavenia",
        steps: [
          "V menu Nastavenia skontrolujte sadzbu DPH firmy. Povolený rozsah je 0 až 100 %, predvolená sadzba je 23 %.",
          "Podľa potreby vyplňte Potvrdenie pri nákupe od (€). Pri rovnej alebo vyššej hrubej sume bude zapisujúci používateľ musieť nákup dodatočne potvrdiť. Prázdne pole túto kontrolu vypne.",
          "Nastavte mesačné hranice Bronzový, Strieborný a Zlatý partner podľa obratu bez DPH. Vyplnené hranice musia rásť; prázdna hranica dané ocenenie vypína.",
          "Použite Uložiť nastavenie. Skontrolujte potvrdenie uloženia.",
          "Pripravte a publikujte oznámenie o ochrane osobných údajov podľa samostatného návodu. Bez publikovanej verzie nemožno registrovať nového partnera.",
          "Pridajte používateľov, potom partnerov a ich karty.",
        ],
        result: "Firma je pripravená na prácu podľa vlastných nastavení.",
        warning: "Zmena DPH platí pre nové nákupy; spätne neprepočítava uložené nákupy. Názov a IČO firemného profilu spravuje superadministrátor.",
      },
      {
        title: "Logo firmy",
        steps: [
          "V Nastaveniach v časti Logo firmy vyberte PNG, JPEG alebo WebP do 2 MiB. SVG, GIF a animované obrázky nie sú podporované.",
          "Nahrajte logo a skontrolujte výsledok. Na odstránenie použite ovládanie odstránenia loga.",
          "Overte zobrazenie v menu, verejnej karte a novom PDF reporte. Ostatné otvorené stránky obnovte.",
        ],
        result: "Bez loga sa zobrazuje názov firmy. Už stiahnuté PDF sa dodatočne nezmení.",
      },
    ],
    related: ["ochrana-udajov", "pouzivatelia", "partneri", "body"],
  },
  {
    slug: "pouzivatelia", title: "Používatelia a prístupy", audience: "management",
    summary: "Pridávajte účty, nastavujte roly a riešte zabudnuté heslá.",
    action: { href: "/app/users", label: "Otvoriť používateľov" },
    sections: [{
      title: "Vytvorenie a správa účtu",
      steps: [
        "Otvorte Používatelia. Vyplňte meno, e-mail, dočasné heslo a rolu Administrátor alebo Predavač a použite Vytvoriť účet.",
        "Dočasné heslo odovzdajte bezpečne mimo aplikácie. Používateľ si ho pri prihlásení musí zmeniť; vytvorenie účtu automaticky neposiela e-mail.",
        "Pri existujúcom účte môžete zmeniť rolu, deaktivovať ho alebo znova aktivovať podľa dostupných ovládacích prvkov.",
        "Pri zabudnutom hesle vyplňte nové dočasné heslo pri konkrétnom používateľovi a použite Resetovať heslo.",
        "Skontrolujte úspešný výsledok. Ak aplikácia odmietne operáciu, prečítajte dôvod; neobchádzajte ochranu posledného aktívneho administrátora.",
      ],
      result: "Používateľ má prístup len podľa svojej roly a firmy. Reset hesla vyžaduje nové prihlásenie a zmenu dočasného hesla.",
      warning: "Administrátorská rola umožňuje meniť obchodné údaje firmy. Prideľujte ju len zodpovedným osobám; účet nepožičiavajte viacerým predavačom.",
    }],
    related: ["heslo", "zaciname", "audit"],
  },
  {
    slug: "partneri", title: "Pridanie a správa partnerov", audience: "management",
    summary: "Zaregistrujte partnera, upravte údaje a spravujte jeho aktívny stav.",
    action: { href: "/app/partneri", label: "Otvoriť partnerov" },
    sections: [
      {
        title: "Nový partner",
        steps: [
          "V menu Partneri otvorte Nový partner. Firma musí mať publikované oznámenie o ochrane údajov.",
          "Vyberte typ Montážnik, Firma alebo Odporúčateľ a vyplňte zobrazované meno. Toto meno bude aj na verejnej karte.",
          "Podľa potreby doplňte telefón, e-mail, kontaktnú osobu, IČO a internú poznámku. Partnerský kód pridelí systém pri uložení; nevytvárate ho ručne.",
          "Zaznamenajte skutočný spôsob a čas poskytnutia oznámenia a potvrďte pravdivosť záznamu. Ak publikovaná verzia chýba, požiadajte administrátora firmy o jej prípravu; superadministrátor ju nemôže publikovať namiesto neho.",
          "Uložte partnera. Ak ste zvolili Hneď vygenerovať QR, pokračujte vydaním karty; inak ju pripravte neskôr v detaile.",
        ],
        result: "Partner má vlastný kód a detail. Vydanie QR/NFC je samostatná operácia.",
        warning: "Pri upozornení na duplicitný telefón alebo IČO najprv overte, či partner už neexistuje. Nevytvárajte nový profil pri strate karty.",
      },
      {
        title: "Vyhľadanie, úprava a deaktivácia",
        steps: [
          "V zozname vyhľadávajte podľa mena, kódu, telefónu alebo IČO. Použite filtre typu, stavu a evidencie informovania.",
          "Otvorte detail partnera. Nájdete súhrny, nákupy, ocenenia, prístupy ku karte a históriu zmien.",
          "Na zmenu údajov otvorte úpravu partnera, vykonajte zmeny a uložte ich.",
          "Na deaktiváciu použite príslušnú akciu a vyplňte povinný dôvod. Ak partnera znovu aktivujete, skontrolujte aj stav jeho prístupov.",
        ],
        result: "Deaktivácia partnera nemaže jeho históriu, ale blokuje jeho verejné karty a nové nákupy.",
      },
    ],
    related: ["qr-karty", "stratena-karta", "ochrana-udajov", "verejna-karta"],
  },
  {
    slug: "qr-karty", title: "QR karta, tlač a zdieľanie", audience: "management",
    summary: "Vydajte kartu alebo znova vytlačte tú istú bez zmeny odkazu.",
    action: { href: "/app/partneri", label: "Vybrať partnera" },
    sections: [
      {
        title: "Vytvorenie a otvorenie karty",
        steps: [
          "Otvorte detail existujúceho aktívneho partnera a použite Vytvoriť kartu.",
          "Voliteľne zadajte označenie a potvrďte vytvorenie. Vznikne QR prístup; NFC sa automaticky nevytvára.",
          "V okne karty skontrolujte meno a kód partnera, prednú aj zadnú stranu a otvorenie správnej verejnej karty.",
          "Existujúcu kartu otvorte cez Otvoriť kartu. Náhľad, stiahnutie ani opätovná tlač nevytvárajú nový prístup.",
          "Podľa potreby skopírujte odkaz, použite dostupné systémové zdieľanie alebo stiahnite samostatný QR ako PNG/SVG.",
        ],
        result: "QR odkaz otvára partnerovu kartu bez prihlásenia. Najviac jeden QR a jeden NFC prístup môžu byť aktívne súčasne.",
        warning: "Odkaz a súbory karty chráňte. Ktokoľvek s odkazom môže prezerať verejnú históriu a finančné súhrny.",
      },
      {
        title: "Stiahnutie a tlač",
        steps: [
          "Pre kartovú tlač zvoľte PDF karty · 85,60 × 53,98 mm; dokument obsahuje prednú a zadnú stranu.",
          "Pre bežnú tlačiareň použite PDF na tlač · A4 s kartou a orezovými značkami.",
          "Tlačte v skutočnej veľkosti, na 100 %, bez prispôsobenia strane. Skontrolujte kontrolnú mierku a obojstrannú tlač najprv skúšobným hárkom.",
          "Po vytlačení overte čitateľnosť QR. Počas prípravy PDF počkajte na dokončenie; pri chybe čítajte správu a operáciu opakujte až po jej skončení.",
        ],
        result: "Opätovná tlač zachová odkaz aj platnosť pôvodnej karty. PDF používa pribalené písmo vrátane slovenskej diakritiky; na tlač netreba inštalovať písma.",
        warning: "Export nie je univerzálny výrobný podklad pre každú tlačiareň kariet; požiadavky tlačiarne overte osobitne. Pri strate použite náhradu, nie iba ďalšiu tlač.",
      },
    ],
    related: ["nfc", "stratena-karta", "verejna-karta"],
  },
  {
    slug: "nfc", title: "Aktivácia a príprava NFC", audience: "management",
    summary: "Pripravte samostatný NFC odkaz a bezpečne ho zapíšte na čip.",
    sections: [{
      title: "NFC prístup a fyzická karta",
      steps: [
        "V detaile partnera otvorte kartu a rozbaľte Použiť aj ako NFC kartu.",
        "Použite Aktivovať NFC a potvrďte vytvorenie. Potom načítajte a skopírujte jeho samostatnú URL.",
        "Kompatibilným NFC zapisovačom zapíšte URL ako NDEF URI záznam na vhodný čip, napríklad NTAG213/215. Aplikácia sama fyzický čip nezapisuje.",
        "Načítajte čip telefónom a overte, že otvorí správneho partnera a jeho históriu.",
        "Čip uzamknite proti prepisu až po úspešnom overení; uzamknutie môže byť nevratné.",
      ],
      result: "QR aj NFC vedú k tomu istému partnerovi a histórii, ale používajú odlišné, nezávislé prístupy.",
      warning: "Deaktivácia QR nezruší NFC a naopak. Po strate fyzickej karty s oboma prístupmi treba riešiť oba. Web NFC v skeneri funguje len na podporovaných zariadeniach a prehliadačoch.",
    }],
    related: ["qr-karty", "stratena-karta", "skenovanie"],
  },
  {
    slug: "stratena-karta", title: "Stratená karta a náhrada", audience: "management",
    summary: "Zneplatnite stratený prístup bez straty nákupov, bodov a ocenení.",
    action: { href: "/app/partneri", label: "Vyhľadať partnera" },
    sections: [{
      title: "Nahradenie strateného prístupu",
      steps: [
        "Vyhľadajte existujúceho partnera. Nevytvárajte nový profil.",
        "Otvorte jeho kartu a Správu prístupov. Pri stratenom QR alebo NFC zvoľte Nahradiť novým.",
        "Potvrďte nahradenie pôvodného prístupu a zadajte dôvod, napríklad Stratená karta.",
        "Potvrďte vytvorenie náhrady a pripravte novú tlač alebo zapíšte nový NFC odkaz.",
        "Ak bola stratená fyzická karta s QR aj NFC, zneplatnite alebo nahraďte oba prístupy. Overte novú kartu.",
      ],
      result: "Starý nahradený odkaz prestane fungovať. Nová karta toho istého partnera zobrazí aj jeho staré nezmazané nákupy, body a ocenenia.",
      warning: "Samotná opätovná tlač nezneplatní stratenú kartu. Ak kartu ešte nenahrádzate, stratený prístup aspoň deaktivujte s dôvodom.",
    }],
    related: ["qr-karty", "nfc", "verejna-karta"],
  },
  {
    slug: "skenovanie", title: "Nákup cez QR alebo NFC", audience: "all",
    summary: "Načítajte partnerovu kartu a pokračujte k zápisu nákupu.",
    action: { href: "/app/sken", label: "Otvoriť skenovanie" },
    sections: [{
      title: "Načítanie karty",
      steps: [
        "V menu zvoľte Skenovať. Pri QR použite Zapnúť kameru a povoľte prehliadaču prístup ku kamere.",
        "Namierte kameru na QR partnerskej karty a počkajte na overenie.",
        "Ak ste aplikáciu odložili do pozadia alebo kamera prestala poskytovať obraz, po návrate ju podľa zobrazenej správy znova zapnite; stránku netreba obnovovať.",
        "Pre NFC použite Načítať NFC, ak je vo vašom prehliadači dostupné, a priložte kartu. Čakanie možno zastaviť.",
        "Skontrolujte overeného partnera pred zadaním sumy; cudzie odkazy alebo neplatné a deaktivované karty nepoužívajte.",
        "Ak partner nemá kartu alebo zariadenie sken nepodporuje, použite Nákup bez karty a partnera vyhľadajte ručne.",
      ],
      result: "Po overení prejdete na formulár nákupu pre konkrétneho partnera.",
      warning: "Kamera a Web NFC vyžadujú bezpečné pripojenie a oprávnenia zariadenia. Čítanie NFC v aplikácii nie je podporované v každom prehliadači; použite QR alebo ručné vyhľadanie.",
    }],
    related: ["bez-karty", "zapis-nakupu", "problemy"],
  },
  {
    slug: "bez-karty", title: "Nákup bez karty", audience: "all",
    summary: "Vyhľadajte existujúceho aktívneho partnera bez skenovania.",
    action: { href: "/app/nakupy/manualne", label: "Otvoriť nákup bez karty" },
    sections: [{
      title: "Ručný výber partnera",
      steps: [
        "Na Prehľade alebo pri skenovaní otvorte Nákup bez karty.",
        "Zadajte meno, partnerský kód, telefón alebo IČO. Výsledky sa načítavajú počas písania; ďalších partnerov zobrazíte tlačidlom Zobraziť ďalších.",
        "Overte meno a kód správneho partnera. Predavač vidí telefón iba maskovane.",
        "Vyberte partnera a pokračujte k vyplneniu nákupu. Ak chýba, požiadajte administrátora o overenie alebo registráciu.",
      ],
      result: "Nákup bude vedený ako ručný zápis pre vybraného partnera; body sa počítajú rovnakým pravidlom.",
      warning: "Vyberajú sa iba aktívni partneri. Nevytvárajte duplicitného partnera len preto, že nemá kartu.",
    }],
    related: ["zapis-nakupu", "skenovanie"],
  },
  {
    slug: "zapis-nakupu", title: "Vyplnenie a potvrdenie nákupu", audience: "all",
    summary: "Zapíšte sumu, prítomnosť partnera a správny dátum bez duplicít.",
    sections: [{
      title: "Uloženie nákupu",
      steps: [
        "Po skene alebo ručnom výbere skontrolujte meno a kód partnera.",
        "Zadajte kladnú sumu s DPH v eurách. Možno použiť desatinnú čiarku alebo bodku; skontrolujte zobrazenú DPH, sumu bez DPH a náhľad bodov.",
        "Výslovne vyberte, či bol partner prítomný osobne. Skontrolujte dátum a čas; pri vytváraní ich môže upraviť aj predavač.",
        "Podľa potreby doplňte internú poznámku. Partner ju na verejnej karte nevidí.",
        "Uložte nákup. Ak suma dosiahne firemný limit, vykonajte požadované dodatočné potvrdenie.",
        "Počkajte na potvrdenie výsledku so sumou a bodmi. Pre nový zápis tomu istému partnerovi použite Ďalší nákup tohto partnera a vyplňte nový formulár.",
        "Pre iného partnera použite Skenovať ďalšieho, prípadne Prejsť na nákupy alebo Úvodná stránka.",
      ],
      result: "Úspešný zápis sa objaví v histórii a započíta sa partnerovi. Pri základe 100,99 € vznikne 100 bodov.",
      warning: "Počas ukladania neodosielajte ďalší nákup. Ak si pri výpadku nie ste istí výsledkom, najprv skontrolujte históriu; neopakujte rovnaký zápis naslepo.",
    }],
    related: ["historia-nakupov", "body", "problemy"],
  },
  {
    slug: "historia-nakupov", title: "História nákupov", audience: "all",
    summary: "Nájdite uložený nákup a zistite, čo je dostupné vašej role.",
    action: { href: "/app/nakupy", label: "Otvoriť nákupy" },
    sections: [{
      title: "Kontrola zapísaného nákupu",
      steps: [
        "Otvorte Nákupy alebo zodpovedajúci odkaz z Prehľadu.",
        "Predavač vidí iba vlastné dnešné zápisy; dnešok sa určuje podľa času Europe/Bratislava. Starší alebo cudzí zápis riešte s administrátorom.",
        "Administrátor môže filtrovať obdobie a partnera, zahrnúť zmazané nákupy a otvoriť detail.",
        "Pri väčšom počte výsledkov použite stránkovanie. Sledujte sumu, body, zapisujúceho a stav Osobne/Neosobne/Zmazaný.",
      ],
      result: "Viete overiť, či zápis existuje, ešte pred jeho prípadným opakovaním alebo opravou.",
      warning: "Predavač nemôže nákup upravovať ani mazať. Chybný zápis nahláste administrátorovi; nevyrovnávajte ho vymysleným ďalším nákupom.",
    }],
    related: ["opravy-nakupov", "zapis-nakupu", "reporty"],
  },
  {
    slug: "opravy-nakupov", title: "Oprava a zmazanie nákupu", audience: "management",
    summary: "Opravte chybu s povinným odôvodnením a zachovanou históriou.",
    action: { href: "/app/nakupy", label: "Vyhľadať nákup" },
    sections: [{
      title: "Úprava alebo zmazanie",
      steps: [
        "Nájdite nákup v Nákupoch alebo v detaile partnera a otvorte jeho detail.",
        "Pri oprave skontrolujte partnera, sumu, prítomnosť, poznámku a dátum/čas. Vyplňte povinný dôvod a uložte zmenu.",
        "Ak zápis nemá byť započítaný, použite zmazanie a vyplňte povinný dôvod. Nezadávajte záporný nákup ako náhradu tejto operácie.",
        "Skontrolujte upravený výsledok, partnerove súhrny a históriu zmien. Zmazané záznamy možno v administrácii zahrnúť do prehľadu.",
      ],
      result: "Zmena je dohľadateľná v audite. Zmazaný nákup sa nezapočítava do bežných súhrnov ani verejnej histórie; historický záznam sa fyzicky neodstraňuje.",
      warning: "Návod nepredstavuje účtovný proces vratiek. Zmeny robte podľa schválených pravidiel firmy; uzavreté historické ocenenia sa automaticky neprepisujú.",
    }],
    related: ["audit", "historia-nakupov", "body"],
  },
  {
    slug: "body", title: "Body a mesačné ocenenia", audience: "all",
    summary: "Pochopte rozdiel medzi sumou s DPH, bodmi a mesačným ocenením.",
    sections: [{
      title: "Ako sa počítajú výsledky",
      steps: [
        "Pri zápise zadávate sumu s DPH. Aplikácia podľa použitej sadzby vypočíta sumu bez DPH a zaokrúhli peňažný výsledok na centy.",
        "Body sú celé eurá sumy bez DPH, zaokrúhlené nadol pri každom nákupe. Nákup 123 € pri 23 % DPH dá základ 100 € a 100 bodov.",
        "Mesačné ocenenie závisí od mesačného obratu bez DPH a hraníc firmy. Nie je to len súťaž pre troch najlepších: hranicu môže dosiahnuť každý partner.",
        "Top 3 na Prehľade a v reporte je samostatné poradie partnerov, nie totožné s bronzovou, striebornou a zlatou hranicou ocenenia.",
        "Po skončení mesiaca sa pri vykonaní plánovaného uzavretia uloží história ocenení. Ak chýba, administrátor má preveriť uzavretie so správcom aplikácie; samotné otvorenie karty ho nespúšťa.",
      ],
      result: "Body sa sčítavajú z jednotlivých nákupov; aktuálne ocenenie a história uzavretých mesiacov majú odlišný význam.",
      warning: "Zmena firemnej DPH spätne nemení sadzby nákupov. Historicky uložené ocenenia sa dodatočnými opravami automaticky neprepočítavajú.",
    }],
    related: ["zapis-nakupu", "reporty", "verejna-karta", "nastavenie-firmy"],
  },
  {
    slug: "reporty", title: "Prehľad a reporty", audience: "management",
    summary: "Zobrazte výsledky firmy za mesiac alebo vlastné obdobie a stiahnite PDF.",
    action: { href: "/app/reporty", label: "Otvoriť reporty" },
    sections: [{
      title: "Výber obdobia a čítanie výsledkov",
      steps: [
        "Na Prehľade skontrolujte vybrané obdobie, súhrn súm s DPH/bez DPH, body, počet nákupov a Top 3 partnerov.",
        "Použite šípky mesiacov, výber mesiaca, Tento mesiac, Minulý mesiac alebo Od – do. Vlastné obdobie môže mať najviac 366 dní.",
        "V Reportoch použite prípadne filter typu partnera. Zobrazené poradie partnerov vychádza z obratu bez DPH.",
        "Na PDF použite Tlačiť / stiahnuť PDF. Počkajte na prípravu; dokument rešpektuje vybrané obdobie a filter typu.",
        "Ak potrebujete ďalšie spracovanie, použite Stiahnuť CSV. Overte rovnaké obdobie a filtre pri porovnávaní rôznych výstupov.",
      ],
      result: "Report zobrazuje nezmazané nákupy za vybrané obdobie. Dátumové hranice sa vyhodnocujú podľa Europe/Bratislava.",
      warning: "Porovnávajte rovnaké obdobia, filtre a hrubé/netto sumy; rozdielne nastavenie môže vysvetliť rozdielne súčty.",
    }],
    related: ["exporty", "body", "historia-nakupov"],
  },
  {
    slug: "exporty", title: "Exporty CSV", audience: "management",
    summary: "Stiahnite partnerov, nákupy, prehľad a audit a správne ich otvorte v tabuľkovom programe.",
    action: { href: "/app/exporty", label: "Otvoriť exporty CSV" },
    sections: [{
      title: "Stiahnutie a otvorenie súboru",
      steps: [
        "V Exportoch CSV vyberte formulár Partneri, Nákupy, mesačný prehľad alebo Audit a nastavte požadované filtre.",
        "Prípadne použite Stiahnuť CSV pri príslušnom zozname. Export zachová jeho filtre a obsahuje všetky zodpovedajúce riadky, nie iba otvorenú stranu.",
        "Počkajte na úspešné stiahnutie; prípadná chyba sa zobrazí pri formulári.",
        "Ak Excel nerozdelí stĺpce alebo nezobrazí správnu diakritiku, použite import Dáta → Z textu/CSV: kódovanie UTF-8, oddeľovač bodkočiarka a slovenské nastavenie desatinných čísel.",
        "Skontrolujte hlavičky, obdobie a súčty. Súbor uložte na miesto prístupné len oprávneným osobám.",
      ],
      result: "Získate filtrovaný výstup na ďalšie spracovanie. Úspešný export sa zaznamená do auditu.",
      warning: "CSV môže obsahovať kontaktné a interné údaje. Nezverejňujte ho a neposielajte ho neoprávneným osobám; export nie je záloha celej aplikácie.",
    }],
    related: ["reporty", "audit", "ochrana-udajov"],
  },
  {
    slug: "audit", title: "História zmien — Audit log", audience: "management",
    summary: "Zistite, kto, kedy a prečo zmenil firemné údaje.",
    action: { href: "/app/audit", label: "Otvoriť audit log" },
    sections: [{
      title: "Dohľadanie zmeny",
      steps: [
        "Otvorte Audit log alebo históriu v detaile partnera či nákupu.",
        "Zúžte výsledky pomocou dátumov, používateľa, akcie, typu/ID záznamu alebo ID partnera podľa dostupných filtrov.",
        "Pri udalosti skontrolujte čas, používateľa a dôvod; Podrobnosti zmeny rozbalia bezpečné porovnanie pôvodných a nových hodnôt.",
        "Použite stránkovanie alebo Stiahnuť CSV pre všetky udalosti zodpovedajúce filtrom.",
      ],
      result: "Máte dohľadateľný záznam zmien. Citlivé polia sa v porovnaní nezobrazujú.",
      warning: "Audit nemožno v používateľskom rozhraní upravovať ani mazať. Chybu obchodného záznamu opravujte v jeho detaile, nie zmenou auditu.",
    }],
    related: ["opravy-nakupov", "exporty"],
  },
  {
    slug: "ochrana-udajov", title: "Ochrana údajov a informovanie", audience: "company-admin",
    summary: "Publikujte oznámenie firmy a evidujte jeho skutočné poskytnutie partnerom.",
    action: { href: "/app/nastavenia", label: "Otvoriť ochranu údajov v nastaveniach" },
    sections: [
      {
        title: "Príprava a publikovanie oznámenia",
        steps: [
          "V Nastaveniach otvorte Ochranu osobných údajov. Skontrolujte údaje prevádzkovateľa, doplňte sídlo a kontaktný e-mail.",
          "Prečítajte celý dokument vrátane účelov, právnych základov, služieb a lehôt. Prednastavený text musí firma overiť podľa skutočnej prevádzky.",
          "Podľa potreby rozbaľte Zobraziť alebo upraviť podmienky a lehoty. Obnoviť predvolené znenie použite len vtedy, ak chcete nahradiť vlastné úpravy.",
          "Uložte návrh a potom výslovne publikujte verziu. Ak návrh zmeníte, pred publikovaním ho znova uložte.",
          "Skontrolujte verejnú verziu a jej PDF. Zverejnené verzie tvoria históriu; nový text nenahrádza starú evidenciu.",
        ],
        result: "Publikované oznámenie umožní následnú registráciu partnerov s evidenciou informovania.",
        warning: "Publikovanie nie je právna certifikácia. Lehoty v texte nespúšťajú automatické mazanie. Superadministrátor má túto časť iba na čítanie.",
      },
      {
        title: "Záznam poskytnutia a práca s osobnými údajmi",
        steps: [
          "Pri registrácii zaznamenajte skutočný spôsob a čas odovzdania aktuálnej verzie a potvrďte pravdivosť. Nevytvárajte fiktívny záznam.",
          "V detaile partnera kontrolujte stav a históriu informovania. Pri ďalšom zázname vyberte skutočne poskytnutú publikovanú verziu a doplňte dôvod.",
          "Žiadosti o prístup k údajom alebo výmaz postúpte zodpovednej osobe firmy; overte totožnosť a rozsah podľa schváleného postupu.",
          "Chráňte stiahnuté exporty aj odkazy na karty. Deaktivácia partnera alebo zmazanie nákupu nie sú úplným výmazom osobných údajov.",
        ],
        result: "História zachytáva evidované poskytnutie dokumentu, nie domnelý súhlas alebo dôkaz jeho prečítania.",
        warning: "Aplikácia nemá všeobecné samoobslužné tlačidlo na úplný export/výmaz osoby ani automatické čistenie všetkých kategórií údajov.",
      },
    ],
    related: ["partneri", "verejna-karta", "exporty"],
  },
  {
    slug: "verejna-karta", title: "Čo vidí držiteľ karty", audience: "all",
    summary: "Vysvetlenie partnerskej karty, jej údajov a bezpečnosti odkazu.",
    sections: [{
      title: "Otvorenie a obsah karty",
      steps: [
        "Držiteľ naskenuje QR alebo načíta NFC odkaz telefónom; na verejnú kartu sa neprihlasuje.",
        "Vidí názov/logo firmy, meno a kód partnera, celkové aj mesačné body a obraty bez DPH/s DPH.",
        "Vidí aktuálne ocenenie a históriu ocenení aj jednotlivé nezmazané nákupy: dátum/čas, sumy, sadzbu DPH, body a Osobne/Neosobne. Nákupy sú po 20 na stránku.",
        "Kontakty, interné poznámky a meno predavača sa na verejnej karte nezobrazujú. Držiteľ tu nemôže zapisovať alebo meniť nákupy.",
        "Pri strate karty kontaktuje administrátora firmy. Nový prístup pre toho istého partnera zachová jeho históriu.",
      ],
      result: "Karta slúži na prezeranie partnerových výsledkov. QR a NFC toho istého partnera zobrazujú rovnakú históriu.",
      warning: "Každý, komu odkaz prepošlete, môže tieto údaje vidieť. Karta funguje len pri aktívnej firme, partnerovi a príslušnom prístupe.",
    }],
    related: ["stratena-karta", "body", "problemy"],
  },
  {
    slug: "heslo", title: "Heslo, prihlásenie a odhlásenie", audience: "all",
    summary: "Zmeňte heslo a bezpečne ukončite prácu.",
    action: { href: "/change-password", label: "Otvoriť zmenu hesla" },
    sections: [{
      title: "Zmena hesla a obnova prístupu",
      steps: [
        "V menu použite Zmeniť heslo. Zadajte súčasné a nové heslo s minimálne 10 znakmi.",
        "Potvrďte zmenu. Aplikácia vás odhlási; znova sa prihláste novým heslom.",
        "Pri zabudnutom hesle kontaktujte administrátora firmy; administrátor rieši chýbajúci prístup so správcom aplikácie. Samoobslužné zasielanie obnovovacieho e-mailu nie je dostupné.",
        "Pri prihlásení môžete na vlastnom zariadení zvoliť Zapamätať si prihlásenie. Relácia trvá najviac 7 dní od prihlásenia; pri zmene hesla alebo účtu sa môže skončiť skôr.",
        "Ak sa relácia skončí pre nečinnosť, časový limit alebo zmenu účtu, prihláste sa znova. Neuložený formulár môže byť potrebné vyplniť opäť.",
        "Na konci práce použite Odhlásiť, najmä na zdieľanom zariadení.",
      ],
      result: "Prístup je viazaný na váš osobný účet; dočasné heslá nenahrádzajú vlastné heslo.",
      warning: "Zapamätanie nezapínajte na spoločnom alebo verejnom zariadení. Pri dočasnom zablokovaní po chybných pokusoch rešpektujte správu na prihlasovacej stránke a neodosielajte opakovane ďalšie pokusy.",
    }],
    related: ["problemy", "zaciname"],
  },
  {
    slug: "problemy", title: "Časté problémy", audience: "all",
    summary: "Bezpečné riešenia problémov s kartou, pripojením a prístupom.",
    sections: [
      {
        title: "Kamera, NFC alebo karta nefunguje",
        steps: [
          "Pri kamere skontrolujte povolenie prehliadača, zabezpečené pripojenie, osvetlenie a ostrosť QR.",
          "Ak kamera po návrate z pozadia alebo výpadku obrazu nebeží, použite znova Zapnúť kameru; obnoviť stránku nie je potrebné.",
          "Ak je NFC nedostupné, zariadenie alebo prehliadač ho nemusí podporovať. Použite QR alebo Nákup bez karty.",
          "Pri neplatnej karte overte so správcom, či je aktívna firma, partner aj daný QR/NFC prístup a či nejde o už nahradenú kartu.",
          "Ak administrátor nemôže znova otvoriť starú kartu, čítajte vysvetlenie: starý neobnoviteľný prístup môže vyžadovať výslovnú náhradu. Chýbajúci šifrovací kľúč naopak rieši správca servera, nie opakované vydávanie kariet.",
        ],
        result: "Pri podporovanom náhradnom postupe môžete pokračovať bez vytvárania duplicitných partnerov.",
      },
      {
        title: "Ukladanie, oprávnenia alebo spojenie",
        steps: [
          "Pri chybe formulára opravte označené polia; chybová správa vysvetľuje aj konflikty alebo chýbajúci dôvod.",
          "Pri výpadku spojenia počkajte, obnovte pripojenie a pred opakovaním zápisu skontrolujte jeho existenciu v histórii.",
          "Pri správe o zmene firmy obnovte správny firemný program a nepoužívajte starý formulár.",
          "Ak nemáte oprávnenie alebo je program pozastavený, kontaktujte administrátora alebo správcu aplikácie. Iná URL oprávnenia nerozšíri.",
          "Pri hlásení problému uveďte čas, obrazovku a bezpečný opis chyby. Neposielajte heslá, odkazy/QR kariet ani nepotrebné osobné údaje.",
        ],
        result: "Problém riešite bez duplicitných zápisov a bez sprístupnenia citlivých údajov.",
      },
    ],
    related: ["skenovanie", "bez-karty", "historia-nakupov", "heslo"],
  },
];

export function getManualArticles(role: ManualRole): readonly ManualArticle[] {
  return manualArticles.filter((article) => article.audience === "all" ||
    (article.audience === "management" && role !== "seller") ||
    (article.audience === "company-admin" && role !== "seller") ||
    (article.audience === "superadmin" && role === "superadmin"));
}

export function getManualArticle(role: ManualRole, slug: string) {
  return getManualArticles(role).find((article) => article.slug === slug);
}

export function manualChapters(role: ManualRole, base: string) {
  return getManualArticles(role).map(({ slug, title }) => ({
    href: `${base}/${slug}`, label: title,
  }));
}
