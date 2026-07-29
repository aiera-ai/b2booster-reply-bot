// Solution-module library for AIERA offer pages (habeco/dentalplan style).
// Fixed, proven copy per module - Haiku only writes the industry-specific intro
// per lead (modules[].intro), never the core copy. Slovenian, vikanje, no dashes.

const SOLUTION_MODULES = {
  outbound: {
    title: 'PRIDOBIVANJE NOVIH B2B STRANK',
    headline: 'B2Booster - sistematičen kanal novih poslovnih povpraševanj.',
    body: 'Vzpostavimo voden outbound proces, ki sistematično odpira pogovore z odločevalci v podjetjih, ki ustrezajo vašemu idealnemu profilu stranke. Pristop je preverjen na 30+ podjetjih in se v celoti prilagodi vaši ponudbi. Kvalificirano povpraševanje predamo vaši prodajni ekipi, AIERA prevzame celoten operativni del.',
    bullets: [
      { t: 'Natančno definiran ICP', d: 'Skupaj določimo panoge, velikosti podjetij in trge, kjer je vaša ponudba najmočnejša. Brez razpršenosti.' },
      { t: 'Nagovor pravih odločevalcev', d: 'Osebe, ki dejansko sprožijo nakup in upravljajo budget. Ne info naslovi, ne asistenti brez besede.' },
      { t: 'Personalizacija s kontekstom', d: 'Vsako sporočilo je vezano na konkreten povod pri prejemniku. Brez generičnih šablon.' },
      { t: 'Predaja vaši ekipi', d: 'Vaša prodaja dobi ogret pogovor in termin. AIERA vodi vse do tja - sporočila, followupe, koledar.' },
    ],
    pricing: {
      label: 'CENA B2B LEAD-GEN SISTEMA',
      lines: ['490 EUR setup', '1.200 EUR / mesec / trg'],
      note: 'Vključeno: ICP raziskava, baza odločevalcev, sporočila, izvedba outbounda, tedensko poročanje in iteracija. Brez dolgoročnih zavez, 30-dnevna odpoved. Brez DDV.',
    },
  },

  generator_ponudb: {
    title: 'AI GENERATOR PERSONALIZIRANIH PONUDB',
    headline: 'Iz povpraševanja do polno oblikovane ponudbe v minutah.',
    body: 'Prodajna ekipa danes porabi ure za sestavljanje ponudbe, ujemanje z identiteto stranke in oblikovanje dokumenta. AI generator iz kratkega internega brifa pripravi popolnoma personalizirano, profesionalno ponudbo - z vsebino, cenami in pogoji. Ekipi ostane samo potrditev in izboljšava.',
    bullets: [
      { t: 'Personalizacija na stranko', d: 'Vsaka ponudba vsebuje ime stranke, njeno identiteto in predloge, prilagojene njeni panogi in budgetu.' },
      { t: 'Konsistentna kvaliteta', d: 'Vsaka ponudba na nivoju vaše najboljše. Brez razlik med prodajniki in brez tipkarskih napak ob 22h.' },
      { t: 'Hitrost kot prednost', d: 'Ponudba pri stranki v minutah, ne dnevih. Prvi ponudnik z odgovorom je najpogosteje tudi izbrani.' },
    ],
  },

  landing_gen: {
    title: 'AI GENERATOR LANDING STRANI',
    headline: 'Lokalizirana spletna prisotnost za vsak trg in vsako kampanjo.',
    body: 'Za resen preboj na nov trg ali novo kampanjo potrebujete namenske vstopne strani - za sezono, za panogo, za vsako državo posebej. AI generator pripravi profesionalne, konverzijsko optimizirane landing strani v izbranem jeziku v urah, ne tednih. Brez čakanja na agencijo.',
    bullets: [
      { t: 'Lokalizacija na trg', d: 'Vsebina, valuta in lokalni primeri uporabe za vsako državo posebej.' },
      { t: 'Per-kampanja strani', d: 'Sezonske akcije, dogodki, posamezne panoge - vsaka kampanja dobi svojo stran.' },
      { t: 'Optimizirano za konverzijo', d: 'Vgrajeni lead obrazci, CTA-ji, social proof in trust signali.' },
    ],
  },

  marketing_content: {
    title: 'AI MARKETING - USTVARJANJE VSEBIN',
    headline: 'Avtomatizirana produkcija slik, videov, blogov in SEO vsebin.',
    body: 'Vizualna in pisna produkcija je danes ozko grlo in največji strošek marketinga. AI orodja produkcijo pospešijo za 5-10x in znižajo strošek na enoto vsebine. Vaša ekipa ohrani strateški nadzor, AI prevzame ročno produkcijo.',
    bullets: [
      { t: 'Vizualne predstavitve', d: 'Produktne slike in mockupi v sekundah, brez fotografa.' },
      { t: 'Video za social', d: 'Kratki video posnetki za LinkedIn, Instagram in TikTok - serijska produkcija.' },
      { t: 'Blogi in SEO', d: 'Optimizirani članki za organski doseg, tudi za tuje trge.' },
    ],
  },

  svetovalec: {
    title: 'AI SVETOVALEC NA SPLETNI STRANI',
    headline: 'Manj ročnega svetovanja, več kvalificiranih povpraševanj.',
    body: 'Namesto da obiskovalec brska po obsežni ponudbi, AI svetovalec v pogovornem oknu razume potrebo, predlaga najprimernejše izdelke ali storitve in pripravi strukturirano povpraševanje za vašo prodajno ekipo. Orodje, ki neposredno zvišuje konverzijo spletne strani.',
    bullets: [
      { t: 'Vodi naravni pogovor', d: 'Pridobi panogo, namen, budget, količine in rok - vse, kar prodaja potrebuje za kakovosten predlog.' },
      { t: 'Predlaga in utemelji', d: 'Iz vaše ponudbe izbere najustreznejše in razloži zakaj.' },
      { t: 'Strukturirana predaja', d: 'Povpraševanje s polnimi podatki pristane pri vaši prodaji, pripravljeno za ponudbo.' },
    ],
  },

  chatbot: {
    title: 'AI CHATBOT NA SPLETNI STRANI',
    headline: 'Vedno dostopen prvi stik, ki obiskovalca pripelje do odgovora ali povpraševanja.',
    body: 'AI chatbot v sekundah odgovori na pogosta vprašanja - roki, pogoji, cene, statusi - in obiskovalca, ki je pripravljen na nakup, brez prekinitve preusmeri v povpraševanje ali na pravo osebo v vaši prodaji. Deluje 24/7, v slovenščini in tujih jezikih.',
    bullets: [
      { t: 'Takojšnji odgovori', d: 'Pogosta vprašanja rešena takoj in dosledno, kadarkoli.' },
      { t: 'Vodi do ponudbe', d: 'Razume potrebo in predlaga konkretne izdelke, povezave in naslednje korake.' },
      { t: 'Predaja ob pravem trenutku', d: 'Ob resnem interesu odpre povpraševanje ali poveže z živim prodajalcem, s celotnim kontekstom.' },
    ],
  },

  customer_service: {
    title: 'AI CUSTOMER SERVICE ZA MAILE IN SPOROČILA',
    headline: 'AI pripravi vse odgovore, vaši zaposleni jih le potrjujejo.',
    body: 'AI prebere vsak vhodni mail in sporočilo, razume kontekst v okviru zgodovine stranke in pripravi predlog odgovora. Zaposleni ga z enim klikom potrdi ali popravi. Ko sistem dokazano deluje, za standardne tipe sporočil postopno aktivirate avtopilota.',
    bullets: [
      { t: '1. Predlogi, človek potrjuje', d: 'AI pripravi predlog za vsak mail. Vse gre skozi človeka, brez tveganja.' },
      { t: '2. Avtopilot za znane primere', d: 'Statusi, FAQ in standardne potrditve gredo avtomatsko. Ostalo še vedno potrjuje človek.' },
      { t: '3. Razširjen avtopilot z varovalkami', d: 'Nabor avtomatskih tipov postopno širimo. Občutljivo in nestandardno vedno eskalira na ekipo.' },
    ],
  },

  agenti: {
    title: 'VZPOSTAVITEV AI AGENTOV',
    headline: 'AI agenti, ki za ponovljive procese prevzamejo celoten cikel.',
    body: 'Za enostavnejša, ponovljiva naročila ali procese vzpostavimo AI agenta, ki celoten tok vodi sam: komunicira s stranko, pripravi ponudbo, sprejme potrditev in podatke strukturirano preda v vaše sisteme. Vaša ekipa se vključi samo pri kompleksnejših primerih ali izjemah.',
    bullets: [
      { t: 'Pogovor in ponudba', d: 'Agent prevzame povpraševanje, razjasni podrobnosti in samodejno pripravi ponudbo.' },
      { t: 'Potrditev in predaja', d: 'Sprejme potrditev, uredi dokumentacijo in naročilo vnese v vaš ERP ali CRM.' },
      { t: 'Pametne varovalke', d: 'Vsak dvom ali odstopanje eskalira na vašo ekipo. Skupaj definiramo, kaj agent sme prevzeti v celoti.' },
    ],
  },
};

const MODULE_IDS = Object.keys(SOLUTION_MODULES);

module.exports = { SOLUTION_MODULES, MODULE_IDS };
