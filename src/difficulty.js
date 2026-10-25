/**
 * Dificultades de Geometry Dash: nombre del nivel -> clave del icono, y comprobación de las permitidas en el Hardest.
 *
 * Los iconos son imágenes públicas (no emojis del bot), así que funcionan en cualquier servidor sin subir nada.
 * Si ese sitio dejara de funcionar, solo hay que cambiar ICON_BASE_URL.
 */

const { ALLOWED_DIFFICULTIES } = require('./config');

const ICON_BASE_URL = 'https://autonick.github.io/diff-faces/levels/none';

const ICON_KEYS = {
  Auto: 'auto',
  Easy: 'easy',
  Normal: 'normal',
  Hard: 'hard',
  Harder: 'harder',
  Insane: 'insane',
  'Easy Demon': 'easyDemon',
  'Medium Demon': 'mediumDemon',
  'Hard Demon': 'hardDemon',
  'Insane Demon': 'insaneDemon',
  'Extreme Demon': 'extremeDemon',
  NA: 'na',
};

/** Link de la carita de la dificultad, o null si no se conoce */
function difficultyIconUrl(difficulty) {
  const key = ICON_KEYS[difficulty];
  return key ? `${ICON_BASE_URL}/${key}/none/none.png` : null;
}

/**
 * ¿Se acepta este nivel en el Hardest?
 * Si la dificultad no se pudo determinar (null) se deja pasar: el staff la ve en la revisión.
 */
function isAllowedDifficulty(difficulty) {
  if (!difficulty) return true;
  return ALLOWED_DIFFICULTIES.includes(difficulty);
}

module.exports = { difficultyIconUrl, isAllowedDifficulty, ICON_KEYS };
