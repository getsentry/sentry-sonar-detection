#!/usr/bin/env node
// Mint a device bearer token for Sentry Sonar.
//
//   node scripts/mint-token.mjs <room-id|"*"> <read|write>
//
// Prints the token ONCE (flash it into the device) and the wrangler command to
// insert its SHA-256 hash into D1. The plaintext token is never stored.
import { randomBytes, createHash } from 'node:crypto'

const [, , roomArg, scopeArg = 'read'] = process.argv

if (!roomArg || !['read', 'write'].includes(scopeArg)) {
  console.error('usage: node scripts/mint-token.mjs <room-id|"*"> <read|write>')
  process.exit(1)
}

const id = 'ss_' + randomBytes(4).toString('hex') // public token id (lookup key)
const secret = randomBytes(24).toString('base64url') // secret half
const token = `${id}.${secret}`
const hash = createHash('sha256').update(secret).digest('hex')
const roomSql = roomArg === '*' ? 'NULL' : `'${roomArg}'`
const label = `${roomArg} ${scopeArg}`
const now = Math.floor(Date.now() / 1000)

const insert =
  `INSERT INTO api_tokens (id, token_hash, room_id, scope, label, revoked, created_at) ` +
  `VALUES ('${id}', '${hash}', ${roomSql}, '${scopeArg}', '${label}', 0, ${now});`

console.log(`
TOKEN (shown once — give to the device):

  ${token}

Register it in D1 (local dev):

  wrangler d1 execute sentry_sonar --local --command "${insert}"

For production, use --remote instead of --local.
`)
