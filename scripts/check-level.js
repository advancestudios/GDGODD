// Diagnóstico: muestra qué responde cada fuente para un ID de nivel, desde el servidor donde corre el bot.
// Uso:  npm run check-level -- 86407629
const { sources, lookupLevel, LookupError } = require('../src/levelLookup');

const id = process.argv[2];
if (!id || !/^\d{1,12}$/.test(id)) {
  console.error('Uso: npm run check-level -- <ID del nivel>   (solo números)');
  process.exit(1);
}

const labels = {
  fromPointercrate: 'Pointercrate (Demon List)',
  fromAredl: 'AREDL',
  fromGdServers: 'Servidores oficiales de GD',
  fromGdBrowser: 'GDBrowser (respaldo)',
};

(async () => {
  console.log(`\nNivel ${id}\n`);
  for (const [fn, label] of Object.entries(labels)) {
    const started = Date.now();
    try {
      const result = await sources[fn](id);
      const ms = `${Date.now() - started} ms`;
      console.log(`✅ ${label.padEnd(28)} ${result ? JSON.stringify(result) : 'respondió: no encontrado'}  (${ms})`);
    } catch (err) {
      console.log(`❌ ${label.padEnd(28)} FALLÓ: ${err.message}  (${Date.now() - started} ms)`);
    }
  }

  try {
    const final = await lookupLevel(id);
    console.log(`\n➡️  Resultado final del bot: ${final ? JSON.stringify(final) : 'el nivel NO existe'}\n`);
  } catch (err) {
    console.log(`\n➡️  Resultado final del bot: ${err instanceof LookupError ? 'no se pudo confirmar (todas las fuentes fallaron)' : err.message}\n`);
  }
})();
