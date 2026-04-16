function escapeHtml(str) {
  if (!str) return str
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const raw = req.body
  const name = escapeHtml(raw.name)
  const email = escapeHtml(raw.email)
  const company = escapeHtml(raw.company)
  const phone = escapeHtml(raw.phone)
  const message = escapeHtml(raw.message)
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' })

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return res.status(200).json({ message: 'Saved (no email configured)' })

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'CoreSite <noreply@coresite.io>',
        to: ['joe.szavay@szavaypropertygroup.co.uk'],
        subject: `New Demo Request — ${company || name}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 500px; margin: 0 auto;">
            <div style="background: #1B2A3D; border-radius: 10px 10px 0 0; padding: 20px 24px;">
              <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 200; letter-spacing: 4px;">CORE<span style="font-weight: 700; letter-spacing: 1px;">SITE</span></h1>
              <p style="color: rgba(255,255,255,0.55); margin: 4px 0 0; font-size: 12px;">New Demo Request</p>
            </div>
            <div style="background: #ffffff; padding: 24px; border: 1px solid #E5E5E5; border-top: none; border-radius: 0 0 10px 10px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #6B6B6B; font-size: 13px; width: 100px;">Name</td>
                  <td style="padding: 8px 0; color: #1A1A1A; font-size: 13px; font-weight: 600;">${name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B6B6B; font-size: 13px;">Email</td>
                  <td style="padding: 8px 0; color: #3B7DD8; font-size: 13px; font-weight: 500;"><a href="mailto:${email}" style="color: #3B7DD8; text-decoration: none;">${email}</a></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B6B6B; font-size: 13px;">Company</td>
                  <td style="padding: 8px 0; color: #1A1A1A; font-size: 13px; font-weight: 500;">${company || '—'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6B6B6B; font-size: 13px;">Phone</td>
                  <td style="padding: 8px 0; color: #1A1A1A; font-size: 13px; font-weight: 500;">${phone || '—'}</td>
                </tr>
                ${message ? `<tr>
                  <td style="padding: 8px 0; color: #6B6B6B; font-size: 13px; vertical-align: top;">Message</td>
                  <td style="padding: 8px 0; color: #1A1A1A; font-size: 13px;">${message}</td>
                </tr>` : ''}
              </table>
              <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #E5E5E5;">
                <a href="mailto:${email}" style="display: inline-block; background: #3B7DD8; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px;">Reply to ${name.split(' ')[0]}</a>
              </div>
            </div>
          </div>
        `,
      }),
    })

    // Send welcome email to the requester
    const isTryDemo = message === 'Try Demo'
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'CoreSite <noreply@coresite.io>',
        to: [email],
        subject: isTryDemo ? `Welcome to CoreSite, ${name.split(' ')[0]}!` : 'Thanks for your interest in CoreSite',
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto;">
            <div style="background: #1A2744; border-radius: 10px 10px 0 0; padding: 24px;">
              <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 200; letter-spacing: 4px;">CORE<span style="font-weight: 700; letter-spacing: 1px;">SITE</span></h1>
              <p style="color: rgba(255,255,255,0.4); margin: 6px 0 0; font-size: 12px;">Site Compliance Platform</p>
            </div>
            <div style="background: #ffffff; padding: 28px 24px; border: 1px solid #E2E6EA; border-top: none;">
              <h2 style="color: #1A1A2E; margin: 0 0 12px; font-size: 18px;">${isTryDemo ? `Welcome, ${name.split(' ')[0]}!` : `Thanks for your enquiry, ${name.split(' ')[0]}!`}</h2>
              <p style="color: #6B7A99; font-size: 14px; line-height: 1.65; margin: 0 0 20px;">
                ${isTryDemo
                  ? `Thanks for trying CoreSite${company ? ` — we hope the demo gives you a great feel for how the platform can help <strong style="color: #1A1A2E;">${company}</strong> manage site compliance.`
                  : `. We hope the demo gives you a great feel for what the platform can do.`}`
                  : `We've received your demo request${company ? ` for <strong style="color: #1A1A2E;">${company}</strong>` : ''} and one of our team will be in touch within 24 hours to arrange a personalised walkthrough.`}
              </p>
              ${isTryDemo ? `
              <div style="background: #F5F8FF; border-radius: 8px; border-left: 3px solid #1B6FC8; padding: 14px 16px; margin-bottom: 20px;">
                <p style="color: #1A1A2E; font-size: 13px; font-weight: 600; margin: 0 0 8px;">What you just explored:</p>
                <ul style="color: #6B7A99; font-size: 13px; margin: 0; padding-left: 18px; line-height: 1.9;">
                  <li>Digital RAMS sign-off with signatures</li>
                  <li>Snagging with pin placement on drawings</li>
                  <li>Progress drawings with traffic-light marking</li>
                  <li>QR site sign-in with live attendance</li>
                  <li>Daily site diary with weather auto-fill</li>
                  <li>Inspection checklists and worker management</li>
                  <li>Real-time chat between managers and operatives</li>
                </ul>
              </div>
              <p style="color: #6B7A99; font-size: 14px; line-height: 1.65; margin: 0 0 20px;">
                Ready to use CoreSite on your own projects? We'd love to set you up with your own account — your logo, your colours, your data.
              </p>
              <a href="https://coresite.io" style="display: inline-block; background: #1B6FC8; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Book a Personalised Demo</a>
              ` : `
              <div style="background: #F5F8FF; border-radius: 8px; border-left: 3px solid #1B6FC8; padding: 14px 16px; margin-bottom: 20px;">
                <p style="color: #1A1A2E; font-size: 13px; font-weight: 500; margin: 0 0 8px;">What to expect:</p>
                <ul style="color: #6B7A99; font-size: 13px; margin: 0; padding-left: 18px; line-height: 1.8;">
                  <li>A live walkthrough of the full platform</li>
                  <li>See how snagging, progress drawings and RAMS sign-off work</li>
                  <li>Discussion around your specific requirements</li>
                  <li>Pricing tailored to your team size</li>
                </ul>
              </div>
              `}
              <p style="color: #6B7A99; font-size: 13px; line-height: 1.65; margin: ${isTryDemo ? '20' : '0'}px 0 20px;">
                Questions? Reply to this email or contact <a href="mailto:joe@coresite.io" style="color: #1B6FC8; text-decoration: none; font-weight: 500;">joe@coresite.io</a>
              </p>
              <p style="color: #1A1A2E; font-size: 13px; margin: 0;">
                Best regards,<br>
                <strong>The CoreSite Team</strong>
              </p>
            </div>
            <div style="background: #F5F6F8; padding: 12px 24px; border-radius: 0 0 10px 10px; border: 1px solid #E2E6EA; border-top: none;">
              <p style="color: #B0B8C9; font-size: 10px; margin: 0; text-align: center;">CoreSite — Site Compliance Platform for Construction</p>
            </div>
          </div>
        `,
      }),
    }).catch(() => {})

    return res.status(200).json({ message: 'Emails sent' })
  } catch (err) {
    console.error('Demo request email error:', err)
    return res.status(200).json({ message: 'Saved (email failed)' })
  }
}
