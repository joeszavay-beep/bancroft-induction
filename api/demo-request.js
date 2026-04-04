export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { name, email, company, phone, message } = req.body
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

    return res.status(200).json({ message: 'Email sent' })
  } catch (err) {
    console.error('Demo request email error:', err)
    return res.status(200).json({ message: 'Saved (email failed)' })
  }
}
