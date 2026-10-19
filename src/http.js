/**
 * Petición HTTP con timeout y un reintento (corte de red, timeout o servidor saturado).
 * Devuelve { status, body } con el body siempre como texto.
 */

const TIMEOUT_MS = 5000;
const ATTEMPTS = 2;
const RETRY_DELAY_MS = 600;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, { method = 'GET', body, headers = {} } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: { Accept: 'application/json', 'User-Agent': 'bot-gd-urugodd (Discord bot)', ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();

      if (RETRY_STATUSES.has(res.status) && attempt < ATTEMPTS) {
        lastError = new Error(`HTTP ${res.status}`);
      } else {
        return { status: res.status, body: text };
      }
    } catch (err) {
      lastError = err; // timeout o corte de red
    }
    if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  throw lastError;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

module.exports = { request, parseJson };
