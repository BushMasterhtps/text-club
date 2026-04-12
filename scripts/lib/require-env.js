/**
 * Fail-fast helpers for local/CI scripts. Never use hardcoded credentials; set env vars instead.
 */

function requireEnv(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') {
    console.error(`Missing required environment variable: ${name}`);
    console.error(`Set it before running this script (e.g. export ${name}=... or use a .env loader).`);
    process.exit(1);
  }
  return String(v).trim();
}

module.exports = { requireEnv };
