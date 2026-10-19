const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  escapeMarkdown,
} = require('discord.js');
const { TOP_SIZE, FOOTER_TEXT, EMPTY } = require('./config');

// Discord permite como máximo 4000 caracteres de texto sumando todos los bloques de un mensaje
const MAX_TEXT = 3900;

const code = (value) => `\`${String(value).replaceAll('`', "'")}\``;
const plainOrEmpty = (value) => (value ? escapeMarkdown(String(value)) : code(EMPTY));
const codeOrEmpty = (value) => code(value || EMPTY);
// Los paréntesis rompen el link en Markdown, así que se codifican
const safeUrl = (url) => url.replaceAll('(', '%28').replaceAll(')', '%29');

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

function playerBlock(player, position) {
  const video = player.video ? `[Ver Video](${safeUrl(player.video)})` : code(EMPTY);
  // Se muestra el Username de GD; si no lo pusieron, el nombre del miembro del servidor
  const displayName = player.gdName || player.name;
  return [
    `### #${position} - ${escapeMarkdown(displayName)}`,
    `• **Nivel:** ${plainOrEmpty(player.level)}`,
    `• **Top:** ${Number.isFinite(player.top) ? player.top : code(EMPTY)}`,
    `• **ID:** ${codeOrEmpty(player.levelId)}`,
    `• **Peor Fallo:** ${codeOrEmpty(player.worstFail)}`,
    `• **Completion >>** ${video}`,
  ].join('\n');
}

const text = (content) => new TextDisplayBuilder().setContent(content);
const line = (spacing) => new SeparatorBuilder().setDivider(true).setSpacing(spacing);
const gap = (spacing) => new SeparatorBuilder().setDivider(false).setSpacing(spacing);

function buildContents(ranked) {
  const header = ['# Server Hardest <:gdestrella:1502175422014689454>', '-# Top Players / Hardest'];
  const body = ranked.length
    ? ranked.map((p, i) => playerBlock(p, i + 1))
    : ['*Todavía no hay nadie en el Hardest. ¡Sé el primero!*'];
  const footer = [
    '-# Para actualizar tu Hardest, usa `/update hardest` y sigue los pasos dentro del cuadro de Diálogo.',
    `-# ${FOOTER_TEXT}`,
  ];
  return { header, body, footer };
}

/**
 * Mensaje en Components V2: un contenedor SIN color de acento (así no sale la franja lateral).
 * Se muestran los mejores TOP_SIZE jugadores en el mismo formato (#1, #2, ...).
 */
function buildHardestPayload(players) {
  const ranked = rank(players);
  let shown = Math.min(TOP_SIZE, ranked.length);

  // Seguro por si los textos (links largos, etc.) pasaran del límite de Discord
  let parts = buildContents(ranked.slice(0, shown));
  const size = (p) => [...p.header, ...p.body, ...p.footer].join('').length;
  while (shown > 1 && size(parts) > MAX_TEXT) {
    shown -= 1;
    parts = buildContents(ranked.slice(0, shown));
  }

  const container = new ContainerBuilder(); // sin setAccentColor => sin barra de color
  container.addTextDisplayComponents(...parts.header.map(text));
  container.addSeparatorComponents(line(SeparatorSpacingSize.Small));

  parts.body.forEach((block, i) => {
    if (i > 0) container.addSeparatorComponents(gap(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(text(block));
  });

  container.addSeparatorComponents(line(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(...parts.footer.map(text));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = { buildHardestPayload, rank };
