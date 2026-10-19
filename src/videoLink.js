/**
 * Valida el link del video (Completion).
 *
 * El video se sube a un canal del propio servidor y se pega aquí uno de estos links:
 *  - Enlace del mensaje:   https://discord.com/channels/SERVIDOR/CANAL/MENSAJE   (recomendado, no caduca)
 *  - Enlace de multimedia: https://cdn.discordapp.com/attachments/... | https://media.discordapp.net/attachments/...
 *
 * Así no se promociona ningún canal externo dentro del servidor.
 */

const CDN_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const MESSAGE_HOSTS = new Set([
  'discord.com',
  'www.discord.com',
  'ptb.discord.com',
  'canary.discord.com',
  'discordapp.com',
]);

/**
 * @param {string} value   texto que escribió el usuario
 * @param {string|null} guildId  servidor donde se usa el comando (los links de mensaje deben ser de este servidor)
 * @returns {{ok:true, value:string, kind:'none'|'message'|'cdn'}|{ok:false, reason:'invalid'|'other-server'}}
 */
function parseVideoLink(value, guildId) {
  const text = (value || '').trim();
  if (!text || text.toLowerCase() === 'empty') return { ok: true, value: '', kind: 'none' };

  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'invalid' };

  const host = url.hostname.toLowerCase();

  if (CDN_HOSTS.has(host)) {
    if (!url.pathname.startsWith('/attachments/')) return { ok: false, reason: 'invalid' };
    return { ok: true, value: url.href, kind: 'cdn' };
  }

  if (MESSAGE_HOSTS.has(host)) {
    const match = url.pathname.match(/^\/channels\/(\d+)\/(\d+)\/(\d+)\/?$/);
    if (!match) return { ok: false, reason: 'invalid' };
    if (guildId && match[1] !== guildId) return { ok: false, reason: 'other-server' };
    return { ok: true, value: `https://discord.com/channels/${match[1]}/${match[2]}/${match[3]}`, kind: 'message' };
  }

  return { ok: false, reason: 'invalid' };
}

module.exports = { parseVideoLink };
