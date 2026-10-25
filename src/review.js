/**
 * Revisión del staff: si hay un canal de revisión configurado (/setup revision canal), las actualizaciones
 * del Hardest no se publican directo; llegan a ese canal con botones Aceptar / Rechazar.
 *  - Aceptar: se guardan los datos, se actualiza el Hardest y se avisa por DM al miembro.
 *  - Rechazar: se pide un motivo, no se cambia nada y se avisa por DM al miembro.
 * Sin canal de revisión todo funciona como antes (publicación directa).
 */
const crypto = require('node:crypto');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  escapeMarkdown,
} = require('discord.js');
const store = require('./hardestStore');
const { refreshHardest, describeError } = require('./hardestPublisher');
const { canManage } = require('./permissions');
const { difficultyIconUrl } = require('./difficulty');
const { EMPTY } = require('./config');

const ACCEPT_PREFIX = 'hardest_accept:';
const REJECT_PREFIX = 'hardest_reject:';
const REJECT_MODAL_PREFIX = 'hardest_reject_reason:';

const code = (value) => `\`${String(value).replaceAll('`', "'")}\``;
const codeOrEmpty = (value) => code(value || EMPTY);
const safeUrl = (url) => url.replaceAll('(', '%28').replaceAll(')', '%29');
const text = (content) => new TextDisplayBuilder().setContent(content);

