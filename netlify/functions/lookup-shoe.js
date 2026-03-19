exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let query;
  try {
    ({ query } = JSON.parse(event.body));
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  if (!query) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing query' }) };
  }

  const prompt = `You are a shoe fitting expert database. Given a shoe query, return structured fit data as JSON.

Query: "${query}"

Return ONLY valid JSON — no explanation, no markdown, no code fences — with this exact structure:
{
  "brand": "string",
  "model": "string",
  "category": "running|heels|boots|loafers|sandals|trainers|other",
  "lengthRange": [minMm, maxMm],
  "widths": {
    "standard": [minMm, maxMm]
  },
  "toeBoxShape": "tapered|round|square",
  "toeBoxDepth": "low|medium|high",
  "circumferenceRange": [minMm, maxMm],
  "heelCupDepth": "shallow|medium|deep",
  "archSupport": "neutral|mild|moderate|high",
  "fitNote": "brief sentence about this shoe's fit characteristics"
}

Rules:
- lengthRange is the internal shoe cavity length in mm spanning all available sizes (approx EU 35–48 / US 5–15)
- widths object should include any available width options: "narrow", "standard", "wide" — omit those not offered
- all measurements in millimetres
- if the shoe is genuinely unknown, return { "error": "Shoe not found or insufficient data" }`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY_FITFINDER2,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Claude API error:', err);
      return { statusCode: 502, body: JSON.stringify({ error: 'Upstream API error' }) };
    }

    const data = await response.json();
    const text = data.content[0].text.trim();

    // Strip code fences if Claude added them despite instructions
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

    let shoe;
    try {
      shoe = JSON.parse(cleaned);
    } catch (e) {
      // Try to extract a JSON object from the text
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Could not parse shoe data' }) };
      }
      shoe = JSON.parse(match[0]);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(shoe),
    };
  } catch (e) {
    console.error('Function error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
