const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const store = require('../hardestStore');
const sessions = require('../linkSessions');
const { refreshHardest } = require('../hardestPublisher');
const { canManage } = require('../permissions');

// /gd cuenta [usuario]       -> muestra la cuenta de GD vinculada
// /gd desvincular [usuario]  -> quita la vinculación (y la entrada del Hardest)
// Con "usuario" solo puede el staff (Gestionar servidor) o los dueños del bot.
const data = new SlashCommandBuilder()
  .setName('gd')
  .setDescription('Tu cuenta de Geometry Dash vinculada')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('cuenta')
      .setDescription('Muestra la cuenta de Geometry Dash vinculada')
      .addUserOption((o) => o.setName('usuario').setDescription('(Staff) Ver la cuenta de otro miembro')),
  )
  .addSubcommand((sub) =>
    sub
      .setName('desvincular')
      .setDescription('Desvincula la cuenta de GD (también quita la entrada del Hardest)')
      .addUserOption((o) => o.setName('usuario').setDescription('(Staff) Desvincular a otro miembro')),
  );

async function execute(interaction) {
  const target = interaction.options.getUser('usuario') ?? interaction.user;

  if (target.id !== interaction.user.id && !canManage(interaction)) {
    return interaction.reply({
      content: '❌ Solo el staff con el permiso **Gestionar servidor** puede ver o desvincular la cuenta de otro miembro.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const self = target.id === interaction.user.id;
  const who = self ? 'No tienes' : `<@${target.id}> no tiene`;

  if (interaction.options.getSubcommand() === 'cuenta') {
    const account = store.getAccount(target.id);
    if (!account) {
      return interaction.reply({
        content: `${who} una cuenta de GD vinculada.${self ? ' Usa `/update hardest` para vincularla.' : ''}`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
    }
    return interaction.reply({
      content: `${self ? 'Tu cuenta' : `Cuenta de <@${target.id}>`}: **${account.gdName}** (ID de cuenta \`${account.accountId}\`), vinculada <t:${Math.floor(account.linkedAt / 1000)}:R>.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }

  // desvincular
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  sessions.remove(target.id);
  const had = store.unlinkAccount(target.id);
  if (!had) {
    return interaction.editReply({ content: `${who} una cuenta de GD vinculada.`, allowedMentions: { parse: [] } });
  }

  // Se redibuja el Hardest sin su entrada (si todavía no hay canal configurado, no pasa nada)
  const result = await refreshHardest(interaction.client);
  const note = result.ok || result.notConfigured ? '' : '\n⚠️ No pude actualizar el Hardest: se verá al siguiente `/update hardest`.';
  return interaction.editReply({
    content: `✅ ${self ? 'Tu cuenta quedó desvinculada' : `Cuenta de <@${target.id}> desvinculada`} y su entrada se quitó del Hardest.${note}`,
    allowedMentions: { parse: [] },
  });
}

module.exports = { data, execute };
