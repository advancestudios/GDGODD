/**
 * Vinculación de la cuenta de Geometry Dash con el usuario de Discord (sin contraseñas):
 *  1) El miembro escribe su username de GD.
 *  2) El bot le da un código único y el miembro lo publica como comentario en su perfil de GD.
 *     (solo el dueño de la cuenta puede comentar en su propio perfil)
 *  3) Al pulsar "Verificar", el bot lee los comentarios del perfil y, si ve el código, vincula la cuenta.
 */
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  escapeMarkdown,
} = require('discord.js');
const store = require('./hardestStore');
const sessions = require('./linkSessions');
const { findAccountByName, profileHasCode, AccountLookupError } = require('./gdAccount');

const LINK_MODAL_ID = 'gd_link_modal';
const VERIFY_ID = 'gd_verify';
const CANCEL_ID = 'gd_cancel';

/** Paso 1: cuadro de diálogo para escribir el username de GD */
function showLinkModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(LINK_MODAL_ID)
    .setTitle('Vincular mi cuenta de GD')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('gdName')
          .setLabel('Tu username de Geometry Dash')
          .setPlaceholder('Escríbelo exactamente como sale en el juego')
          .setStyle(TextInputStyle.Short)
          .setMinLength(3)
          .setMaxLength(20)
          .setRequired(true),
      ),
    );
  return interaction.showModal(modal);
}

function buttons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(VERIFY_ID).setLabel('Verificar').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(CANCEL_ID).setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
  );
}

/** Paso 2: instrucciones con el código (y un aviso opcional debajo) */
function verifyMessage(session, note = '') {
  const lines = [
    `🔐 **Verifica que la cuenta es tuya** — ${escapeMarkdown(session.name)}`,
    '',
    '**1.** Abre tu perfil en Geometry Dash.',
    '**2.** Publica un comentario en tu perfil con este código exacto:',
    `\`\`\`${session.code}\`\`\``,
    '**3.** Vuelve aquí y pulsa **Verificar**.',
    '',
    `-# El código vence <t:${Math.floor(session.expiresAt / 1000)}:R>. Cuando termines puedes borrar el comentario.`,
  ];
  if (note) lines.push('', note);
  return { content: lines.join('\n'), components: [buttons()] };
}

/** Recibe el username, busca la cuenta y crea el código de verificación */
async function handleLinkModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (store.getAccount(interaction.user.id)) {
    return interaction.editReply('✅ Ya tienes una cuenta vinculada. Si quieres cambiarla, usa `/gd desvincular` primero.');
  }

  const name = interaction.fields.getTextInputValue('gdName').trim();
  if (name.length < 3) return interaction.editReply('❌ Escribe tu username completo de Geometry Dash.');

  let account;
  try {
    account = await findAccountByName(name);
  } catch (err) {
    if (!(err instanceof AccountLookupError)) console.error('[linkFlow] Error buscando la cuenta:', err);
    return interaction.editReply('⚠️ No pude consultar las cuentas de Geometry Dash en este momento. Intenta de nuevo en un minuto.');
  }

  if (!account) {
    return interaction.editReply(
      `❌ No encontré ninguna cuenta con el username **${escapeMarkdown(name)}**. Escríbelo exactamente como sale en el juego (y revisa que tengas cuenta registrada, no solo un perfil local).`,
    );
  }

  const owner = store.findOwnerOfAccount(account.accountId);
  if (owner && owner !== interaction.user.id) {
    return interaction.editReply(
      '❌ Esa cuenta de GD ya está vinculada a otro miembro del servidor. Si es tuya, avisa al staff para que la desvincule.',
    );
  }

  const session = sessions.create(interaction.user.id, account);
  return interaction.editReply(verifyMessage(session));
}

/** Botones "Verificar" y "Cancelar" */
async function handleButton(interaction) {
  const userId = interaction.user.id;

  if (interaction.customId === CANCEL_ID) {
    sessions.remove(userId);
    return interaction.update({ content: '❎ Vinculación cancelada. Cuando quieras, usa `/update hardest` para empezar de nuevo.', components: [] });
  }

  const session = sessions.get(userId);
  if (!session) {
    return interaction.update({
      content: '⌛ El código venció o no hay una vinculación en curso. Usa `/update hardest` para empezar de nuevo.',
      components: [],
    });
  }

  const wait = sessions.cooldownLeft(session);
  if (wait > 0) {
    return interaction.update(verifyMessage(session, `⏳ Espera **${Math.ceil(wait / 1000)} s** antes de volver a verificar.`));
  }

  await interaction.deferUpdate();
  session.lastCheck = Date.now();

  let found;
  try {
    found = await profileHasCode(session.accountId, session.code);
  } catch (err) {
    if (!(err instanceof AccountLookupError)) console.error('[linkFlow] Error leyendo el perfil:', err);
    return interaction.editReply(verifyMessage(session, '⚠️ No pude leer tu perfil en este momento. Intenta de nuevo en un momento.'));
  }

  if (!found) {
    return interaction.editReply(
      verifyMessage(
        session,
        '❌ Todavía no veo el código en tu perfil. Publícalo como comentario y vuelve a pulsar **Verificar** (puede tardar unos segundos en aparecer).',
      ),
    );
  }

  const result = store.linkAccount(userId, { accountId: session.accountId, gdName: session.name });
  sessions.remove(userId);

  if (!result.ok) {
    return interaction.editReply({ content: '❌ Esa cuenta de GD acaba de vincularse a otro miembro. Avisa al staff si es tuya.', components: [] });
  }

  return interaction.editReply({
    content: `✅ ¡Cuenta vinculada! Ahora apareces en el Hardest como **${escapeMarkdown(session.name)}**.\nUsa \`/update hardest\` otra vez para cargar tu nivel.`,
    components: [],
  });
}

const isLinkButton = (interaction) =>
  interaction.isButton() && (interaction.customId === VERIFY_ID || interaction.customId === CANCEL_ID);

module.exports = { showLinkModal, handleLinkModal, handleButton, isLinkButton, LINK_MODAL_ID, VERIFY_ID, CANCEL_ID };
