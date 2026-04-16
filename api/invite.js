import { verifyAuth } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check — only logged-in managers can send invites
  const { user, error: authErr } = await verifyAuth(req)
  if (!user) {
    return res.status(401).json({ error: authErr || 'Unauthorized' })
  }

  const { operativeId, operativeName, email, mobile, projectName, customHtml } = req.body

  if (!operativeId || !operativeName) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const baseUrl = process.env.APP_URL || 'https://app.coresite.io'

  const profileLink = `${baseUrl}/operative/${operativeId}/profile`
  const documentsLink = `${baseUrl}/operative/${operativeId}/documents`
  const workerLink = `${baseUrl}/worker-login`

  const results = { email: null, sms: null }

  // Send invite email via Resend
  if (email) {
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'CoreSite <noreply@coresite.io>',
            to: [email],
            subject: customHtml ? `CoreSite — ${projectName}` : `CoreSite — You've been added to ${projectName}`,
            html: customHtml || `
              <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto;">
                <div style="background: #0a0e1a; border-radius: 12px 12px 0 0; padding: 24px;">
                  <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 200; letter-spacing: 4px;">CORE<span style="font-weight: 700; letter-spacing: 1px;">SITE</span></h1>
                  <p style="color: #9ca3af; margin: 4px 0 0; font-size: 12px;">Site Induction & RAMS Sign-Off</p>
                </div>
                <div style="background: #0f1529; padding: 24px; border-radius: 0 0 12px 12px;">
                  <p style="color: white; font-size: 16px; margin: 0 0 8px;">Hi ${operativeName},</p>
                  <p style="color: #9ca3af; font-size: 14px; margin: 0 0 20px;">
                    You've been added to <strong style="color: white;">${projectName}</strong>.
                    Sign in to complete your profile and sign the required documents.
                  </p>

                  <a href="${workerLink}" style="display: block; background: #3b82f6; color: white; text-align: center; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px; margin-bottom: 12px;">
                    Sign In to CoreSite
                  </a>

                  <a href="${profileLink}" style="display: block; background: #1c2744; border: 1px solid #253356; color: white; text-align: center; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                    First time? Complete Your Profile
                  </a>

                  <p style="color: #6b7280; font-size: 11px; margin: 20px 0 0; text-align: center;">
                    Sign in with your email and date of birth<br>
                    <span style="color: #3b82f6;">${workerLink}</span>
                  </p>
                </div>
              </div>
            `,
          }),
        })
        results.email = emailRes.ok ? 'sent' : 'failed'
      } catch {
        results.email = 'failed'
      }
    } else {
      console.log(`[Invite] Would email ${email}: ${profileLink}`)
      results.email = 'no_api_key'
    }
  }

  // SMS via Twilio (if configured)
  if (mobile) {
    const twilioSid = process.env.TWILIO_ACCOUNT_SID
    const twilioToken = process.env.TWILIO_AUTH_TOKEN
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER

    if (twilioSid && twilioToken && twilioFrom) {
      try {
        const smsRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: mobile.startsWith('+') ? mobile : `+44${mobile.replace(/^0/, '')}`,
            From: twilioFrom,
            Body: `Hi ${operativeName}, you've been added to ${projectName} on CoreSite. Complete your profile and sign documents here: ${profileLink}`,
          }),
        })
        results.sms = smsRes.ok ? 'sent' : 'failed'
      } catch {
        results.sms = 'failed'
      }
    } else {
      console.log(`[Invite] Would SMS ${mobile}: ${profileLink}`)
      results.sms = 'no_api_key'
    }
  }

  return res.status(200).json({ message: 'Invite processed', results })
}