/** Mensaje de revisión; con `status` (línea final) ya no lleva botones */
function buildReviewPayload(request, status = null) {
  const { player } = request;
  const lines = [
    `### ${request.isUpdate ? '🔄 Actualización del Hardest' : '🆕 Nuevo en el Hardest'}`,
    `<@${request.userId}> — **${escapeMarkdown(player.gdName || player.name)}** (ID de cuenta ${code(player.accountId)})`,
    '',
    `• **Nivel:** ${player.level ? escapeMarkdown(player.level) : code(EMPTY)}`,
    `• **Dificultad:** ${player.difficulty ? escapeMarkdown(player.difficulty) : code('desconocida')}`,
    `• **Top:** ${Number.isFinite(player.top) ? player.top : code(EMPTY)}`,
    `• **ID:** ${codeOrEmpty(player.levelId)}`,
    `• **Peor Fallo:** ${codeOrEmpty(player.worstFail)}`,
    `• **Completion >>** ${player.video ? `[Ver Video](${safeUrl(player.video)})` : code(EMPTY)}`,
  ];
  if (request.previous?.level) {
    lines.push('', `-# Antes: ${escapeMarkdown(request.previous.level)} (${request.previous.levelId || EMPTY})`);
  }
  lines.push(`-# Solicitud ${code(request.id)} · <t:${Math.floor(request.createdAt / 1000)}:R>`);

  const container = new ContainerBuilder();
  const iconUrl = difficultyIconUrl(player.difficulty);
  if (iconUrl) {
    container.addSectionComponents(
      new SectionBuilder().addTextDisplayComponents(text(lines.join('\n'))).setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl)),
    );
  } else {
    container.addTextDisplayComponents(text(lines.join('\n')));
  }

  if (status) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(text(status));
  } else {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${ACCEPT_PREFIX}${request.id}`).setLabel('Aceptar').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`${REJECT_PREFIX}${request.id}`).setLabel('Rechazar').setStyle(ButtonStyle.Danger).setEmoji('❌'),
      ),
    );
  }

  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

async function fetchReviewMessage(client, request) {
  if (!request.channelId || !request.messageId) return null;
  try {
    const channel = await client.channels.fetch(request.channelId);
    return await channel.messages.fetch(request.messageId);
  } catch {
    return null;
  }
}

/**
 * Envía la solicitud al canal de revisión. Si el miembro ya tenía una pendiente, se reemplaza.
 * @returns {Promise<{ok:true, request:object}|{ok:false, reason:string}>}
 */
async function submitForReview(interaction, player) {
  const client = interaction.client;
  const channelId = store.getReviewChannelId();

  const current = store.getPlayer(interaction.user.id);
  const request = {
    id: crypto.randomBytes(4).toString('hex'),
    userId: interaction.user.id,
    isUpdate: Boolean(current),
    previous: current ? { level: current.level, levelId: current.levelId } : null,
    player,
    channelId,
    messageId: null,
    createdAt: Date.now(),
  };

  let message;
  try {
    const channel = await client.channels.fetch(channelId);
    message = await channel.send(buildReviewPayload(request));
  } catch (err) {
    console.error('[review] No pude enviar la solicitud al canal de revisión:', err);
    return { ok: false, reason: describeError(err) };
  }

  request.messageId = message.id;
  const previous = store.putPending(request);
  if (previous) {
    const old = await fetchReviewMessage(client, previous);
    if (old) await old.delete().catch(() => {});
  }
  return { ok: true, request };
}

const isReviewButton = (interaction) =>
  interaction.isButton() && (interaction.customId.startsWith(ACCEPT_PREFIX) || interaction.customId.startsWith(REJECT_PREFIX));

const isRejectModal = (interaction) => interaction.isModalSubmit() && interaction.customId.startsWith(REJECT_MODAL_PREFIX);

const noPermission = (interaction) =>
  interaction.reply({
    content: '❌ Solo el staff con el permiso **Gestionar servidor** puede revisar solicitudes.',
    flags: MessageFlags.Ephemeral,
  });

const notFound = (interaction) =>
  interaction.reply({
    content: '⚠️ Esa solicitud ya no existe (puede que ya la hayan revisado o que el miembro desvinculara su cuenta).',
    flags: MessageFlags.Ephemeral,
  });

async function dm(client, userId, content) {
  try {
    const user = await client.users.fetch(userId);
    await user.send({ content, allowedMentions: { parse: [] } });
  } catch {
    /* DMs cerrados: no pasa nada */
  }
}

async function handleButton(interaction) {
  if (!canManage(interaction)) return noPermission(interaction);

  const accepting = interaction.customId.startsWith(ACCEPT_PREFIX);
  const requestId = interaction.customId.slice((accepting ? ACCEPT_PREFIX : REJECT_PREFIX).length);
  const request = store.getPending(requestId);
  if (!request) return notFound(interaction);

  if (!accepting) {
    const modal = new ModalBuilder()
      .setCustomId(`${REJECT_MODAL_PREFIX}${requestId}`)
      .setTitle('Rechazar solicitud')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Motivo (se le envía al miembro)')
            .setPlaceholder('Ej: el video no muestra la completion')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(400)
            .setRequired(true),
        ),
      );
    return interaction.showModal(modal);
  }

  await interaction.deferUpdate();

  // Se guarda primero y se quita de pendientes después: si algo falla no se pierde la solicitud
  store.upsertPlayer(request.player);
  store.removePending(requestId);
  const result = await refreshHardest(interaction.client);

  const note = result.ok ? '' : `\n⚠️ Quedó guardado, pero no pude actualizar el Hardest: ${result.reason}`;
  await interaction.message
    .edit(buildReviewPayload(request, `✅ **Aceptado** por <@${interaction.user.id}> <t:${Math.floor(Date.now() / 1000)}:R>${note}`))
    .catch(() => {});

  await dm(
    interaction.client,
    request.userId,
    `✅ **Tu Hardest fue aceptado** en **${interaction.guild?.name ?? 'el servidor'}**: ${request.player.level || 'sin nivel'}.${result.ok ? ` ${result.url}` : ''}`,
  );
}

async function handleRejectModal(interaction) {
  if (!canManage(interaction)) return noPermission(interaction);

  const requestId = interaction.customId.slice(REJECT_MODAL_PREFIX.length);
  const request = store.getPending(requestId);
  if (!request) return notFound(interaction);

  const reason = interaction.fields.getTextInputValue('reason').trim();
  await interaction.deferUpdate();
  store.removePending(requestId);

  await interaction.message
    .edit(buildReviewPayload(request, `❌ **Rechazado** por <@${interaction.user.id}> <t:${Math.floor(Date.now() / 1000)}:R>\n> ${reason.replaceAll('\n', '\n> ')}`))
    .catch(() => {});

  await dm(
    interaction.client,
    request.userId,
    `❌ **Tu actualización del Hardest fue rechazada** en **${interaction.guild?.name ?? 'el servidor'}**.\n> ${reason.replaceAll('\n', '\n> ')}\n-# Puedes corregirlo y volver a usar \`/update hardest\`.`,
  );
}

module.exports = { submitForReview, buildReviewPayload, isReviewButton, isRejectModal, handleButton, handleRejectModal };
