// Lee el Client Secret de Auth0 desde Supabase Vault usando el rol una_chat_backend.
// El rol solo puede ejecutar una_chat_private.get_auth0_client_secret(); no lee vault.* directamente.
// El secreto nunca se registra en logs: solo se devuelve a quien llama.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const CA_PATH = path.join(__dirname, 'supabase-root-2021-ca.pem');

// sslmode de la URI se ignora a favor de un objeto ssl explicito: TLS siempre con verificacion
// de certificado (CA raiz de Supabase) y de nombre de host.
function buildConfig(databaseUrl) {
  const url = new URL(databaseUrl);
  url.searchParams.delete('sslmode');
  return {
    connectionString: url.toString(),
    ssl: { ca: fs.readFileSync(CA_PATH, 'utf8'), rejectUnauthorized: true },
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000
  };
}

async function getAuth0ClientSecret(databaseUrl) {
  if (!databaseUrl) {
    throw new Error('VAULT_DATABASE_URL no esta definida');
  }
  const client = new Client(buildConfig(databaseUrl));
  await client.connect();
  try {
    const res = await client.query('select una_chat_private.get_auth0_client_secret() as secret');
    const secret = res.rows[0] && res.rows[0].secret;
    if (!secret) throw new Error('Vault devolvio un secreto vacio');
    return secret;
  } finally {
    await client.end().catch(function () {});
  }
}

module.exports = { getAuth0ClientSecret };
