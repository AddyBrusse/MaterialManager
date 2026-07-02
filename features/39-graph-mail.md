# 39 — Microsoft Graph e-mail integratie

Send offertes and documents directly from the app via the user's own Outlook account.
Emails land in the user's **Verzonden** folder automatically (Graph sendMail does this by default).

## Prerequisites (done by admin, once)

1. Azure Portal → Azure Active Directory → App registrations → **New registration**
   - Name: `ShopCommand`
   - Supported account type: **Accounts in this organizational directory only**
   - Redirect URI: **Single-page application (SPA)**
     - `http://localhost:5173` (dev)
     - Production URL (e.g. `http://192.168.1.x:3000`)
2. **API permissions** → Add → Microsoft Graph → Delegated → `Mail.Send`
   - No admin consent needed for this permission
3. **Authentication** → Enable **Allow public client flows** → Yes
4. Note the **Application (client) ID** and **Directory (tenant) ID**
5. Enter both in **Instellingen → Bedrijf → Microsoft 365** section

Each user must have their M365 email set in **Instellingen → Gebruikers → E-mail (M365)**.
MSAL uses this as `loginHint` so the popup pre-fills the right account.

## npm package

```
npm install @azure/msal-browser -w apps/web
```

## Files to create

### `apps/web/src/services/graph-mail.ts`

```ts
import { PublicClientApplication, type AuthenticationResult } from '@azure/msal-browser'
import { companyApi } from '../api/company'

let msalInstance: PublicClientApplication | null = null

function getMsal(): PublicClientApplication {
  if (msalInstance) return msalInstance
  const co = companyApi.getSync()
  if (!co.graphClientId || !co.graphTenantId) {
    throw new Error('Microsoft 365 niet geconfigureerd. Ga naar Instellingen → Bedrijf.')
  }
  msalInstance = new PublicClientApplication({
    auth: {
      clientId: co.graphClientId,
      authority: `https://login.microsoftonline.com/${co.graphTenantId}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
  })
  return msalInstance
}

async function acquireToken(loginHint?: string | null): Promise<string> {
  const msal = getMsal()
  await msal.initialize()
  const scopes = ['Mail.Send']
  const accounts = msal.getAllAccounts()

  // Try silent first
  if (accounts.length > 0) {
    try {
      const result = await msal.acquireTokenSilent({ scopes, account: accounts[0] })
      return result.accessToken
    } catch {}
  }

  // Fall back to popup
  const result = await msal.acquireTokenPopup({ scopes, loginHint: loginHint ?? undefined })
  return result.accessToken
}

export interface MailOptions {
  to: string                  // recipient email
  subject: string
  bodyHtml: string
  attachments: Array<{
    name: string              // filename e.g. "Offerte-OFF-2026-001-v1.pdf"
    contentBytes: string      // base64-encoded PDF bytes
  }>
  loginHint?: string | null   // user's M365 email (from user.email)
}

export async function sendViaMicrosoft365(opts: MailOptions): Promise<void> {
  const token = await acquireToken(opts.loginHint)

  const message = {
    subject: opts.subject,
    body: { contentType: 'HTML', content: opts.bodyHtml },
    toRecipients: [{ emailAddress: { address: opts.to } }],
    attachments: opts.attachments.map(a => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.name,
      contentBytes: a.contentBytes,
      contentType: 'application/pdf',
    })),
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Graph API fout: ${res.status}`)
  }
}

// Helper: jsPDF doc → base64 string (no download)
export function pdfToBase64(doc: import('jspdf').jsPDF): string {
  return doc.output('datauristring').split(',')[1]
}
```

## Files to modify

### `OfferteTab.tsx` — "Verstuur offerte" button

Next to the existing `↓ PDF` button, add **`✉ Verstuur`**.

On click:
1. Build the offerte PDF with jsPDF (same as `downloadOffertePdf` but return the doc instead of saving)
2. Convert to base64 via `pdfToBase64(doc)`
3. Look up relatie email: `relatiesApi.listSync().find(r => r.id === project.relatieId)?.email`
4. Look up current user's M365 email: `useUserStore(s => s.user)?.email`
5. Call `sendViaMicrosoft365({ to, subject, bodyHtml, attachments, loginHint })`

Subject: `Offerte ${offerte.id} — ${project.naam}`

Body template (Dutch, HTML):
```html
<p>Geachte [contactNaam],</p>
<p>Bijgaand ontvangt u onze offerte [offerte.id] voor [project.naam].</p>
<p>Heeft u vragen, neem dan gerust contact met ons op.</p>
<p>Met vriendelijke groet,<br>[user.name] [user.achternaam]<br>[user.titel]<br>[company.naam]<br>[company.telefoon]</p>
```

### `ProductieTab.tsx` — optional "Verstuur formulieren" (lower priority)

Same pattern, sending the combined production forms PDF to an internal email/shared inbox.

## offerte-pdf.ts split needed

`downloadOffertePdf` currently calls `doc.save()` internally.
Split into two functions:
- `buildOffertePdf(project, offerte): jsPDF` — builds and returns the doc
- `downloadOffertePdf(...)` — calls build then `doc.save()`

`sendViaMicrosoft365` then calls `buildOffertePdf` and `pdfToBase64`.

## Error states to handle in UI

| Error | User message |
|---|---|
| `graphClientId` / `graphTenantId` not set | "Configureer Microsoft 365 in Instellingen → Bedrijf." |
| User email not set | "Stel uw e-mailadres in via Instellingen → Gebruikers." |
| Recipient email missing on relatie | "Geen e-mailadres bekend voor deze klant. Voeg toe via Relaties." |
| Popup blocked by browser | "Sta pop-ups toe voor dit adres om in te loggen bij Microsoft." |
| Graph API error | Show raw Graph error message |

## Sequence diagram

```
User clicks "Verstuur offerte"
  → check graphClientId/tenantId in company settings
  → check recipient email on relatie
  → buildOffertePdf() → base64
  → acquireToken() — silent first, popup if needed (once per session)
  → POST /me/sendMail with attachment
  → success: notification "Offerte verzonden naar [email]"
  → update offerte.status to 'verzonden' + verzondenOp = now()
```

## Not in scope

- Storing OAuth tokens in the DB (MSAL handles this in sessionStorage)
- Background/scheduled sends (requires backend token store — future)
- CC / BCC UI (add later if needed)
- HTML email template editor (plain Dutch template is sufficient)
