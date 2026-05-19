# Multi-Offer Cascade Spec - Reply Bot

Verzija: 1.0
Datum: 2026-05-17
Avtor: Žan + AI

---

## 1. Cilj

Reply bot za vsak inbound lead izbere **eno** od treh ponudb in jo pošlje (preko LinkedIn + email handoff). Če lead ne odgovori v X dni, bot avtomatsko proba **naslednjo ponudbo iz cascade**. Cilj: maksimalna konverzija per lead, brez ročnega dela.

3 ponudbe:
1. **AIERA** (default, high-ticket): AI rešitve za podjetja. CTA = Calendly.
2. **GENERATOR PONUDB** (mid-tier, SaaS-style): tool za 20x hitrejše ponudbe. CTA = link do njihove personalizirane sample ponudbe.
3. **B2BOOSTER** (service, B2B outreach): lead gen + outreach service. CTA = link do sample baze leadov + AI message.

---

## 2. Trenutno stanje (kar že obstaja)

Bot je dejansko že 80% strukturiran okrog AIERA modela. To pomeni, da je velik del infrastrukture za multi-offer **že na mestu**.

### 2.1 Že implementirano

| Komponenta | Lokacija | Stanje |
|---|---|---|
| Offer page generator (HTML, personaliziran) | `server.js:530-556` (`generateOfferHTML`) | Aiera-only template |
| Netlify deploy na `ai.aiera.si/{slug}` | `server.js:557-597` (`deployOfferToNetlify`) | Production |
| `createAndDeployOffer(leadData)` wrapper | `server.js:598-611` | Production |
| Email handoff (LinkedIn → email s offer linkom) | `server.js:1286-1359` (`maybeHandleEmailHandoff`) | Production |
| Email handoff prompt | `server.js:1002-1029` (`HANDOFF_EMAIL_PROMPT`) | Aiera-only |
| 3-day followup cron | `server.js:1604-1652` (`processFollowups`) | Production, vendar samo aiera |
| Intent classifier | `server.js:664-687` (`classifyIntent`) | positive/negative/neutral/question/soft_negative |
| Apollo enrichment | `server.js:2564-2598` (`enrichLeadWithApollo`) | Production, daje industry, employees, title, seniority |
| Airtable `Offer Type` field | Code call `server.js:1397` | Trenutno hardcoded `'teaser_v1'` |
| Calendly booking detection | `server.js:2891-2950` (`/webhook/calendly`) | Production, ustavi cascade |

### 2.2 Kaj manjka za multi-offer

| Komponenta | Status | Opomba |
|---|---|---|
| Offer classifier (izbere aiera/generator/b2booster per lead) | **NEW** | 1 Haiku call |
| Generator offer page template | **NEW** | Nova varianta v `generateOfferHTML` |
| B2Booster offer page template | **NEW** | Nova varianta v `generateOfferHTML` |
| Sample bazu leadov za B2Booster page | **NEW** | Apollo search za njihovo industrijo + AI message |
| Generator + B2Booster email handoff prompts | **NEW** | 2 nova prompt-a |
| Cascade scheduler (next offer po 7 dni no-reply) | **NEW** | Razširitev `processFollowups` |
| Airtable schema: `Cascade Stage`, `Offer Type` values | **NEW** | 1 field + cleanup |

---

## 3. Offer Classifier

### 3.1 Cilj

Pred generiranjem replya bot pokliče classifier, ki vrne primary offer + signal za personalization.

### 3.2 Signature

```javascript
async function classifyOffer(leadData, theirMessage) {
  // returns: {
  //   offer: 'aiera' | 'generator' | 'b2booster',
  //   confidence: 0.0-1.0,
  //   key_signal: string,           // 1 stavek zakaj
  //   personalization_hook: string  // 1 stavek za reply
  // }
}
```

### 3.3 Model

`claude-haiku-4-5-20251001` (cheap, fast).

