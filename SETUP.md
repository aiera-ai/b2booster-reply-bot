# B2Booster Reply Bot - Setup

## Kako deluje

```
INSTANTLY reply        LinkedIn email notifikacija (Gmail)
      ↓                           ↓
  webhook                    Zapier parsira
      ↓                           ↓
         /webhook/instantly   /webhook/linkedin
                   ↓
           Claude generira reply
                   ↓
          Approval email → ti (zan.bagaric@gmail.com)
                   ↓
           [POŠLJI] ali [UREDI]
                   ↓
       Outflo API / Instantly API pošlje
```

---

## 1. Deploy na Render (brezplačno)

1. Ustvari GitHub repo in push kodo tja
2. Pojdi na [render.com](https://render.com) → New Web Service
3. Poveži GitHub repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** Node
5. Dodaj Environment Variables (iz `.env.example`)
6. Deploy → dobiš URL npr. `https://b2booster-reply-bot.onrender.com`

---

## 2. Resend (approval email pošiljanje)

1. Registriraj se na [resend.com](https://resend.com) - brezplačno
2. Dodaj domeno b2booster.eu (DNS records)
3. Ustvari API Key → vstavi v `RESEND_API_KEY`

---

## 3. Instantly webhook

1. Pojdi v Instantly → Settings → Webhooks
2. New Webhook:
   - URL: `https://YOUR-RENDER-URL/webhook/instantly`
   - Event: **Reply Received**
3. Field mapping - pošlji:
   - `first_name`
   - `last_name`
   - `company_name`
   - `email_reply_text`
   - `email_uuid`
   - `email_subject`

---

## 4. Zapier za LinkedIn (Gmail → Webhook)

LinkedIn nima API za branje sporočil, ampak pošlje email notifikacijo.

**Zap:**

**Trigger:** Gmail → New Email
- Filter: `from:(notifications@linkedin.com)`
- Filter: subject vsebuje "replied" ali "odgovoril"

**Action 1:** Formatter by Zapier → Text → Extract Pattern
- Izvleci ime pošiljatelja in vsebino sporočila iz email body-ja

**Action 2:** Webhooks by Zapier → POST
- URL: `https://YOUR-RENDER-URL/webhook/linkedin`
- Body (JSON):
  ```json
  {
    "first_name": "{{ime iz email}}",
    "last_name": "{{priimek}}",
    "company": "{{podjetje}}",
    "message": "{{vsebina sporočila}}",
    "linkedin_url": "{{linkedin profil URL}}"
  }
  ```

> Opomba: LinkedIn notification emaili imajo konsistentno strukturo - Zapier Formatter to brez težav razčleni.

---

## 5. Training - kako izboljšuješ odgovore

Odpri `server.js` in poišči razdelek `STYLE_GUIDE` (vrstica ~35).

Ko ti Claude napiše reply ki ni točno pravi, ga popravi v UREDI formu in pošlji. Nato daj meni (Cowork/Claude) popravljen primer in jaz posodobim style guide.

Sčasoma dodamo few-shot primere direktno v system prompt - to je najhitrejši način treninga.

---

## 6. Preverjanje delovanja

Test webhook ročno:
```bash
curl -X POST https://YOUR-RENDER-URL/webhook/instantly \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Gregor","last_name":"Istenič","company_name":"Konstill","email_reply_text":"Ja, pošljite mi več informacij.","email_uuid":"test-123","email_subject":"Novi trgi za KONSTILL"}'
```

Preveriti moraš da dobiš approval email v inbox.
