const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { TITLE, TOP_SIZE, ALLOWED_DIFFICULTIES, FOOTER_TEXT } = require('../config');

const GUIDE_ID = 'help_guide';
const BACK_ID = 'help_back';

const data = new SlashCommandBuilder().setName('help').setDescription('Muestra los comandos del bot y cómo usarlos');

const text = (content) => new TextDisplayBuilder().setContent(content);
const divider = () => new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

const HOME = [
  '# 📖 Ayuda del bot',
  `-# Bot de Geometry Dash · ${TITLE}`,
].join('\n');

const COMMANDS = [
  '### Comandos disponibles',
  '• `/update hardest` — Vincula tu cuenta de GD (la primera vez) y actualiza tu Hardest.',
  '• `/gd cuenta` — Muestra tu cuenta de Geometry Dash vinculada.',
  '• `/gd desvincular` — Desvincula tu cuenta y te quita del Hardest.',
  '• `/help` — Muestra este mensaje.',
  '',
  '**Solo staff** (permiso *Gestionar servidor*):',
  '• `/setup embed hardest` — Elige el canal donde vive el mensaje del Hardest.',
  '• `/setup revision canal` — Activa la revisión del staff en un canal.',
  '• `/setup revision desactivar` — Desactiva la revisión (se publica directo).',
  '• `/send canal:` — Envía un mensaje del bot a un canal (modo normal o embed).',
  '• `/gd cuenta usuario:` y `/gd desvincular usuario:` — Ver o desvincular a otro miembro.',
].join('\n');

const GUIDE = [
  '# 📘 Cómo usar el bot',
  '### 1. Vincula tu cuenta de GD (solo la primera vez)',
  'Usa `/update hardest` y escribe tu **username de Geometry Dash**. El bot te da un código tipo `URU-XXXXXXXX`.',
  'Entra al juego, **publica ese código como comentario en tu perfil** y pulsa **Verificar**. Así se comprueba que la cuenta es tuya, sin contraseñas.',
  'Cuando termine, puedes borrar el comentario.',
  '### 2. Actualiza tu Hardest',
  'Con la cuenta vinculada, `/update hardest` abre un cuadro con 3 campos:',
  '• **ID del nivel** — solo el número. El bot busca solo el nombre y el Top (Pointercrate, AREDL y servidores de GD).',
  '• **Peor fallo** — por ejemplo `95% x2`.',
  '• **Link del video** — sube tu completion a un canal del servidor, haz clic derecho (o mantén pulsado) sobre el video y elige **Copiar enlace del mensaje**.',
  '### 3. Espera la revisión (si está activa)',
  'Si el staff tiene la revisión activada, tu actualización llega a un canal privado para que la **acepten o rechacen**. Te avisa el bot por mensaje privado con el resultado (y el motivo si la rechazan). Si no hay revisión, se publica al instante.',
  '### 4. Gestiona tu cuenta',
  '`/gd cuenta` muestra qué cuenta tienes vinculada y `/gd desvincular` la quita (también te saca del Hardest).',
  '### Cosas a tener en cuenta',
  `• Solo se aceptan niveles: **${ALLOWED_DIFFICULTIES.join(', ')}**.`,
  `• El Hardest muestra a los **${TOP_SIZE} mejores**; si varios tienen el mismo nivel salen juntos.`,
  '• Si el nivel no está en ninguna lista, el Top queda como `empty`.',
  '• Si el bot no puede consultar el nivel, no guarda nada: prueba de nuevo en un minuto.',
].join('\n');

const button = (id, label, emoji, style = ButtonStyle.Primary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);

// Sin setAccentColor: sin barra de color lateral, igual que el resto de mensajes del bot
function homePayload() {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(HOME))
    .addSeparatorComponents(divider())
    .addTextDisplayComponents(text(COMMANDS))
    .addSeparatorComponents(divider())
    .addActionRowComponents(new ActionRowBuilder().addComponents(button(GUIDE_ID, 'Cómo Usar', '📘')))
    .addTextDisplayComponents(text(`-# ${FOOTER_TEXT}`));
  return { components: [container] };
}

function guidePayload() {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text(GUIDE))
    .addSeparatorComponents(divider())
    .addActionRowComponents(new ActionRowBuilder().addComponents(button(BACK_ID, 'Atrás', '⬅️', ButtonStyle.Secondary)))
    .addTextDisplayComponents(text(`-# ${FOOTER_TEXT}`));
  return { components: [container] };
}

async function execute(interaction) {
  await interaction.reply({ ...homePayload(), flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
}

const isHelpButton = (interaction) =>
  interaction.isButton() && (interaction.customId === GUIDE_ID || interaction.customId === BACK_ID);

async function handleButton(interaction) {
  const payload = interaction.customId === GUIDE_ID ? guidePayload() : homePayload();
  await interaction.update(payload);
}

module.exports = { data, execute, handleButton, isHelpButton, homePayload, guidePayload, GUIDE_ID, BACK_ID };