### 3.4 Prompt

```
You classify B2B sales leads into one of 3 offer paths.

LEAD INFO:
- Name: {firstName} {lastName}
- Title: {title}
- Company: {company}
- Industry: {industry}
- Employees: {employees}
- Seniority: {seniority}
- Country: {country}
- Original outreach campaign: {campaignName}
- Their reply: "{theirMessage}"

3 OFFER PATHS:

AIERA (default, highest ticket):
- Best for: companies with 30+ employees, complex internal operations,
  customer service heavy, manual workflows, data-heavy industries,
  any clear AI automation use case beyond pure sales.
- Indicators: ops/HR/finance role, manufacturing, healthcare, logistics,
  enterprise titles (CEO, COO, CTO of mid-size+).

GENERATOR (sales/proposal tool):
- Best for: agencies, consulting firms, professional services, SMB sales-led
  businesses that write many proposals/quotes. Lower ticket, easier yes.
- Indicators: sales director, agency owner, consultant, "we make many offers",
  10-50 employees, B2B services.

B2BOOSTER (lead gen service):
- Best for: B2B companies wanting to grow sales, expand internationally,
  or build a pipeline. Service-based engagement with clear ROI from outbound.
- Indicators: sales/growth/business development role, expansion mentions,
  smaller team without dedicated SDR, food/SaaS/manufacturer wanting EU markets.

Return JSON only:
{
  "offer": "aiera" | "generator" | "b2booster",
  "confidence": 0.0-1.0,
  "key_signal": "1 sentence why this fits",
  "personalization_hook": "1 short sentence to use in the reply that ties to their specific situation"
}

DEFAULT: if uncertain (confidence < 0.6), choose "aiera".
```

### 3.5 Integration point

Vstavi v `webhook/outflo` pred reply generiranje (`server.js:2730`) in v `webhook/linkedin` pred `generateReply` (`server.js:1826`).

```javascript
// Po Apollo enrichment, pred reply generiranje
const classification = await classifyOffer(leadData, messageText);
leadData.offerType = classification.offer;
leadData.classifierSignal = classification.key_signal;
leadData.personalizationHook = classification.personalization_hook;
console.log(`[CLASSIFIER] ${leadData.firstName} → ${classification.offer} (${classification.confidence})`);
```

---

## 4. Offer Variants (3 templates)

Vsi 3 uporabljajo isti `ai.aiera.si/{slug}` hosting, isti deploy pipeline. Razlika je samo v HTML vsebini.

### 4.1 AIERA (currently default - keep as-is)

Že implementiran v `OFFER_PAGE_PROMPT` (`server.js:396-528`).

CTA na strani: Calendly link `https://calendly.com/aiera-koledar/aiera-ai`
Email body CTA: enak Calendly link.

### 4.2 GENERATOR PONUDB (new)

**Pozicioniranje:** 20x hitreje napišite osebne ponudbe za stranke. AI prepiše vašo predstavitev v personalizirano ponudbo v 2 minutah. Tukaj je sample za vas (njihov industry).

**Page struktura:**
1. Header (AIERA brand)
2. Hero: "Generator ponudb v 2 minutah - vaš sample"
3. **Live sample**: AI-generirana ponudba za njihovo industrijo (s placeholder cenami in pristopom). Show, don't tell.
4. Kako deluje: 3 steps
5. Pricing: tier-i (npr. 49€/mes solo, 149€/mes team, 499€/mes agency)
6. Trust/garancija
7. CTA: "Aktivirajte račun" link → onboarding form ALI Calendly za demo

**Prompt:** nova konstanta `GENERATOR_PAGE_PROMPT` z istim CSS sistemom kot AIERA, drugačno vsebino.

