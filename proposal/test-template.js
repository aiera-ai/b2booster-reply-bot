// Template-only test (no Claude API): validates HTML renders correctly with mock content.
// Run: node proposal/test-template.js
// Output: proposal/test-output/*.html

const fs = require('fs');
const path = require('path');
const { getPersona } = require('./personas');
const { renderPage } = require('./template');

// ─── MOCK CONTENT 1: KRKA / Head of IT (teal) ────────────────────────────────

const KRKA_CONTENT = {
  metaTitle: 'KRKA d.d. - AI predlog · AIERA',
  metaDescription: 'Personaliziran AI predlog za KRKA d.d. - varni asistenti, interni dashboardi in operativni sistemi za farmacevtsko industrijo.',

  heroTitleTop: 'AI sloj nad regulativo, dokumenti in procesi',
  heroTitleBottom: 'KRKA d.d.',
  heroLead: 'Varni AI asistenti za pripravo regulatorne dokumentacije, iskanje po internih bazah znanja in podporo R&D ekipam. Manj iskanja, manj administracije, jasnejši pregled za vodstvo.',
  heroTrust: ['Pilot v 3 tednih', 'Ekipa v SLO', 'NDA na voljo'],

  widgetTag: 'pilot',
  widgetTitle: 'KRKA znanje',
  widgetStats: [
    { label: 'DOKUMENTI', value: '4.2k', delta: '+128' },
    { label: 'POIZVEDBE', value: '317', delta: '+42' },
    { label: 'ZADETKI', value: '94%', delta: '+6' },
  ],
  widgetActivityLabel: 'AKTIVNOST (30D)',
  widgetActivityDelta: '24%',
  widgetChatPrompt: 'Kateri SOP velja za sproščanje serij za EU trg po novem CTR-u?',
  widgetChatAnswer: 'Trenutno veljaven **SOP-QA-114 v3.2**. Spremembe od v3.1: 4 koraki dodani, ena točka odstranjena. Glej **§4.1**.',
  widgetSources: ['QA SOP', 'CTR baza', 'Interna pravila'],
  widgetPillTopLabel: 'MATCH NAJDEN',
  widgetPillTopValue: 'SOP-QA-114 v3.2 (najnovejši)',
  widgetPillBottomLabel: 'AUDIT LOG',
  widgetPillBottomValue: '+42 poizvedb danes',

  kontekstEyebrow: 'Kontekst',
  kontekstTitle: 'Veliko znanja, veliko dokumentov, vendar pogosto razpršenih po sistemih in mapah.',
  kontekstLead: 'V KRKA d.d. pokrivate vse od R&D do regulatornih zadev in proizvodnje. Pri takšnem obsegu se informacije znajdejo v različnih dokumentih, internih sistemih, e-pošti in mapah. AI lahko poveže obstoječe vire v en uporaben sloj.',
  kontekstCards: [
    { icon: '◎', title: 'Hitrejše iskanje SOP', body: 'Zaposleni najde pravi SOP v sekundah, ne v 15 minutah.' },
    { icon: '⊙', title: 'Manj ročne priprave', body: 'AI naredi prvi osnutek poročila iz internih virov.' },
    { icon: '✦', title: 'Boljši pregled za QA', body: 'Vsako poizvedbo in odgovor sistem zabeleži za audit.' },
    { icon: '⌬', title: 'Enotna podpora ekip', body: 'R&D, QA in regulatorna ekipa pridejo do istih podatkov.' },
  ],

  aiStackTools: ['Claude', 'OpenAI', 'Gemini', 'n8n', 'Lovable', 'Open Claw'],

  resitveEyebrow: 'Možne rešitve',
  resitveTitle: 'Kaj bi lahko razvili za KRKA d.d.',
  resitveLead: '',
  resitveModules: [
    { icon: '📘', title: 'Interni AI asistent za SOP in CTR', body: 'Asistent, ki odgovarja na vprašanja iz internih SOP-ov, CTR baz, regulatornih dokumentov in pravilnikov. Zaposleni hitro najde pravi člen ali postopek.', example: '"Kateri SOP velja za sproščanje serije za nemški trg po junijski spremembi?"' },
    { icon: '🌐', title: 'AI vodič za partnerje na portalu', body: 'Digitalni svetovalec na partnerskem portalu. Razume profil partnerja in predlaga relevantne dokumente, kontakte in postopke.', example: '"Pripravljam vlogo za novi izvozni trg, kaj rabim?"' },
    { icon: '📊', title: 'R&D dashboard z AI pregledom', body: 'Prilagojen sistem, kjer so projekti, faze, dokumenti, roki in KPI na enem mestu. AI dnevno povzame, kaj se je premaknilo.', example: 'Vodstvo vidi, kje je vsak projekt v fazi razvoja, brez ad-hoc poročil.' },
    { icon: '📑', title: 'AI podpora pri pripravi regulatorne dokumentacije', body: 'Pomoč pri pripravi vlog, dokumentacije za sprostitev serij in povzetkov. AI naredi osnutek, ekipa potrdi.', example: '"Pripravi osnutek povzetka klinične študije po EMA predlogi."' },
    { icon: '🎯', title: 'AI matchmaking med trgi in izdelki', body: 'Sistem oceni, kateri trgi so prioritetni za nov izdelek na podlagi regulatornih, tržnih in distribucijskih podatkov.', example: 'Vodstvo dobi rang trgov z razlago, zakaj posamezen trg.' },
    { icon: '📈', title: 'AI management pregled', body: 'Tedenski povzetek aktivnosti, anomalij in priložnosti za vodstvo. Vse na podlagi obstoječih virov, ne novih baz.', example: 'Vsak ponedeljek 7:00 v inbox, prebran v 4 minutah.' },
  ],

  arhitekturaTitle: 'Ne gre za eno samo orodje. Gre za varen AI sloj nad obstoječimi procesi.',
  arhitekturaLead: 'AIERA rešitve razvija modularno - vsak modul lahko deluje samostojno ali skupaj z drugimi.',
  arhitekturaParagraphs: [
    'Pristop je preprost: ne nadomeščamo vaših obstoječih sistemov. SAP, vaše interne baze, dokumentni sistemi - vse to ostane na svojem mestu.',
    'Nad temi viri postavimo varen sloj, ki AI omogoča dostop do potrebnih informacij ob upoštevanju vaših pravil dostopa. Vsak modul je ločen in ga lahko vklopite ali izklopite brez vpliva na ostale.',
    'Tehnologijo izbiramo glede na zahteve - tam, kjer potrebujete on-prem za občutljive podatke, lahko gostujemo lokalno. Cloud, kjer to ima smisel.',
  ],
  arhitekturaLayers: [
    { icon: '5', label: 'UPORABNIKI', value: 'R&D · QA · regulatorni odd. · vodstvo', brand: false },
    { icon: '4', label: 'VMESNIK', value: 'Spletni portal · Slack · Teams', brand: false },
    { icon: '3', label: 'AI SLOJ', value: 'Claude · interni RAG · pravila dostopa', brand: true },
    { icon: '2', label: 'INTEGRACIJE', value: 'SAP · SharePoint · CTR baze · DMS', brand: false },
    { icon: '1', label: 'OBSTOJEČI SISTEMI', value: 'Ne dotikamo se jih', brand: false },
  ],

  pilotTitle: 'Predlagan prvi pilot: interni AI asistent za SOP in interna pravila',
  pilotLead: 'Kot prvi korak razvijemo omejen pilotni sistem, ki zajame izbrano področje - na primer SOP iz QA oddelka in interne pravilnike. V pilot vključimo omejen nabor dokumentov in pogostih vprašanj, nato pa ga testira manjša interna ekipa.',
  pilotCilj: [
    'Preveriti, kje AI dejansko skrajša delo',
    'Ugotoviti, katere informacije zaposleni najpogosteje iščejo',
    'Zmanjšati ponavljajoča vprašanja in ročno iskanje',
    'Postaviti osnovo za širši interni sistem',
    'Preveriti varnostne, uporabniške in tehnične zahteve',
  ],
  pilotFaze: [
    'Faza 1: Pregled procesov in izbor primera uporabe (5 dni)',
    'Faza 2: Zbiranje dokumentov, pravil in podatkovnih virov (5 dni)',
    'Faza 3: Izdelava delujočega prototipa (5 dni)',
    'Faza 4: Testiranje z interno ekipo (4 dni)',
    'Faza 5: Optimizacija in odločitev o širjenju',
  ],

  spotlightTitle: 'Zasnovano z mislijo na IT, varnost in dolgoročno vzdrževanje',
  spotlightBody: 'Cilj ni uvajati nepreglednega AI orodja, ampak postaviti sistem, ki bo IT lahko vzdrževal, dokumentiral in revidiral. Vse, kar AI naredi, mora biti razumljivo in dosledno - tako za uporabnika kot za audit.',
  spotlightBullets: [
    'Vsi AI odgovori so sledljivi do izvornega dokumenta',
    'Dostopne pravice se preslikajo iz obstoječih sistemov',
    'Audit log vsake poizvedbe je na voljo IT in QA ekipi',
    'Brez vendor lock-in - koda in podatki ostanejo vaši',
    'Modularna zasnova omogoča postopno uvajanje brez večjih posegov',
  ],

  benefitsTitle: 'Manj iskanja, manj administracije, več pregleda',
  benefitsLeft: {
    label: 'ZA ZAPOSLENE',
    title: 'Hitrejši dostop do pravih informacij',
    items: [
      'Pravi SOP v sekundah, ne v 15 minutah',
      'Manj e-mail vprašanj med oddelki',
      'AI naredi prvi osnutek, ekipa pregleda',
      'Vsi pridejo do istih informacij',
    ],
  },
  benefitsRight: {
    label: 'ZA VODSTVO',
    title: 'Jasnejši pregled brez ad-hoc poročil',
    items: [
      'Tedenski povzetek aktivnosti samodejno',
      'Anomalije in priložnosti označene takoj',
      'Audit log za skladnost na voljo na klik',
      'Vidnost statusa projektov v realnem času',
    ],
  },

  varnostKratkoTitle: 'AI naj pomaga, ne odloča namesto ljudi',
  varnostKratkoLead: 'Pri farmacevtski industriji je ključno, da AI ne sprejema samostojnih odločitev o sproščanju serij, regulatornih vprašanjih ali pacientih. Njegova vloga je pomoč pri iskanju informacij, pripravi osnutkov in opozarjanju na manjkajoče podatke. Končna presoja ostane pri strokovnih ekipah.',
  varnostKratkoItems: [
    'AI odgovori morajo biti vezani na preverjene vire',
    'Sistem prikazuje reference na izvorne dokumente',
    'Dostop se omeji glede na uporabniške pravice',
    'Občutljivi podatki se obravnavajo ločeno in skladno z internimi pravili',
    'Vsak kritičen proces ima človeško potrditev',
    'Logi uporabe in revizijska sled za QA in IT audit',
  ],

  varnostPodatkiTitle: 'Razvoj poteka hitro, končna rešitev pa živi tam, kjer ustreza vašemu IT.',
  varnostPodatkiParagraphs: [
    'Pilot razvijemo v cloud okolju z anonimiziranimi ali demo podatki. To omogoča hitro iteracijo brez tveganja za občutljivo dokumentacijo.',
    'Ko sistem deluje in se odločite za širšo uporabo, ga lahko preselimo na vašo infrastrukturo - lastni servers, Azure tenant, AWS VPC ali on-prem GPU. To pomeni, da KRKA podatki nikoli ne zapustijo nadzorovanega okolja.',
    'Vsi modeli AI, ki jih uporabljamo, podpirajo enterprise SLA in EU obdelavo podatkov. Lahko jih sami nadomestite z drugimi modeli, če to zahtevajo vaše pravice ali pravila.',
    'Koda in konfiguracija ostaneta vaši. Nismo vmesnik med vami in vašimi podatki - smo partner, ki sistem postavi in po potrebi preda v vaše vzdrževanje.',
  ],

  pristopLabel: 'AIERA pristop',
  pristopTitle: 'Razvijamo AI sisteme po dejanskih procesih organizacije, ne po katalogu funkcij.',
  pristopParagraphs: [
    'AIERA ni ponudnik generičnega AI orodja. Naš pristop je, da prvi teden preživimo z vašo ekipo - razumemo, kje gre čas, kateri procesi imajo največ ročnega dela in kaj bi resnično spremenilo dan vašim zaposlenim.',
    'Šele potem pišemo prvo vrstico kode. Tako pilot ne pristane v predalu - reši konkreten problem, ki ga ekipa že prepozna.',
  ],
  pristopFacts: [
    { value: '3 tedne', label: 'PILOT' },
    { value: '0 lock-in', label: 'VAŠ KOD' },
    { value: '100% EU', label: 'OBDELAVA' },
    { value: '40+', label: 'PROJEKTI' },
  ],

  faqTitle: 'Pogosta vprašanja',
  faqItems: [
    { q: 'Kako se zagotovi varnost podatkov in skladnost z GDPR?', a: 'Vsi občutljivi podatki ostanejo v nadzorovanem okolju. Pilot razvijemo na anonimiziranih podatkih, produkcijski sistem teče na vaši infrastrukturi ali EU cloud okolju s podpisanim DPA. Audit log je na voljo vsem ravnem.' },
    { q: 'Kaj se zgodi z našimi obstoječimi sistemi (SAP, DMS)?', a: 'Ostanejo na svojem mestu. AI sloj se poveže prek API-jev ali read-only dostopa. Ne zamenjujemo SAP ali Sharepoint - postavimo orodje, ki ti viri postanejo uporabni za zaposlene brez 5 različnih iskalnikov.' },
    { q: 'Kako dolgo traja postavitev pilota?', a: 'Pilot tipično traja 3 tedne od podpisa NDA. Prvi teden je pregled procesov, drugi razvoj, tretji testiranje z manjšo interno skupino. Po pilotu se odločite, ali širimo, prilagodimo ali zaustavimo.' },
    { q: 'Ali smo vezani na specifičen AI model ali ponudnika?', a: 'Ne. Sistem je zasnovan modularno - če želite zamenjati Claude za OpenAI, GPT za interni model ali preiti na lokalni LLM, je to konfiguracijska sprememba, ne preoblikovanje. Koda ostane vaša.' },
    { q: 'Kdo vzdržuje sistem po lansiranju?', a: 'Lahko mi (mesečna naročnina), lahko vaša IT ekipa, lahko kombinacija. Predamo polno dokumentacijo, deployment skripte in onboarding. Cilj je, da niste odvisni od nas, če to ni vaša izbira.' },
    { q: 'Kaj če pilot ne pokaže pričakovanih rezultatov?', a: 'Zaustavimo. Pilot je zasnovan tako, da je vsak teden jasno, ali smer deluje. Če po treh tednih ni jasnega vpliva, je bolje priznati in poskusiti drugje, kot pa razvijati v slepi ulici.' },
  ],

  ctaFinalTitle: 'Predlog: 15-minutni pregled možnosti za KRKA d.d.',
  ctaFinalBody: 'V 15 minutah lahko skupaj pogledava, kateri od opisanih modulov bi imel največ smisla za vašo ekipo, in kako bi konkreten pilot izgledal. Brez zavez, brez priprave - samo pregled.',
};

