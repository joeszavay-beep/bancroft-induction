// Rate limiting (in-memory)
const rateLimit = new Map()
const RATE_LIMIT = 30
const WINDOW = 60 * 60 * 1000

function checkRateLimit(identifier) {
  const now = Date.now()
  const userRequests = rateLimit.get(identifier) || []
  const recent = userRequests.filter(time => now - time < WINDOW)
  if (recent.length >= RATE_LIMIT) return false
  recent.push(now)
  rateLimit.set(identifier, recent)
  return true
}

const SYSTEM_PROMPT = `You are the Coresite.io help assistant. You help users of Coresite.io, a UK construction site compliance platform.

You know everything about these features:

1. RAMS & Document Sign-Off — Digital signatures with IP logging, timestamps, and PDF generation. Go to project > RAMS > Upload > Assign to workers > They sign via Worker Portal.

2. Snagging & Defects — Pin snags on drawings, attach photos, assign to trades, auto-chase overdue. Open drawing > Tap snag tool > Tap location > Fill details > Assign > Save.

3. Progress Drawings — Traffic-light markup on drawings. Green/amber/red lines for installation progress. Export to PDF.

4. QR Site Sign-In — Print QR poster for gate. Live headcount, fire muster, GPS, auto sign-out. Go to project settings > QR Sign-In > Print poster.

5. Daily Site Diary — Weather auto-fills, workforce count, deliveries, delays, incidents. Go to project > Daily Diary > Fill in > Save.

6. Inspection Checklists — Templates for void closure, fire stopping, pre-handover. Pass/fail with photos. Go to Inspections > Choose template > Walk and mark.

7. Worker Management — CSCS/ECS card verification, cert expiry alerts, UK postcode lookup. Go to Workers > Add Worker > Enter details.

8. Worker Portal — Operatives login on phone. Sign documents, view snags, chat with managers.

9. Site Chat — Real-time messaging. Photo sharing, quick templates for material requests.

10. 3D BIM Viewer — Upload IFC models, explore in 3D. X-ray mode, clipping, fly-to, commissioning, measurement tool.

11. Master Programme — Import Asta PDF as live Gantt chart. Click to update progress, CSV export.

12. DXF Programme Tracking — Upload DXF for baseline lengths, draw progress on PDF drawings.

13. Agency Labour Marketplace — Post requests for temp operatives, matching engine, auto-onboarding.

14. Agency Network — Connect preferred agencies, public or preferred-only request visibility.

RULES:
- Keep answers short — 2-4 sentences max unless they ask for detail
- Plain English — users are site managers and tradespeople
- "how do I..." questions get numbered steps
- Don't know? Say "contact support@coresite.io"
- Pricing? Say "contact sales@coresite.io"
- Never make up features`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const identifier = req.headers['x-forwarded-for'] || 'unknown'
  if (!checkRateLimit(identifier)) {
    return res.status(429).json({ error: "Too many questions! Try again in a minute, or email support@coresite.io." })
  }

  try {
    const { messages } = req.body
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages required' })
    }

    const recentMessages = messages.slice(-10)

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: recentMessages.map(m => ({ role: m.role, content: m.content })),
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic API error:', response.status, err)
      return res.status(500).json({ error: 'Failed to get response' })
    }

    const data = await response.json()
    const reply = data.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') || 'Sorry, I could not get a response.'

    return res.status(200).json({ reply })
  } catch (error) {
    console.error('Help chat error:', error)
    return res.status(500).json({ error: 'Failed to get response. Please try again.' })
  }
}
