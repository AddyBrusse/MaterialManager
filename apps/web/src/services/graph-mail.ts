import { PublicClientApplication } from '@azure/msal-browser'
import type { jsPDF } from 'jspdf'
import { companyApi } from '../api/company'

let msalInstance: PublicClientApplication | null = null
let msalInitialized = false

async function getMsal(): Promise<PublicClientApplication> {
  if (msalInstance && msalInitialized) return msalInstance
  const co = companyApi.getSync()
  if (!co.graphClientId || !co.graphTenantId) {
    throw new Error('Microsoft 365 niet geconfigureerd. Ga naar Instellingen → Bedrijf.')
  }
  msalInstance = new PublicClientApplication({
    auth: {
      clientId: co.graphClientId,
      authority: `https://login.microsoftonline.com/${co.graphTenantId}`,
      redirectUri: `${window.location.origin}/auth-popup.html`,
    },
    cache: { cacheLocation: 'sessionStorage' },
  })
  await msalInstance.initialize()
  msalInitialized = true
  return msalInstance
}

export async function acquireToken(scopes: string[], loginHint?: string | null): Promise<string> {
  const msal = await getMsal()
  const accounts = msal.getAllAccounts()

  if (accounts.length > 0) {
    try {
      const result = await msal.acquireTokenSilent({ scopes, account: accounts[0] })
      return result.accessToken
    } catch {
      // silent failed, fall through to popup
    }
  }

  try {
    const result = await msal.acquireTokenPopup({ scopes, loginHint: loginHint ?? undefined })
    return result.accessToken
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('popup_window_error') || msg.includes('popupwindow')) {
      throw new Error('Sta pop-ups toe voor dit adres om in te loggen bij Microsoft.')
    }
    throw new Error(`Inloggen bij Microsoft 365 mislukt: ${msg}`)
  }
}

export interface MailOptions {
  to: string
  subject: string
  bodyHtml: string
  attachments: Array<{ name: string; contentBytes: string }>
  loginHint?: string | null
}

export async function sendViaMicrosoft365(opts: MailOptions): Promise<void> {
  const token = await acquireToken(['Mail.Send'], opts.loginHint)

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
    throw new Error(err?.error?.message ?? `Microsoft Graph fout: ${res.status}`)
  }
}

export function pdfToBase64(doc: jsPDF): string {
  return doc.output('datauristring').split(',')[1]
}