**Email handoff body:**
```
Predmet: Vaša sample ponudba

Pozdravljeni {firstName},

Ker ste omenili {hook}, sem za vas pripravil sample ponudbo,
kakršno bi vaše stranke prejele iz našega Generatorja.

Poglejte: {offerUrl}

Generator napiše osebno ponudbo v 2 minutah, AI v ozadju jo prilagodi
panogi stranke in vašemu stilu. Če vam je smiselno, vam pokažem
celoten setup v 15 minutah.

{CALENDLY_15MIN}

Lep pozdrav,
Žan Bagarič
```

### 4.3 B2BOOSTER (new)

**Pozicioniranje:** Tukaj je 10 leadov, ki bi jih lahko že jutri kontaktirali. AI je napisala sporočilo za enega od njih. Tako vam mesečno pripeljemo srečanja.

**Page struktura:**
1. Header (AIERA / B2Booster brand)
2. Hero: "Vaša 10-lead sample baza"
3. **Live sample table**: 10 podjetij + ime kontakta + LinkedIn URL + email (kjer je) za njihovo target industrijo (npr. če lead prodaja food B2B v EU → 10 EU food distributerjev/retailerjev)
4. **Sample outreach message**: AI generira sporočilo za enega od teh 10 leadov v leadovem stilu
5. Kako deluje: mesečno 50-100 leadov + ghost-pisanje + odgovori
6. Pricing: 900-1200€/mes retainer
7. Reference: Toyota Slovenija, Hidria, SavingsBlue
8. CTA: Calendly 20-min

**Tehnično:**
- Apollo search API za njihov target industry + country = 10 sample leadov (1 Apollo credit)
- Anthropic call za personalized message za enega od njih

**Email handoff body:**
```
Predmet: 10 leadov + sporočilo za {firstName}

Pozdravljeni {firstName},

Pripravil sem vam sample bazo: 10 podjetij iz {industry}, ki bi
verjetno bila zainteresirana za to, kar ponujate.

Bonus: AI je za enega od njih že napisala sporočilo v stilu, ki
ga uporabljamo za naše stranke.

Poglejte: {offerUrl}

Tako mesečno pripeljemo srečanja brez vašega časa. Če vam je smiselno,
v 20 minutah pokažem celoten sistem.

{CALENDLY_20MIN}

Lep pozdrav,
Žan Bagarič
```

---

## 5. Cascade Logic

### 5.1 Sequence

```
DAY 0:   Classifier izbere primary offer → bot pošlje
DAY +3:  (obstoječi 3-day followup cron) - nudge SAME offer
DAY +7:  Če no booking → cascade na NEXT offer
DAY +14: Če no booking → cascade na FINAL offer
DAY +21: Mark as cold, STOP
```

### 5.2 Cascade order

Po primary offer-u določena (default cascade):
- `aiera` → `generator` → `b2booster` → STOP
- `generator` → `aiera` → `b2booster` → STOP
- `b2booster` → `aiera` → `generator` → STOP

Pravilo: primary offer se ne ponovi v cascade.

### 5.3 Stop conditions

Cascade se ustavi takoj, če:
- Lead booka Calendly (any of 3 Calendly linkov)
- Lead reply-a (manual approval needed)
- Status = "Not Interested" (manualno set)
- Lead je v cascade >21 dni

### 5.4 Implementacija

Razširi `processFollowups` (`server.js:1604`) v `processCascade`:

```javascript
async function processCascade() {
  // 1. Find leadi z 'Offer Sent (Email)' + 'Email Sent At' starejši kot X dni
  //    + brez 'Booked At' + brez recent inbound reply
  // 2. Branch na podlagi 'Cascade Stage' field:
  //    - stage=primary, dni>=3, <7: same offer nudge (current behavior)
  //    - stage=primary, dni>=7: trigger 2nd offer (cascade.next)
  //    - stage=secondary, dni>=14: trigger 3rd offer (cascade.next)
  //    - stage=tertiary, dni>=21: mark "Cold", stop
}
```

Cron: poveži z obstoječim Render scheduled task ali setInterval `processCascade` vsakih X minut (npr. 6h).