// ─── MOCK CONTENT 2: PETROL / Head of Sales (forest green) ───────────────────

const PETROL_CONTENT = {
  metaTitle: 'PETROL d.d. - AI predlog · AIERA',
  metaDescription: 'Personaliziran AI predlog za prodajni motor PETROL B2B segmenta. Manj ročne priprave, več pravih sestankov.',

  heroTitleTop: 'AI sales motor nad CRM-om za',
  heroTitleBottom: 'PETROL B2B',
  heroLead: '200+ B2B kupcev, omejena ekipa, pogosto izgubljen čas za up-sell signale, ki jih CRM ne pokaže. AI sistem dnevno opozarja, kateri kupec ima največjo verjetnost za rast in zakaj.',
  heroTrust: ['Pilot v 3 tednih', 'Native CRM integracija', 'EU obdelava'],

  widgetTag: 'pilot',
  widgetTitle: 'PETROL B2B pipeline',
  widgetStats: [
    { label: 'KUPCI', value: '247', delta: '+12' },
    { label: 'SIGNALI', value: '38', delta: '+9' },
    { label: 'HOT %', value: '14%', delta: '+3' },
  ],
  widgetActivityLabel: 'PRILOŽNOSTI (30D)',
  widgetActivityDelta: '31%',
  widgetChatPrompt: 'Kateri kupci so imeli največji rast porabe in zakaj?',
  widgetChatAnswer: 'Top 3: **Pošta Slovenije** (+24% YoY, nova flota), **DARS** (+18%, novi odsek), **Mercator** (+11%, dodana 4 lokacije).',
  widgetSources: ['CRM', 'ERP', 'Pogodbe', 'Volume'],
  widgetPillTopLabel: 'PRILOŽNOST',
  widgetPillTopValue: '12 kupcev pripravljenih za up-sell',
  widgetPillBottomLabel: 'AUTO BRIEF',
  widgetPillBottomValue: '+8 pripravljenih danes',

  kontekstEyebrow: 'Kontekst',
  kontekstTitle: 'CRM hrani podatke. Ne pa odgovorov, ki jih prodajna ekipa potrebuje pred sestankom.',
  kontekstLead: 'V PETROL B2B vsak sales manager pokriva desetine kupcev. Priprava na sestanek pomeni iskanje po CRM-u, e-pošti, pogodbah in volumnih. Mnogokrat se priložnost zazna prepozno - šele ko kupec sam pove, kaj rabi.',
  kontekstCards: [
    { icon: '◎', title: 'Manj ročne priprave', body: 'Brief za sestanek pripravljen v 30 sekundah, ne v 30 minutah.' },
    { icon: '⊙', title: 'Prej zaznana priložnost', body: 'AI vsak teden označi kupce s spremenjenim vzorcem nabave.' },
    { icon: '✦', title: 'Doslednejši outreach', body: 'Vsi sales managerji uporabljajo isti, kvaliteten standard.' },
    { icon: '⌬', title: 'Manj izgubljenih kupcev', body: 'Sistem opozori, ko aktivnost kupca pade pod normalo.' },
  ],

  resitveEyebrow: 'Možne rešitve',
  resitveTitle: 'Kaj bi lahko razvili za PETROL B2B',
  resitveModules: [
    { icon: '📊', title: 'AI account brief generator', body: 'Pred vsakim sestankom AI pripravi povzetek kupca: zgodovina, trenutni status, anomalije, predlog teme za pogovor. Sales manager dobi vse na eni strani.', example: '"Mercator ima trend +11% volumna, dve novi lokaciji, kontrola pogodbe v 60 dneh."' },
    { icon: '🎯', title: 'AI signal radar za up-sell', body: 'Dnevni pregled vseh B2B kupcev. Sistem prepozna spremembe v vzorcu in označi tiste, kjer je verjetnost rasti največja.', example: '"Pošta Slovenije: +24% YoY, nova flota nizko porabnih vozil. Priložnost za EV charging."' },
    { icon: '📑', title: 'AI priprava ponudb in pogodb', body: 'Iz brief-a kupca AI naredi osnutek ponudbe ali pogodbenega aneksa po vaši predlogi. Sales manager popravi in pošlje.', example: 'Nova ponudba s konkretnimi pogoji za novega kupca v 5 minutah.' },
    { icon: '📈', title: 'Sales pipeline dashboard', body: 'Pregled celotnega B2B pipeline-a - vsi sales managerji, vsi kupci, vse stage-e. Vodstvo vidi, kje so blokade brez tedenskih sestankov.', example: 'Vodja prodaje vidi 12 zastalih dealov in razlog za vsakega.' },
    { icon: '🌐', title: 'AI churn early-warning', body: 'Sistem prepozna kupce, katerih aktivnost upada in označi tveganje. Account manager dobi opozorilo, dokler je še čas reagirati.', example: '"Hofer aktivnost -22% v zadnjih 90 dneh. Vredno preveriti."' },
    { icon: '◎', title: 'Personalizirana outbound sporočila', body: 'AI piše hot lead outreach po naslovniku - ne masovne kampanje, ampak tip "kot da bi sales manager pisal sam".', example: '"Brian, zadnji dve leti ste rasli predvsem v Hrvaški. Kaj če bi pogledali..."' },
  ],

  pilotTitle: 'Predlagan prvi pilot: AI brief generator za top 20 B2B kupcev',
  pilotLead: 'Začnemo z eno funkcijo - pripravo brief-a pred sestankom. Zajamemo 20 ključnih kupcev, povežemo z CRM-om in volumetri, testiramo z dvema sales managerjema. V treh tednih veste, ali to dejansko skrajša pripravo.',
  pilotCilj: [
    'Preveriti, ali AI brief zares skrajša pripravo',
    'Ugotoviti, katere informacije so kritične v brief-u',
    'Postaviti osnovo za širšo uporabo na vseh B2B kupcih',
    'Validirati integracijo s trenutnim CRM-om',
    'Pridobiti feedback od sales managerjev v praksi',
  ],
  pilotFaze: [
    'Faza 1: Pregled procesa priprave in trenutnih virov (4 dni)',
    'Faza 2: Integracija s CRM in pripravo prvih brief-ov (6 dni)',
    'Faza 3: Testiranje z 2 sales managerja, 20 kupci (7 dni)',
    'Faza 4: Optimizacija na podlagi feedbacka (3 dni)',
    'Faza 5: Odločitev o širjenju in plan razvoja',
  ],

  spotlightTitle: 'Več pravih sestankov, manj ročne priprave',
  spotlightBody: 'Sales manager v PETROL B2B porabi po naših pogovorih približno 30-45 minut za pripravo na sestanek. AI to skrajša na 5 minut in v isti potezi opozori na priložnosti, ki bi sicer ostale prezrte. Manj rutinskega dela, več časa za pogovor s pravimi kupci.',
  spotlightBullets: [
    'Brief za sestanek pripravljen avtomatsko vsak dan',
    'Up-sell priložnosti označene v CRM-u brez ročnega filtriranja',
    'Konsistenten standard za vse sales managerje',
    'Vodja prodaje vidi celoten pipeline brez tedenskih ankart',
    'Sistem se uči iz povratnih informacij ekipe',
  ],

  benefitsTitle: 'Hitrejša priprava, doslednejši outreach, manj izgubljenih priložnosti',
  benefitsLeft: {
    label: 'ZA SALES EKIPO',
    title: 'Manj klikanja, več prodaje',
    items: [
      'Pripravljen brief za vsak sestanek',
      'Avtomatski opomniki za follow-up',
      'AI predlaga naslednje korake za stagnirajoče kupce',
      'Lažje delo s 50+ kupci na osebo',
    ],
  },
  benefitsRight: {
    label: 'ZA VODSTVO',
    title: 'Jasen pregled pipeline-a v realnem času',
    items: [
      'Vsi deali, stage-i in lastniki na enem mestu',
      'Avtomatski mesečni board update',
      'Forecast s podporo AI namesto z gut feelinga',
      'Hitro zaznane blokade in churn signali',
    ],
  },

  pristopLabel: 'AIERA pristop',
  pristopTitle: 'Razvijemo sistem na temelju vaših procesov, ne generičnega CRM template-a.',
  pristopParagraphs: [
    'Vsak B2B sales tim deluje drugače. V PETROL imate svoje stage-e, lastne sales rituale in specifične kupce. AI sistem prilagodimo tem realnostim, ne obratno.',
    'Prvi teden preživimo s sales ekipo. Razumemo, kdo dela kaj, kako pripravlja brief, kdaj izgublja čas. Šele potem določimo, kateri modul ima najhitrejši pozitivni vpliv.',
  ],
  pristopFacts: [
    { value: '3 tedne', label: 'PILOT' },
    { value: '5 min', label: 'BRIEF' },
    { value: '20+', label: 'KUPCEV V PILOTU' },
    { value: '100% EU', label: 'OBDELAVA' },
  ],

  faqTitle: 'Pogosta vprašanja',
  faqItems: [
    { q: 'Kako se AI poveže z našim obstoječim CRM-om?', a: 'Prek read-only API ali sync mehanizma. AI ne piše v CRM brez vaše potrditve. Vsi briefi in opozorila se shranijo v sloj nad CRM-om, ne posegamo v vaše osnovne podatke.' },
    { q: 'Ali bo sistem zamenjal naše sales managerje?', a: 'Ne. AI prevzame rutinsko pripravo in opozorila, sestanke pa še vedno vodi človek. Cilj je dati sales managerju več časa za pogovor in manj za Excel.' },
    { q: 'Kako se preveri kvaliteta AI predlogov?', a: 'V pilotu imamo dva sales managerja, ki vsak teden pregledata brief-e in označita, kaj je uporabno in kaj ne. Sistem se uči iz tega feedbacka v naslednjih tednih.' },
    { q: 'Kaj če ima sales manager občutek, da AI namesto njega odloča?', a: 'Sistem nikoli ne pošlje ničesar samodejno. Vsa sporočila, ponudbe in opozorila gredo skozi pregled sales managerja. AI je orodje za pripravo, ne za izvedbo.' },
    { q: 'Kakšne so cene in zaveza?', a: 'Pilot je fiksne cene, plačan ob koncu (3 tedne). Po pilotu mesečna naročnina, brez minimalne dobe vezave. Če sistem ne deluje za vašo ekipo, ga izklopite.' },
    { q: 'Koliko časa traja, da ekipa dejansko uporablja sistem?', a: 'Onboarding traja 2-3 dni. Sistem je preprost - če sales manager zna uporabljati CRM, zna uporabljati ta sloj. Prvi pravi rezultati v 2-3 tednih.' },
  ],

  ctaFinalTitle: 'Predlog: 15-minutni pregled možnosti za PETROL B2B',
  ctaFinalBody: 'V 15 minutah lahko pogledava konkreten primer brief-a za enega od vaših kupcev (na podlagi javnih podatkov) in se pogovoriva, kateri modul bi imel največji vpliv na vašo ekipo. Brez zavez.',
};

