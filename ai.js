const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const MAX_MESSAGES = 24;
const MAX_TEXT = 12000;
const REQUEST_TIMEOUT = 45000;

const configuredKey = () => String(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
const configuredModel = () => String(process.env.AI_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';

function baseURL() {
  const value = String(process.env.AI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function cleanMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_MESSAGES).flatMap(item => {
    if (!item || !['system', 'user', 'assistant'].includes(item.role)) return [];
    const content = String(item.content ?? '').trim().slice(0, MAX_TEXT);
    return content ? [{ role: item.role, content }] : [];
  });
}

function sendError(res, status, message) {
  return res.status(status).json({ error: { message } });
}

export function aiStatus() {
  return { configured: Boolean(configuredKey()), model: configuredModel() };
}

export async function aiRequest(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const mode = ['chat', 'code', 'image'].includes(body.mode) ? body.mode : 'chat';
  const key = String(body.apiKey || configuredKey()).trim();
  if (!key) return sendError(res, 503, 'The AI key is not configured. Set AI_API_KEY on the server or add a one-time key in the AI window.');

  const model = String(body.model || configuredModel()).trim().slice(0, 120) || configuredModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const image = mode === 'image';
  const url = `${baseURL()}/${image ? 'images/generations' : 'chat/completions'}`;
  const prompt = String(body.prompt || '').trim().slice(0, MAX_TEXT);
  const messages = cleanMessages(body.messages);

  if (image && !prompt) {
    clearTimeout(timeout);
    return sendError(res, 400, 'An image description is required.');
  }
  if (!image && !messages.length) {
    clearTimeout(timeout);
    return sendError(res, 400, 'A message is required.');
  }

  const payload = image
    ? { model, prompt, n: 1, size: '1024x1024' }
    : { model, messages, temperature: .7 };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: { message: text || 'The AI returned an unreadable response.' } }; }
    if (!response.ok) return res.status(response.status).json(data);
    return res.json(data);
  } catch (error) {
    return sendError(res, error.name === 'AbortError' ? 504 : 502, error.name === 'AbortError' ? 'The AI request timed out.' : 'The AI service could not be reached.');
  } finally {
    clearTimeout(timeout);
  }
}
