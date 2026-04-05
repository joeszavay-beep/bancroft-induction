/**
 * AI Snag Photo Analysis
 * Sends a construction defect photo to Claude Vision and returns
 * suggested trade, description, priority, and type.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'AI analysis not configured' })
  }

  const { image } = req.body // base64 data URL or base64 string

  if (!image) {
    return res.status(400).json({ error: 'No image provided' })
  }

  try {
    // Extract base64 data and media type
    let base64Data = image
    let mediaType = 'image/jpeg'

    if (image.startsWith('data:')) {
      const parts = image.split(',')
      base64Data = parts[1]
      const mimeMatch = parts[0].match(/data:(.*?);/)
      if (mimeMatch) mediaType = mimeMatch[1]
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: `You are a construction site defect analyst. Analyze this photo of a construction snag/defect and respond with ONLY a JSON object (no markdown, no explanation) with these fields:

{
  "trade": one of "Electrical", "Fire Alarm", "Sound Masking", "Pipework", "Ductwork", "BMS", "Other",
  "type": one of "General", "Installation", "Commissioning", "Design", "Other",
  "description": a clear, concise description of the defect in 1-2 sentences (professional construction language),
  "priority": one of "high", "medium", "low" based on safety risk and urgency,
  "confidence": "high", "medium", or "low" - how confident you are in the analysis
}

If the image is not a construction defect, set trade to "Other", type to "General", and describe what you see.`,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      console.error('Claude API error:', response.status, errBody)
      return res.status(500).json({ error: 'AI analysis failed' })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ''

    // Parse the JSON response
    try {
      // Handle cases where Claude wraps in markdown code blocks
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const analysis = JSON.parse(cleaned)
      return res.status(200).json({ analysis })
    } catch {
      // If JSON parsing fails, return the raw text
      return res.status(200).json({
        analysis: {
          trade: 'Other',
          type: 'General',
          description: text.slice(0, 200),
          priority: 'medium',
          confidence: 'low',
        },
      })
    }
  } catch (err) {
    console.error('Analyze snag error:', err)
    return res.status(500).json({ error: err.message })
  }
}