---

## 6. Airtable Schema Changes

### 6.1 Trenutni Leads fields (verified iz koda)

- Lead Name, LinkedIn URL, Campaign, Channel, Status
- Last Message, Last Activity, Notes
- Email, Email Sent At, Followup Sent At, Booked At
- Offer Type, Meeting Time

### 6.2 New / changed

| Field | Type | Values | Purpose |
|---|---|---|---|
| `Offer Type` (existing) | single select | `aiera`, `generator`, `b2booster` | Replace hardcoded `teaser_v1` |
| `Cascade Stage` | single select | `primary`, `secondary`, `tertiary`, `cold` | Track cascade position |
| `Cascade History` | long text | JSON array | Log: `[{stage:"primary",offer:"aiera",sentAt:"..."}]` |
| `Last Offer Sent At` | datetime | ISO | Replaces over-reliance on `Email Sent At` |
| `Classifier Signal` | long text | string | Debug: zakaj je classifier izbral ta offer |
| `Status` (existing) | single select | dodaj `Cold` opcijo | Po 21 dni brez booking |

### 6.3 Migration

Ročno v Airtable UI:
1. Spremeni `Offer Type` v single select z 3 opcijami.
2. Dodaj nova polja (Cascade Stage, Cascade History, Last Offer Sent At, Classifier Signal).
3. Dodaj `Cold` v Status options.
4. Backfill: za vse leade s `Offer Type = teaser_v1`, postavi `aiera` + `Cascade Stage = primary`.

---

## 7. Code Changes - File:Line

### 7.1 `server.js`

| Sprememba | Lokacija | Tip |
|---|---|---|
| `classifyOffer` funkcija | nova, vstavi po `classifyIntent` (~line 690) | NEW |
| Kliči `classifyOffer` v `webhook/outflo` | po Apollo enrichment, pred reply gen (~line 2728) | MODIFY |
| Kliči `classifyOffer` v `webhook/linkedin` | pred `generateReply` (~line 1826) | MODIFY |
| `generateOfferHTML` branching po `leadData.offerType` | line 530 | MODIFY |
| `GENERATOR_PAGE_PROMPT` const | po `OFFER_PAGE_PROMPT` (~line 528) | NEW |
| `B2BOOSTER_PAGE_PROMPT` const | po `GENERATOR_PAGE_PROMPT` | NEW |
| `HANDOFF_EMAIL_PROMPT_AIERA/GENERATOR/B2BOOSTER` | po line 1029 | NEW |
| `generateHandoffEmail` branching po `leadData.offerType` | line 1031 | MODIFY |
| `airtableMarkOfferSent` - pass real `offerType` namesto `'teaser_v1'` | line 1397 | MODIFY |
| Set `Cascade Stage`, `Last Offer Sent At`, `Classifier Signal` v `airtableMarkOfferSent` | line 974 | MODIFY |
| Sample lead generator za B2Booster (Apollo search + AI message) | nova funkcija `generateB2BoosterSample(leadData)` | NEW |
| `processCascade` (rename + extend `processFollowups`) | line 1604 | MODIFY |
| Cascade order map | nova konstanta `CASCADE_NEXT` | NEW |

### 7.2 Nove funkcije summary

```javascript
async function classifyOffer(leadData, theirMessage) { /* Haiku call */ }
async function generateOfferHTML(leadData) { /* now branches on leadData.offerType */ }
async function generateB2BoosterSample(leadData) { /* Apollo + Anthropic */ }
async function processCascade() { /* extended followup */ }
function getNextCascadeOffer(currentOffer, currentStage) { /* lookup table */ }
```

---

## 8. Env Vars

### 8.1 Obstoječi (no change)

