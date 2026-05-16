// Translates a map of fields to a target language using OpenRouter.
// Usage: const { translate } = require('./lib/translator');
//        const result = await translate({ 'hero-title': 'Scan smarter' }, 'Spanish');
//        result.ok     → true/false
//        result.fields → { 'hero-title': 'Escanea mejor' }
//        result.error  → string (only when ok: false)

'use strict';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4-5';

const SYSTEM_PROMPT =
  'You are a professional translation assistant. ' +
  'When given a JSON object, translate the values into the requested language. ' +
  'Return only valid JSON with the same keys and translated values. ' +
  'Do not translate keys. Do not add explanation or markdown formatting. ' +
  'If a value contains HTML tags (e.g. <span class="blue">text</span>, <br>, <strong>), ' +
  'preserve the HTML tags exactly and translate only the visible text content inside them. ' +
  'Keep all HTML attributes unchanged.';

async function translate(fields, targetLanguage) {
  if (!fields || Object.keys(fields).length === 0) {
    return { ok: true, fields: {} };
  }

  const userMessage =
    `Translate the values in this JSON object to ${targetLanguage}.\n\n` +
    JSON.stringify(fields, null, 2);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {
        'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: userMessage }
        ]
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error('OpenRouter error ' + res.status + ': ' + errText);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const translated = JSON.parse(jsonMatch[0]);
    return { ok: true, fields: translated };
  } catch (err) {
    return { ok: false, error: err.message, fields: {} };
  }
}

module.exports = { translate };
