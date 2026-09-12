/**
 * One real call to each configured pricing provider.
 *
 *   npm run check:llm
 *
 * Deliberately NOT part of the test suite: the free tier is roughly 1,000
 * requests a day shared with real sellers, and a non-deterministic model makes
 * a flaky test. Run this by hand after changing a key or the prompt.
 *
 * Prints the parsed estimate and what the rails would do with it, so a
 * hallucinated value is visible as the clamp that catches it.
 */

import { readFileSync } from 'node:fs';

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const TIMEOUT_MS = 12_000;

const SAMPLES = [
  { title: 'Dell 24 inch IPS monitor', category: 'electronics' },
  { title: 'IKEA study table, wooden', category: 'furniture' },
];

// Mirrors CATEGORY_BOUNDS in src/lib/pricing/constants.ts.
const BOUNDS = {
  electronics: { min: 200, max: 150000 },
  furniture: { min: 200, max: 40000 },
  books: { min: 50, max: 5000 },
  appliances: { min: 200, max: 60000 },
  other: { min: 50, max: 50000 },
};

function loadEnv(file = '.env.local') {
  const env = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0) env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

function prompt({ title, category }) {
  return [
    'You price second-hand items for a student marketplace on Indian university campuses (Delhi NCR).',
    '',
    'Estimate the BASE VALUE in INR of the item below. Work through these checks in order:',
    '',
    '1. Identify the item, and its model or tier if the title names one.',
    '2. Recall its approximate NEW retail price in India.',
    '3. Apply realistic second-hand depreciation for a student resale, not a dealer price.',
    '4. Assume the item is FULLY WORKING. Do not discount for condition.',
    '5. Anchor to what one student would actually pay another in cash, today, on campus.',
    '',
    `Item title: ${title}`,
    `Category: ${category}`,
  ].join('\n');
}

async function withTimeout(url, init) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

async function gemini(key, sample) {
  const started = Date.now();
  const res = await withTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt(sample) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              base_value_inr: { type: 'NUMBER' },
              confidence: { type: 'NUMBER' },
              reasoning: { type: 'STRING' },
            },
            required: ['base_value_inr', 'confidence', 'reasoning'],
          },
          temperature: 0.2,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  return { parsed: JSON.parse(text), ms: Date.now() - started };
}

async function groq(key, sample) {
  const started = Date.now();
  const res = await withTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Respond with JSON only: {"base_value_inr": number, "confidence": number, "reasoning": string}.',
        },
        { role: 'user', content: prompt(sample) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return {
    parsed: JSON.parse(body.choices[0].message.content),
    ms: Date.now() - started,
  };
}

const env = loadEnv();
console.log('\nPricing model check\n');

const providers = [
  ['Gemini', env.GEMINI_API_KEY, gemini],
  ['Groq', env.GROQ_API_KEY, groq],
];

let anyWorked = false;

for (const [name, key, call] of providers) {
  if (!key) {
    console.log(`  ${name}: no key set — skipped`);
    continue;
  }
  for (const sample of SAMPLES) {
    try {
      const { parsed, ms } = await call(key, sample);
      const bounds = BOUNDS[sample.category];
      const clamped = Math.round(Math.min(Math.max(parsed.base_value_inr, bounds.min), bounds.max));
      const flag = clamped !== Math.round(parsed.base_value_inr) ? '  <- CLAMPED by rails' : '';
      anyWorked = true;
      console.log(
        `  \x1b[32mok\x1b[0m  ${name} · ${sample.title}\n` +
          `      base ₹${parsed.base_value_inr.toLocaleString('en-IN')} → used ₹${clamped.toLocaleString('en-IN')}${flag}\n` +
          `      confidence ${parsed.confidence} · ${ms}ms\n` +
          `      "${parsed.reasoning}"`,
      );
    } catch (err) {
      console.log(`  \x1b[31mfail\x1b[0m  ${name} · ${sample.title}\n      ${err.message}`);
    }
  }
}

console.log(
  anyWorked
    ? '\nAt least one provider answered. The pricing panel will use live estimates.\n'
    : '\nNo provider answered. Pricing still works — it falls back to comparables,\nthen to category defaults — but every quote will be marked as an estimate.\n',
);