`ANTHROPIC_API_KEY`, `OUTFLO_API_KEY`, `INSTANTLY_API_KEY`, `RESEND_API_KEY`, `AIRTABLE_PAT`, `AIRTABLE_BASE_ID`, `NETLIFY_TOKEN`, `NETLIFY_SITE_ID`, `CALENDLY_AI_15MIN`, `HANDOFF_FROM_EMAIL`, `MY_LINKEDIN_URL`, `VESNA_LINKEDIN_URL`, `FOLLOWUP_DAYS=3`

### 8.2 Novi

```
# Calendly variants per offer
CALENDLY_AIERA=https://calendly.com/aiera-koledar/aiera-ai      # existing CALENDLY_AI_15MIN
CALENDLY_B2BOOSTER=https://calendly.com/aiera-koledar/b2booster # optional separate Calendly
CALENDLY_GENERATOR=https://calendly.com/aiera-koledar/generator # optional separate Calendly

# Cascade timing
CASCADE_DAYS_PRIMARY_TO_SECONDARY=7
CASCADE_DAYS_SECONDARY_TO_TERTIARY=7
CASCADE_DAYS_TERTIARY_TO_COLD=7

# Apollo (already used)
APOLLO_API_KEY=...

# Optional: enable/disable per offer (for staged rollout)
ENABLE_AIERA=true
ENABLE_GENERATOR=false  # ko bo Claude Code generator ready
ENABLE_B2BOOSTER=false  # ko bo Apollo+sample baza ready
```

**Pravilo:** če je `ENABLE_X=false`, classifier ne sme izbrati `X` (fallback na naslednjega).

---

## 9. Sample artifacts

### 9.1 Generator sample page (route `ai.aiera.si/sample/{slug}`)

Vsebina:
- Generirana sample ponudba za njihovo industrijo (npr. če lead = food distributer, sample je za food distributer)
- Cena placeholder: "vaša cena: {AI naredi smiselno za njihovo storitev}"
- 1 click CTA: "Naročite Generator za vas" → Calendly ali Stripe link

Tehnika: ko classifier vrne `generator`, `createAndDeployOffer` runs `generateOfferHTML(leadData)` ki bran-a na generator prompt.

### 9.2 B2Booster sample page (route `ai.aiera.si/sample/{slug}`)

Vsebina:
- Header
- "Vaših 10 leadov" - tabela 10 vrstic (Company, Contact, Title, LinkedIn, Country)
- "Sample sporočilo za prvi lead" - AI personalizira message v leadovem stilu
- Pricing card
- Calendly CTA

Tehnika:
1. Classifier vrne `b2booster`
2. `generateB2BoosterSample(leadData)` pokliče Apollo search z `industry=leadData.industry, country=leadData.country, limit=10`
3. Anthropic generira message za prvi result
4. `generateOfferHTML` injectaj 10 leadov + sample message v B2Booster template
5. Deploy na `ai.aiera.si/{slug}`

**Costs:** Apollo = ~10 credits per sample (10 leadov × 1 credit search ali bulk). Anthropic message gen = trivialno.

---

## 10. Decision tree per webhook (final flow)

