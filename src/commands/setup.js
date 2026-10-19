const { SlashCommandBuilder, InteractionContextType, ChannelType, MessageFlags } = require('discord.js');
const { setupHardest } = require('../hardestPublisher');
const { canManage } = require('../permissions');

// /setup embed hardest canal:#canal
// No se usa setDefaultMemberPermissions: Discord ocultaría el comando incluso a los dueños del bot.
// El permiso (Gestionar servidor, o ser dueño por OWNER_IDS) se comprueba en el código.
const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Configuración del bot (solo staff)')
  .setContexts(InteractionContextType.Guild)
  .addSubcommandGroup((group) =>
    group
      .setName('embed')
      .setDescription('Configura los mensajes fijos del bot')
      .addSubcommand((sub) =>
        sub
          .setName('hardest')
          .setDescription('Establece el canal donde se envía y se actualiza el embed del Server Hardest')
          .addChannelOption((option) =>
            option
              .setName('canal')
              .setDescription('Canal donde estará el embed del Hardest')
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true),
          ),
      ),
  );

async function execute(interaction) {
  if (!canManage(interaction)) {
    return interaction.reply({
      content: '❌ Solo el staff con el permiso **Gestionar servidor** puede usar este comando.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (group === 'embed' && sub === 'hardest') return setupHardestEmbed(interaction);
}

async function setupHardestEmbed(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const picked = interaction.options.getChannel('canal', true);
  const channel = await interaction.guild.channels.fetch(picked.id).catch(() => null);
  if (!channel) {
    return interaction.editReply('❌ No pude acceder a ese canal. Revisa que el bot lo pueda ver.');
  }

  const result = await setupHardest(channel);
  if (!result.ok) {
    return interaction.editReply(`❌ No pude configurarlo: ${result.reason}`);
  }

  return interaction.editReply(
    `✅ Listo: el embed del **Server Hardest** quedó en ${channel} y ahí mismo se va a actualizar con \`/update hardest\`.\n${result.message.url}`,
  );
}

module.exports = { data, execute };
