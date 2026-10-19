const { PermissionFlagsBits } = require('discord.js');

/**
 * Dueños del bot: IDs de usuario separados por coma en la variable OWNER_IDS del .env
 * (ej: OWNER_IDS=123456789012345678,987654321098765432).
 * Los dueños pueden usar todos los comandos sin restricciones de permisos.
 */
function ownerIds() {
  return (process.env.OWNER_IDS || '')
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter((id) => /^\d{17,20}$/.test(id));
}

function isOwner(userId) {
  return ownerIds().includes(String(userId));
}

/** Puede configurar el bot: es dueño, o tiene el permiso "Gestionar servidor" en este servidor */
function canManage(interaction) {
  if (isOwner(interaction.user.id)) return true;
  return Boolean(interaction.inGuild() && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}

module.exports = { isOwner, canManage, ownerCount: () => ownerIds().length };
