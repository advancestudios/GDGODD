module.exports = {
  // Cuántos jugadores se muestran en el Hardest (Top 1, Top 2, ...)
  TOP_SIZE: 5,
  // Título del mensaje (la estrella se agrega al lado)
  TITLE: 'Server Hardest',
  // Subtítulo bajo el título
  SUBTITLE: 'Top Players / Hardest',
  // Indicación para los miembros, al final del mensaje
  UPDATE_HINT: 'Para actualizar tu Hardest, usa `/update hardest` y sigue los pasos dentro del cuadro de Diálogo.',
  // Texto del pie del mensaje
  FOOTER_TEXT: '© Urugordos - 2026',
  // Valor que se muestra cuando un campo está vacío
  EMPTY: 'empty',

  // Emojis personalizados del bot (formato <:nombre:ID>)
  EMOJIS: {
    // Al lado del título
    star: '<:star:1561862697191088288>',
    // Al lado del nombre de cada puesto, en orden: Top 1, Top 2, Top 3, Top 4, Top 5.
    // Deja '' en los que todavía no tengas y pega aquí el emoji cuando lo consigas.
    top: [
      '<:top1:1561554988264857722>',
      '<:top2:1561554998364475432>',
      '<:top3:1561555007235432548>',
      '', // Top 4  <- pega aquí el emoji, ej: '<:top4:123456789012345678>'
      '', // Top 5  <- pega aquí el emoji, ej: '<:top5:123456789012345678>'
    ],
  },
};