```
INCOMING reply (Outflo webhook / LinkedIn email / Instantly):
│
├─ Parse message + leadData
│
├─ classifyIntent(message)
│   ├─ negative → polite closeout, STOP
│   ├─ soft_negative → closing reply, STOP
│   └─ positive/neutral/question → CONTINUE
│
├─ maybeHandleEmailHandoff
│   └─ IF lead asks for email/offer:
│       │
│       ├─ classifyOffer(leadData, message) → {offer, confidence, hook}
│       │
│       ├─ IF !ENABLE_[offer], fallback po cascade do prvega enabled
│       │
│       ├─ createAndDeployOffer(leadData) → ai.aiera.si/{slug}
│       │   └─ generateOfferHTML branch-a po leadData.offerType
│       │
│       ├─ generateHandoffEmail branch-a po leadData.offerType
│       │
│       ├─ sendApprovalEmail (žan klikne POŠLJI)
│       │
│       └─ ON approve:
│           ├─ Send email via Resend (z offer link)
│           ├─ Send LinkedIn confirm via Outflo
│           ├─ Airtable: Status=Offer Sent (Email),
│           │   Offer Type=<offer>, Cascade Stage=primary,
│           │   Last Offer Sent At=now, Classifier Signal=hook
│           └─ DONE
│
└─ ELSE (no email handoff trigger):
    │
    ├─ classifyOffer(leadData, message)
    ├─ generateReply branch-a po leadData.offerType  ← TODO: extend generateReply too
    └─ sendApprovalEmail (LinkedIn reply only, no email yet)

CRON (every 6h):
processCascade()
│
├─ Find leadi: Status=Offer Sent (Email), no Booked At, no recent inbound
├─ For each:
│   ├─ daysSinceLastOffer = now - Last Offer Sent At
│   │
│   ├─ stage=primary:
│   │   ├─ days >= 3, < 7: existing 3-day followup (same offer)
│   │   └─ days >= 7: trigger NEXT offer (cascade.next), set stage=secondary
│   │
│   ├─ stage=secondary:
│   │   └─ days >= 14: trigger 3rd offer, set stage=tertiary
│   │
│   └─ stage=tertiary:
│       └─ days >= 21: set Status=Cold, STOP
```

---

## 11. Edge Cases & Risks

| Edge case | Handling |
|---|---|
| Lead odgovori med cascade | Bot zazna reply, ustavi cascade, generira ad-hoc reply |
| Apollo nima dovolj leadov za industry | B2Booster fallback: pokaži samo template, brez sample tabele |
| Lead booka Calendly med cascade | Calendly webhook flipne Status=Meeting Booked, cron ga skipne |
| Classifier vrne low confidence | Default na `aiera` |
| Vsi 3 offers exhausted | Status=Cold, manual re-engagement |
| Lead je B2C ali freelancer (ne fit nobenemu) | Classifier vrne aiera default, ampak realno bi morali že pri Outflo filtrirati |
| Generator/B2Booster page error (Netlify down) | Fallback: pošlji plain text email brez offer linka, log error |
| Apollo down | B2Booster page brez sample baze, samo pricing+pitch |
| Approval email sit hours | Approval ostane v queue, ti odločiš ročno |
| Mojca/non-Žan-Vesna account | Že skipped, no change |
| Sender = naš account (echo) | Že skipped (`server.js:2664`) |
| Lead z manjkajočim industry/employees | Classifier prompt mora handlat `Industry: unknown` |
| Več inbound mailov per cascade | Reply detection mora resetirati cascade timer ali skipnati cascade tick |

---

## 12. Test Plan

### 12.1 Unit-ish tests

- `classifyOffer` z 10 sample leads (mix industries) → preveri da pravi offer izhaja
- `generateOfferHTML` za vse 3 offer types → preveri da HTML validira
- `getNextCascadeOffer('aiera', 'primary')` returns `'generator'`
- `getNextCascadeOffer('aiera', 'tertiary')` returns `null` (stop)

### 12.2 Integration tests

1. POST `/webhook/outflo` z test payloadom (positive intent, agency role) → preveri da:
   - classifier izbere `generator`
   - offer page deployed na ai.aiera.si
   - approval email vsebuje generator-specific copy
   - Airtable lead ima `Offer Type=generator`, `Cascade Stage=primary`

2. Manualno postavi `Last Offer Sent At = now - 8 days` v Airtable, run `/trigger-cascade` (new endpoint) → preveri da:
   - bot trigger-a secondary offer
   - new offer page deployed
   - Cascade Stage flipne na `secondary`

3. Manualno booka Calendly → Cascade Stage ostane, ampak `Booked At` set → naslednji cron tick skipne lead

### 12.3 Staged rollout