// ─── MOCK CONTENT 3: NLB / CFO (navy) ────────────────────────────────────────

const NLB_CONTENT = {
  metaTitle: 'NLB d.d. - AI predlog · AIERA',
  metaDescription: 'Personaliziran AI predlog za hitrejše finančno poročanje in pregled stroškov v NLB. Manj ročnega dela, brez kompromisov pri tveganju.',

  heroTitleTop: 'AI sloj nad ERP in finančnimi viri za',
  heroTitleBottom: 'NLB d.d.',
  heroLead: 'Hitrejša priprava poročil, jasnejši pregled stroškov in anomalij ter manj ročnega usklajevanja podatkov med oddelki. Človek še vedno potrjuje vsak zaključek - AI samo pripravi prvi osnutek.',
  heroTrust: ['Pilot v 4 tednih', 'On-prem ali EU cloud', 'Polni audit log'],

  widgetTag: 'pilot',
  widgetTitle: 'NLB finance pregled',
  widgetStats: [
    { label: 'TRANSAKCIJE', value: '1.8M', delta: '+12k' },
    { label: 'ANOMALIJE', value: '23', delta: '-4' },
    { label: 'POROČIL', value: '14', delta: '+2' },
  ],
  widgetActivityLabel: 'OBDELAVA (30D)',
  widgetActivityDelta: '38%',
  widgetChatPrompt: 'Pripravi povzetek odstopanj v stroških za maj proti aprilu.',
  widgetChatAnswer: 'Stroški + **2.4%** vs april. Glavna razlika: **IT licence (+18%)** in **marketing (+9%)**. Preostalo skladno z napovedjo.',
  widgetSources: ['ERP', 'GL', 'Pogodbe', 'BI'],
  widgetPillTopLabel: 'ODSTOPANJE',
  widgetPillTopValue: 'IT licence +18% proti planu',
  widgetPillBottomLabel: 'AUDIT LOG',
  widgetPillBottomValue: 'Vse poizvedbe sledljive',

  kontekstEyebrow: 'Kontekst',
  kontekstTitle: 'Pregled stroškov in priprava poročil terja čas, ki bi ga ekipa lahko porabila za analizo, ne za zbiranje podatkov.',
  kontekstLead: 'V NLB CFO funkcija pokriva širok obseg - od mesečnega zaključka do strateških analiz. Pri tej širini se večina časa porabi za usklajevanje podatkov med oddelki, ne za interpretacijo. AI lahko prevzame to rutinsko delo brez povečanja tveganja, ker človek še vedno potrjuje vsak zaključek.',
  kontekstCards: [
    { icon: '◎', title: 'Hitrejša priprava poročil', body: 'Mesečni povzetek za upravo v urah, ne dneh.' },
    { icon: '⊙', title: 'Prej zaznane anomalije', body: 'Sistem dnevno preveri odstopanja od plana.' },
    { icon: '✦', title: 'Manj ad-hoc analiz', body: 'Pogosta vprašanja vodstva imajo standardne odgovore.' },
    { icon: '⌬', title: 'Sledljivost vsake številke', body: 'Vsaka številka v poročilu vodi do izvornega podatka.' },
  ],

  resitveEyebrow: 'Možne rešitve',
  resitveTitle: 'Kaj bi lahko razvili za NLB CFO funkcijo',
  resitveModules: [
    { icon: '📑', title: 'AI generator mesečnih poročil', body: 'Sistem zbere podatke iz ERP, GL in BI virov ter pripravi osnutek mesečnega CFO poročila po vaši predlogi. Ekipa pregleda, popravi in potrdi.', example: '"Pripravi povzetek aprila s primerjavo proti planu in komentarjem za upravo."' },
    { icon: '🎯', title: 'AI anomalija radar', body: 'Dnevni pregled transakcij in stroškov. Sistem označi odstopanja in razloži zakaj - z referenco do izvornih podatkov.', example: '"IT licence +18% proti planu - povečanje izhaja iz dveh novih pogodb v aprilu."' },
    { icon: '📊', title: 'CFO dashboard z AI komentarjem', body: 'Realtime pregled ključnih kazalnikov. Vsak grafikon ima AI komentar, ki pojasni trende in opozori na tveganja.', example: 'Vodstvo vidi P&L sliko in razlago v enem pogledu, brez čakanja na analitika.' },
    { icon: '📘', title: 'AI asistent za finančna pravila', body: 'Asistent, ki odgovarja na vprašanja iz interne metodologije, SOP, računovodskih pravil in regulatornih dokumentov. Sledljiv do izvora.', example: '"Kako se kapitalizira novo prevzeti hardware po MSRP 16?"' },
    { icon: '📈', title: 'AI forecasting podpora', body: 'Sistem predlaga forecast scenarije na podlagi zgodovinskih podatkov in znanih spremenljivk. Človek izbere in potrdi.', example: '"Pripravi 3 scenarije za H2 stroškov na podlagi trendov in pogodb."' },
    { icon: '🌐', title: 'AI priprava ad-hoc analiz', body: 'Vodstvene zahteve tipa "kako je z marketingom letos" dobijo standardiziran odgovor s podatki in komentarjem, brez ročnega iskanja.', example: 'Vprašanje od CEO dobi strukturiran odgovor v 5 minutah.' },
  ],

  arhitekturaTitle: 'Brez posegov v jedrne finančne sisteme. AI sloj samo bere, človek še vedno odloča.',
  arhitekturaLead: 'Vsi obstoječi finančni sistemi ostanejo nedotaknjeni. AI se poveže izključno z read-only dostopom in vrne strukturirane odgovore za človeško presojo.',
  arhitekturaParagraphs: [
    'AI sloj nikoli ne piše v ERP ali GL. Pogled ima omejen na branje, vse spremembe gredo še vedno skozi obstoječe procese in odobritve.',
    'Sistem se gostuje na vaši infrastrukturi - lastni servers, Azure tenant ali EU cloud z DPA. Podatki ne zapuščajo nadzorovanega okolja.',
    'Vsak AI odgovor je sledljiv do izvora. Audit log vsake poizvedbe je na voljo regulatornim ekipam in IT auditorjem.',
  ],
  arhitekturaLayers: [
    { icon: '5', label: 'UPORABNIKI', value: 'CFO ekipa · uprava · audit', brand: false },
    { icon: '4', label: 'VMESNIK', value: 'CFO portal · Teams · poročila', brand: false },
    { icon: '3', label: 'AI SLOJ', value: 'Claude · interni RAG · pravila', brand: true },
    { icon: '2', label: 'INTEGRACIJE', value: 'ERP · GL · BI · DMS (READ-ONLY)', brand: false },
    { icon: '1', label: 'JEDRNI SISTEMI', value: 'Brez sprememb', brand: false },
  ],

  pilotTitle: 'Predlagan prvi pilot: AI generator mesečnega CFO poročila',
  pilotLead: 'Zajamemo eno konkretno poročilo (npr. mesečni povzetek za upravo) in z AI naredimo proces priprave 5-10x hitrejši. Vsa logika in predloge ostanejo vaše. Po pilotu se odločite, kateri naslednji proces dodamo.',
  pilotCilj: [
    'Skrajšati pripravo mesečnega poročila iz dni v ure',
    'Ohraniti polno sledljivost vsake številke',
    'Potrditi varnostni in audit standard',
    'Pridobiti feedback ekipe za nadaljnje module',
    'Postaviti osnovo za širši AI sloj nad finančnimi viri',
  ],
  pilotFaze: [
    'Faza 1: Pregled procesa in dokumentacija (5 dni)',
    'Faza 2: Read-only integracije z ERP/GL/BI (7 dni)',
    'Faza 3: Razvoj generatorja poročila in audit log-a (7 dni)',
    'Faza 4: Testiranje s CFO ekipo - en mesečni cikel (5 dni)',
    'Faza 5: Pregled rezultatov in odločitev o naslednjem modulu',
  ],

  spotlightTitle: 'Merljiv prihranek časa brez kompromisov pri tveganju',
  spotlightBody: 'AI ne sprejema finančnih odločitev. Pripravi prvi osnutek, ekipa pregleda, CFO potrdi. Tveganje ostane na isti ravni kot danes - razlika je samo v času, ki ga ekipa porabi za pripravo. Vsa logika je transparentna in sledljiva.',
  spotlightBullets: [
    'Vsa poročila pregleda človek pred objavo',
    'AI navaja vir za vsako številko in zaključek',
    'Audit log je polno dostopen regulatornim ekipam',
    'Sistem teče na vaši infrastrukturi - on-prem ali EU cloud',
    'Pilot omejen na eno poročilo - tveganje nizko, vpliv vidljiv',
  ],

  varnostKratkoTitle: 'AI naj pomaga, ne odloča namesto ljudi',
  varnostKratkoLead: 'Pri bančništvu je ključno, da AI ne sprejema samostojnih odločitev o tveganju, kreditnih politikah ali regulatornih zadevah. Njegova vloga je pomoč pri pripravi, ne pri presoji. Vsak proces ima človeško potrditev.',
  varnostKratkoItems: [
    'Vsi AI odgovori imajo navedene vire',
    'Read-only dostop do jedrnih sistemov',
    'Pravice se preslikajo iz obstoječih sistemov',
    'Polni audit log vseh poizvedb in odgovorov',
    'Vsak kritičen proces zahteva človeško potrditev',
    'On-prem ali EU cloud z DPA - brez izstopa podatkov',
  ],

  pristopLabel: 'AIERA pristop',
  pristopTitle: 'Razvijamo finančne AI module na podlagi vaših SOP, ne katalogu generičnih funkcij.',
  pristopParagraphs: [
    'AIERA ni ponudnik plug-and-play AI orodja za finance. Prvi teden preživimo s CFO ekipo - razumemo, kje porabljate čas, katera poročila se pripravljajo z največ ročnega dela, kateri ad-hoc requesti se pogosto ponavljajo.',
    'Šele potem določimo, kateri modul ima največji vpliv. Cilj je, da pilot reši konkreten problem - ne pa, da demonstrira splošno zmogljivost AI.',
  ],
  pristopFacts: [
    { value: '4 tedne', label: 'PILOT' },
    { value: '0 lock-in', label: 'KOD JE VAŠ' },
    { value: '100% EU', label: 'OBDELAVA' },
    { value: 'Polni audit', label: 'SLEDLJIVOST' },
  ],

  faqTitle: 'Pogosta vprašanja',
  faqItems: [
    { q: 'Kako je z varnostjo občutljivih finančnih podatkov?', a: 'Sistem teče na vaši infrastrukturi - on-prem servers, vaš Azure tenant ali EU cloud okolje z DPA. Podatki nikoli ne zapustijo nadzorovanega okolja. Modele lahko poganjate tudi lokalno, brez prenosa.' },
    { q: 'Kako se preprečijo AI napake v finančnih zaključkih?', a: 'AI vedno navaja vir za vsako številko in zaključek. Človek pregleda in potrdi pred objavo. Sistem ni odločevalec - je pomočnik pri pripravi. Tveganje napake je enako kot danes, ko poročilo pripravi analitik in CFO potrdi.' },
    { q: 'Ali izpolnjuje zahteve EBA in regulatorne smernice?', a: 'AI sloj ne posega v regulatorno občutljive procese, samo bere podatke in pripravi gradiva za človeško presojo. Audit log je popoln, vsak korak sledljiv. Regulatorne ekipe vidijo, kdo je vprašal kaj, kdaj in kateri vir je bil uporabljen.' },
    { q: 'Kakšen je ROI pilota?', a: 'V pilotu izmerimo dejansko skrajšanje časa za eno konkretno poročilo. Pri sedanjih internih ocenah CFO ekipe je realno skrajšanje 60-80% pri rutinski pripravi. Po pilotu odločite, ali smer širite.' },
    { q: 'Kaj če imamo strožje notranje pravice in pravila?', a: 'Sistem se prilagodi vašim pravicam in pravilom. Dostop, role, podatki, ki gredo skozi AI - vse je konfigurirljivo. Brez "one-size-fits-all". Pri implementaciji upoštevamo vaš lasten security review.' },
    { q: 'Kdo vzdržuje sistem po pilotu?', a: 'Možnost A: AIERA z mesečno naročnino in SLA. Možnost B: predaja vaši IT ekipi z dokumentacijo in onboardingom. Možnost C: kombinacija - AIERA podpora, vaša ekipa vzdržuje.' },
  ],

  ctaFinalTitle: 'Predlog: 15-minutni pregled vpliva za NLB CFO funkcijo',
  ctaFinalBody: 'V 15 minutah lahko pogledava, katero konkretno poročilo ali analizo bi se splačalo dati v pilot. Brez zavez, brez priprave. Po pregledu odločite, ali smer pelje naprej ali ne.',
};

