// A short, synthetic Gemini generation check. Never prints the key or chat data.
// Used only on a temporary preview build, not on production or normal CI.
if (process.env.VERCEL_ENV !== 'preview') process.exit(0);
const key = process.env.GEMINI_API_KEY;
if (!key) { console.log('DOREMON_PROBE ' + JSON.stringify({ error: 'NO_KEY' })); process.exit(0); }
for (const model of ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']) {
  try {
    const generationConfig = { temperature: 0.9, maxOutputTokens: 512 };
    if (model.startsWith('gemini-2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    else { generationConfig.thinkingConfig = { thinkingLevel: 'low' }; generationConfig.maxOutputTokens = 1024; }
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: 'You are a warm and concise chat assistant. Answer the question directly.' }] }, contents: [{ role: 'user', parts: [{ text: 'Say hello in one short sentence.' }] }], generationConfig }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json();
    const answer = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? '').join('').trim();
    const violations = (data.error?.details ?? []).flatMap((d) => d.violations ?? []).map((v) => ({ quotaId: v.quotaId, quotaMetric: v.quotaMetric, quotaValue: v.quotaValue, model: v.quotaDimensions?.model }));
    console.log('DOREMON_PROBE ' + JSON.stringify({ model, status: res.status, success: res.ok && !!answer, answer: answer.slice(0, 120), finish: data.candidates?.[0]?.finishReason, googleStatus: data.error?.status, violations, retry: (data.error?.details ?? []).find((d) => d.retryDelay)?.retryDelay }));
  } catch (e) { console.log('DOREMON_PROBE ' + JSON.stringify({ model, error: e.name })); }
}