- **Stage 0**: ENABLE_AIERA=true, ENABLE_GENERATOR=false, ENABLE_B2BOOSTER=false. Classifier samo loga svojo odločitev, ampak vedno pošlje aiera. Validacija da classifier dela razumno na realnih leadih.
- **Stage 1**: Enable generator. Cascade aktiven na max 5 leadih (manual filter).
- **Stage 2**: Enable b2booster. Cascade full.

---

## 13. Implementation Order

### Phase 1 - Classifier (1-2 dni)

1. Dodaj `classifyOffer` funkcijo
2. Inject v `webhook/outflo` + `webhook/linkedin` + email handoff path
3. `airtableMarkOfferSent` sprejme dynamic `offerType` namesto hardcoded
4. Airtable: dodaj `Offer Type` single select (aiera/generator/b2booster), `Classifier Signal`
5. Stage 0 deploy: log-only mode, vedno pošlje aiera
6. **Ship + watch logs 2-3 dni** da validiraš classifier kvaliteto

### Phase 2 - Generator page + email (2 dni)

1. `GENERATOR_PAGE_PROMPT`
2. `generateOfferHTML` branching
3. `HANDOFF_EMAIL_PROMPT_GENERATOR`
4. `generateHandoffEmail` branching
5. Env: ENABLE_GENERATOR=true
6. Test na 1-2 realnih agencija leadih

### Phase 3 - B2Booster page + sample baza (3 dni)

1. `generateB2BoosterSample` (Apollo + Anthropic)
2. `B2BOOSTER_PAGE_PROMPT` z dynamic sample table
3. `HANDOFF_EMAIL_PROMPT_B2BOOSTER`
4. Env: ENABLE_B2BOOSTER=true
5. Test

### Phase 4 - Cascade scheduler (1-2 dni)

1. Airtable: `Cascade Stage`, `Cascade History`, `Last Offer Sent At`
2. `processCascade` (extend `processFollowups`)
3. Cron interval: vsakih 6h
4. Stop conditions: Booked At, inbound reply, Cold
5. Backfill: vse obstoječe Offer Sent leade na `Cascade Stage=primary`

### Phase 5 - Tuning (ongoing)

- A/B test offer copy
- Track conversion per offer per segment v Airtable
- Tune classifier prompt z primeri

---

## 14. Open Questions (Žan to confirm)

1. **Generator pricing**: 49/149/499 €/mes je placeholder. Final pricing tier-i?
2. **Generator activation flow**: ko klikne CTA, gre na Calendly, custom signup form, ali Stripe direct?
3. **B2Booster sample baza source**: Apollo (ok cost ~10 credits/sample) ali alternative (Hunter, LinkedIn scraper)?
4. **Cascade timing**: 7 dni med stages je predlog. Bolj agresivno (4 dni) ali bolj passive (10 dni)?
5. **Multiple Calendly links**: ena Calendly za vse 3 offers, ali 3 ločeni (aiera/generator/b2booster)?
6. **Vesna pipeline**: ali se classifier uporabi tudi za Vesna leade, ali Vesna ostane samo "handoff to Žan" brez offer routinga?
7. **Aiera in Vesna pripaja Žanu**: ali pri Vesni se classifier kliče po handoff, ali takoj?
8. **Existing teaser_v1 leadi**: backfill na `aiera`, ali jih pustimo kot legacy?

---

## 15. Success Metrics (track v Airtable + analytics)

- **Conversion rate per offer** (Calendly booked / offer sent)
- **Cascade completion rate** (% leadov ki dosežejo `Cold`)
- **Reply rate per offer** (lead reply / offer sent)
- **Time-to-meeting** (offer sent → Calendly booked)
- **Classifier accuracy** (manual review 20 random leadov / week prvih 4 tedne)

Target po 4 tednih:
- Booked meetings: +50% vs sole aiera baseline
- Cascade reach: 60% leadov dobi vsaj 2 ponudbe pred Cold
- Classifier precision: >75% (manual check)

---

**End of Spec v1.0**
