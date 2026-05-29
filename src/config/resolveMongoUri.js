import dns from 'node:dns/promises';

const PUBLIC_DNS = ['8.8.8.8', '8.8.4.4', '1.1.1.1'];

/**
 * Atlas uses mongodb+srv which requires a DNS SRV lookup. On some Windows/network
 * setups the system DNS refuses SRV queries (querySrv ECONNREFUSED). We resolve
 * SRV via public DNS and build a standard mongodb:// URI instead.
 */
export async function resolveMongoUri(uri) {
  if (!uri?.startsWith('mongodb+srv://')) {
    return uri;
  }

  if (process.env.MONGODB_URI_STANDARD) {
    return process.env.MONGODB_URI_STANDARD;
  }

  const match = uri.match(/^mongodb\+srv:\/\/(?:([^@]+)@)?([^/?]+)(\/[^?]*)?(\?.*)?$/);
  if (!match) {
    return uri;
  }

  const [, credentials, host, dbPath = '/secure-p2p-chat', query = ''] = match;
  const auth = credentials ? `${credentials}@` : '';

  dns.setServers(PUBLIC_DNS);

  try {
    const records = await dns.resolveSrv(`_mongodb._tcp.${host}`);
    if (!records.length) {
      throw new Error('No SRV records returned');
    }

    const hosts = records
      .sort((a, b) => a.priority - b.priority || b.weight - a.weight)
      .map((r) => `${r.name}:${r.port}`)
      .join(',');

    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
    if (!params.has('tls')) params.set('tls', 'true');
    if (!params.has('authSource')) params.set('authSource', 'admin');
    if (!params.has('retryWrites')) params.set('retryWrites', 'true');
    if (!params.has('w')) params.set('w', 'majority');

    const paramString = params.toString();
    return `mongodb://${auth}${hosts}${dbPath}${paramString ? `?${paramString}` : ''}`;
  } catch (err) {
    throw new Error(
      `MongoDB Atlas SRV lookup failed for "${host}" (${err.message}). ` +
        'Fix: In Atlas → Network Access, allow your IP (or 0.0.0.0/0 for dev). ' +
        'Or add MONGODB_URI_STANDARD in server/.env (Connect → Drivers → standard connection string).'
    );
  }
}
