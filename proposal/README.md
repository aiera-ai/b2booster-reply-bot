# AIERA Proposal Generator

Deterministic-template proposal pages (spirit-style, no prices, meeting-focused).
Replaces the legacy AI-generates-full-HTML approach with a fixed template + AI-generated content slots.

## Why this exists

The classic offer generator (`createAndDeployOfferClassic`) asks Claude to produce the entire HTML. Quality drifts across leads, design varies, and Slovene reads like AI-translated marketing copy.

This module flips it:

- **Design is fixed.** One Tailwind-style stylesheet, hand-tuned to match `aiera.si/spirit`.
- **Persona-driven section list.** Head of IT gets a security block; CFO gets ROI; Head of Sales gets pipeline language.
- **AI only writes copy.** Claude Opus 4.6 fills ~30 strict JSON slots in proper Slovene.
- **Validator catches AI fluff.** Em dashes, banned phrases (`"odklenite potencial"`, `"v današnjem hitro spreminjajočem se svetu"`, etc.) are flagged and the call retries.

## How it plugs into the bot

`server.js` imports `createAndDeployProposal` from `./proposal` and routes through `createAndDeployOffer`, which picks between styles based on the `PROPOSAL_STYLE` env var.

```
PROPOSAL_STYLE=spirit   # default, new template
PROPOSAL_STYLE=classic  # legacy pricing offer
```

You can also override per-call with `leadData.offerStyle = 'classic'`.

## Files

```
proposal/
  index.js            # public API + Netlify deploy
  template.js         # HTML + CSS (deterministic, no AI)
  generator.js        # Claude API caller + validator
  personas.js         # 6 persona blueprints + role classifier
  colors.js           # 6 brand color themes per industry
  test-template.js    # offline test with mock content (no API key needed)
  test-local.js       # end-to-end test (uses real Claude API)
  test-output/        # generated test HTML files
```

## Deploy checklist

1. **Push to Render**

   `git add proposal/ server.js .env.example && git commit -m "Add spirit-style proposal generator" && git push`

2. **Set env vars in Render dashboard** (Service → Environment):
   - `PROPOSAL_STYLE=spirit`
   - `PROPOSAL_MODEL=claude-opus-4-6`
   - `PROPOSAL_PREFIX=predlog`
   - `PROPOSAL_BASE_URL=https://ai.aiera.si`

3. **Verify it runs** by hitting the preview endpoint:

   ```
   https://b2booster-reply-bot.onrender.com/preview-proposal?company=KRKA%20d.d.&firstName=Marko&lastName=Novak&title=Head%20of%20IT&industry=farmacija
   ```

   Should render the full HTML page inline (no Netlify deploy yet).

4. **Test full deploy** with a POST:

   ```bash
   curl -X POST https://b2booster-reply-bot.onrender.com/generate-proposal \
     -H "Content-Type: application/json" \
     -d '{"firstName":"Marko","lastName":"Novak","company":"KRKA d.d.","title":"Head of IT","industry":"farmacija","theirMessage":"Zanima nas AI za interne dokumente."}'
   ```

   Returns `{"ok": true, "url": "https://ai.aiera.si/predlog/krka-d-d"}`.

5. **Open the URL** and check the page in browser.

## Testing locally without Claude API

`node proposal/test-template.js` writes 3 sample pages (KRKA / IT, PETROL / Sales, NLB / CFO) to `proposal/test-output/` using hand-written mock content. Useful for design/QA without burning API tokens.

Open the files directly in your browser:

```
file:///Users/zanbagaric/Documents/Claude/Projects/B2Booster/reply-bot/proposal/test-output/krka-head-of-it.html
```

## Testing locally WITH Claude API

`node proposal/test-local.js` does the real thing - calls Claude Opus 4.6 with 3 example leads, writes generated HTML to disk. Needs `ANTHROPIC_API_KEY` in `.env`.

## Personas + color themes

| Persona key       | Theme   | Default for titles matching                                  |
|-------------------|---------|--------------------------------------------------------------|
| `head_of_it`      | teal    | CTO, CIO, Head of IT, Head of Engineering, IT director       |
| `ceo`             | slate   | CEO, Founder, Managing Director, VP/Director (generic)       |
| `cfo`             | navy    | CFO, Finance director, Controller, Treasurer                 |
| `head_of_sales`   | forest  | Head of Sales, Sales director, BD, Export manager            |
| `head_of_marketing` | plum  | CMO, Head of Marketing, Brand director                       |
| `head_of_ops`     | amber   | COO, Operations, Process, Supply chain, Production           |
| `default`         | teal    | anything else                                                |

You can override per-call with `leadData.personaOverride` and `leadData.themeOverride`.

## Slovene quality controls

Every generated page goes through `validateContent()` which checks for:

- Em dashes (auto-replaced with `" - "`)
- En dashes (auto-replaced with `" - "`)
- Banned AI phrases (configurable list in `generator.js`)
- Croatianisms / Slovene typos
- Missing required slots

If issues are found, the system re-prompts Claude with an explicit error list and a lower temperature (0.5) for a corrected pass.

## Tracking pixel

Every deployed proposal page has an inline tracking script that beacons events to the bot at `${SERVER_URL}/pixel/{slug}`. Stored in the Airtable **Proposals** table (`tblHS9tAl7c1XAQpi`), one record per slug.

Captured events:

- `page_view` - on each fresh load (increments `Opens`, updates `Last Open At`)
- `scroll_25` / `scroll_50` / `scroll_75` / `scroll_100` - fired once per session at each threshold (updates `Max Scroll`)
- `cta_click` - any click on a primary button or Calendly link
- `calendly_click` - subset, specifically the Calendly URL clicks (updates `Calendly Clicks`)
- `heartbeat` - every 30s while the tab is visible (updates `Time On Page (s)`)
- `unload` - on page close (final time and scroll)

Bot crawlers (Slack, LinkedIn, WhatsApp previews) are filtered out by user agent so they don't pollute open counts.

### Stats endpoint

`GET /proposal-stats/{slug}` returns the raw Airtable record as JSON. Useful for dashboard widgets or quick checks.

### Disabling

Set `PROPOSAL_DISABLE_PIXEL=1` to omit the script entirely. Or pass `leadData.disablePixel = true` per call.

## Cost

At `claude-opus-4-6`, one proposal generation ≈ 6-8k input tokens + ~3k output tokens ≈ **$0.18 per lead** (1 attempt). With validation retry, worst case **$0.36 per lead**. At 150 leads/month, that's ~$30-55/month max.

To reduce cost, switch to `claude-sonnet-4-6` via `PROPOSAL_MODEL=claude-sonnet-4-6` (around 5x cheaper, slightly weaker Slovene).

## Rollback

If anything goes wrong in production, set:

```
PROPOSAL_STYLE=classic
```

…and redeploy. The legacy `createAndDeployOfferClassic` still works exactly as before.
