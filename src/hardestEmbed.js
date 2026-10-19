const { EmbedBuilder, escapeMarkdown } = require('discord.js');
const { TOP_SIZE, FOOTER_TEXT, EMBED_COLOR, EMPTY } = require('./config');

const code = (value) => `\`${String(value).replaceAll('`', "'")}\``;
const plainOrEmpty = (value) => (value ? escapeMarkdown(String(value)) : code(EMPTY));
const codeOrEmpty = (value) => code(value || EMPTY);

/**
 * Ordena a los jugadores: el Top más bajo es el más duro (#1 = más difícil).
 * Quienes no tienen Top válido van al final, ordenados por actualización reciente.
 */
function rank(players) {
  return Object.values(players).sort((a, b) => {
    const aTop = Number.isFinite(a.top) ? a.top : Infinity;
    const bTop = Number.isFinite(b.top) ? b.top : Infinity;
    if (aTop !== bTop) return aTop - bTop;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

// Los paréntesis rompen el link en Markdown, así que se codifican
const safeUrl = (url) => url.replaceAll('(', '%28').replaceAll(')', '%29');

function playerBlock(player, position) {
  const video = player.video ? `[Ver Video](${safeUrl(player.video)})` : code(EMPTY);
  // Se muestra el Username de GD; si no lo pusieron, el nombre del miembro del servidor
  const displayName = player.gdName || player.name;
  return [
    `**#${position} - ${escapeMarkdown(displayName)}**`,
    `• **Nivel:** ${plainOrEmpty(player.level)}`,
    `• **Top:** ${Number.isFinite(player.top) ? player.top : code(EMPTY)}`,
    `• **ID:** ${codeOrEmpty(player.levelId)}`,
    `• **Peor Fallo:** ${codeOrEmpty(player.worstFail)}`,
    `• **Completion >>** ${video}`,
  ].join('\n');
}

function buildHardestEmbed(players) {
  const top = rank(players).slice(0, TOP_SIZE);

  const blocks = top.length
    ? top.map((p, i) => playerBlock(p, i + 1)).join('\n\n')
    : 'Todavía no hay nadie en el Hardest. ¡Sé el primero!';

  const description = [
    '**Top Players / Hardest**',
    '',
    blocks,
    '',
    'Para actualizar tu Hardest, usa `/update hardest` y sigue los pasos dentro del cuadro de Diálogo.',
  ].join('\n');

  return new EmbedBuilder()
    .setTitle('Server Hardest <:star:1561862697191088288>')
    .setDescription(description)
    .setColor(EMBED_COLOR)
    .setFooter({ text: FOOTER_TEXT });
}

module.exports = { buildHardestEmbed, rank };