// ─── RENDER ──────────────────────────────────────────────────────────────────

function renderTest({ persona, theme, content, meta }) {
  return require('./template').renderPage({ persona, theme, content, meta });
}

const tests = [
  {
    filename: 'krka-head-of-it.html',
    persona: getPersona('head_of_it'),
    theme: 'teal',
    content: KRKA_CONTENT,
    meta: {
      company: 'KRKA d.d.',
      companyDisplay: 'KRKA d.d.',
      recipientFull: 'g. Marko Novak, Head of IT - KRKA d.d.',
      recipientShort: 'g. Marka Novaka',
      slug: 'krka',
      calendlyUrl: 'https://calendly.com/aiera-koledar/aiera-ai',
      disablePixel: true,
    },
  },
  {
    filename: 'petrol-head-of-sales.html',
    persona: getPersona('head_of_sales'),
    theme: 'forest',
    content: PETROL_CONTENT,
    meta: {
      company: 'PETROL d.d.',
      companyDisplay: 'PETROL B2B',
      recipientFull: 'ga. Tina Kovač, Head of Sales B2B - PETROL d.d.',
      recipientShort: 'go. Tino Kovač',
      slug: 'petrol',
      calendlyUrl: 'https://calendly.com/aiera-koledar/aiera-ai',
      disablePixel: true,
    },
  },
  {
    filename: 'nlb-cfo.html',
    persona: getPersona('cfo'),
    theme: 'navy',
    content: NLB_CONTENT,
    meta: {
      company: 'NLB d.d.',
      companyDisplay: 'NLB d.d.',
      recipientFull: 'g. Jure Zupan, CFO - NLB d.d.',
      recipientShort: 'g. Jureta Zupana',
      slug: 'nlb',
      calendlyUrl: 'https://calendly.com/aiera-koledar/aiera-ai',
      disablePixel: true,
    },
  },
];

const outDir = path.join(__dirname, 'test-output');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const t of tests) {
  const html = renderTest(t);
  const filepath = path.join(outDir, t.filename);
  fs.writeFileSync(filepath, html);
  console.log(`✓ ${t.filename} (${html.length} bytes)`);
}
