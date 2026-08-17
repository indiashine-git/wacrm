#!/usr/bin/env node
// Prints a ready-to-run SQL INSERT for a new platform_admins row.
// Standalone (no TS runtime needed) — duplicates the hash format from
// src/lib/platform/admin-auth.ts ("<saltHex>:<hashHex>", scrypt)
// exactly, since that module can't be imported directly without a TS
// loader this repo doesn't otherwise need.
//
// Usage: node scripts/seed-platform-admin.mjs <email> <password>
// Then run the printed SQL against the self-hosted Supabase Postgres,
// e.g.:
//   ssh ... "docker exec -i supabase-db psql -U postgres" <<< '<SQL>'

import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const KEY_LEN = 64;

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/seed-platform-admin.mjs <email> <password>");
  process.exit(1);
}

const salt = randomBytes(16);
const derived = await scrypt(password, salt, KEY_LEN);
const hash = `${salt.toString("hex")}:${derived.toString("hex")}`;

console.log(
  `INSERT INTO platform_admins (email, password_hash) VALUES ('${email.replace(/'/g, "''")}', '${hash}');`
);
