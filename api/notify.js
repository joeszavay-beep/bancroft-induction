import { verifyAuth } from './_auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { user, error: authErr } = await verifyAuth(req)
  if (!user) {
    return res.status(401).json({ error: authErr || 'Unauthorized' })
  }

  const { to, operativeName, projectName } = req.body

  if (!to || !operativeName) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const resendKey = process.env.RESEND_API_KEY

  // If no Resend API key configured, just log and return success
  if (!resendKey) {
    console.log(`[Notification] ${operativeName} completed all documents for ${projectName}. Email would be sent to ${to}.`)
    return res.status(200).json({ message: 'Notification logged (email not configured)' })
  }

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CoreSite <noreply@coresite.io>',
        to: [to],
        subject: `${operativeName} has completed all documents — ${projectName}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto; background: #0f1529; border-radius: 12px; overflow: hidden;">
            <div style="background: #0a0e1a; padding: 20px 24px;">
              <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 200; letter-spacing: 4px;">CORE<span style="font-weight: 700; letter-spacing: 1px;">SITE</span></h1>
              <p style="color: #9ca3af; margin: 4px 0 0; font-size: 12px;">Site Induction & RAMS Sign-Off</p>
            </div>
            <div style="padding: 24px;">
              <div style="background: #1c2744; border: 1px solid #253356; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
                <p style="color: #22c55e; font-weight: 600; margin: 0 0 4px;">All Documents Complete</p>
                <p style="color: white; font-size: 18px; font-weight: 700; margin: 0;">${operativeName}</p>
              </div>
              <p style="color: #9ca3af; font-size: 14px; margin: 0;">
                Has completed and signed all required documents for <strong style="color: white;">${projectName}</strong>.
              </p>
              <p style="color: #6b7280; font-size: 12px; margin: 16px 0 0;">
                ${new Date().toLocaleString()}
              </p>
            </div>
          </div>
        `,
      }),
    })

    if (!emailRes.ok) {
      const err = await emailRes.text()
      console.error('Resend error:', err)
      return res.status(500).json({ error: 'Failed to send email' })
    }

    return res.status(200).json({ message: 'Email sent' })
  } catch (error) {
    console.error('Email error:', error)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}
