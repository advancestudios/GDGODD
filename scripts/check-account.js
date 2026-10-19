// Diagnóstico de cuentas de GD, desde el servidor donde corre el bot.
// Uso:  npm run check-account -- "Username"          (busca la cuenta y lee su perfil)
//       npm run check-account -- "Username" URU-ABCD1234   (además comprueba si ese código está en sus comentarios)
const { sources, findAccountByName, AccountLookupError } = require('../src/gdAccount');

const [name, code] = process.argv.slice(2);
if (!name) {
  console.error('Uso: npm run check-account -- "Username" [CODIGO]');
  process.exit(1);
}

async function step(label, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    console.log(`✅ ${label.padEnd(34)} ${JSON.stringify(result)}  (${Date.now() - started} ms)`);
    return result;
  } catch (err) {
    console.log(`❌ ${label.padEnd(34)} FALLÓ: ${err.message}  (${Date.now() - started} ms)`);
    return undefined;
  }
}

(async () => {
  console.log(`\nCuenta "${name}"\n`);
  const official = await step('Servidores de GD: buscar cuenta', () => sources.findByNameOfficial(name));
  await step('GDBrowser: buscar cuenta', () => sources.findByNameGdBrowser(name));

  let account = official;
  if (!account) {
    try {
      account = await findAccountByName(name);
    } catch (err) {
      console.log(`\n➡️  Resultado final: ${err instanceof AccountLookupError ? 'no se pudo consultar ninguna fuente' : err.message}\n`);
      return;
    }
  }
  if (!account) {
    console.log('\n➡️  Resultado final: no existe una cuenta con ese username exacto\n');
    return;
  }

  console.log('');
  await step('Servidores de GD: datos por ID', () => sources.byIdOfficial(account.accountId));
  await step('GDBrowser: datos por ID', () => sources.byIdGdBrowser(account.accountId));
  const comments = await step('Servidores de GD: comentarios', () => sources.commentsOfficial(account.accountId));
  await step('GDBrowser: comentarios', () => sources.commentsGdBrowser(account.accountId));

  if (code && comments) {
    const found = comments.some((c) => c.toLowerCase().includes(code.toLowerCase()));
    console.log(`\n➡️  ¿Código ${code} en los comentarios? ${found ? 'SÍ ✅' : 'NO ❌'}\n`);
  } else {
    console.log('');
  }
})();
