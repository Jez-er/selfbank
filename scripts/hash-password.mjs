#!/usr/bin/env node
/**
 * Prints a bcrypt hash for AUTH_PASSWORD_HASH.
 *
 *   npm run hash-password -- 'my password'
 *   npm run hash-password            # prompts, so the password stays out of shell history
 */

import readline from "node:readline";
import process from "node:process";
import bcrypt from "bcryptjs";

const ROUNDS = 12;

async function readPassword() {
  const fromArgs = process.argv.slice(2).join(" ").trim();
  if (fromArgs) return fromArgs;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question("Password: ", resolve));
  rl.close();
  return answer.trim();
}

const password = await readPassword();
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, ROUNDS);
const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex");

// dotenv expands `$NAME` inside .env files, which would quietly eat the `$2b$12$`
// prefix of a bcrypt hash. Escaping the dollars is the documented fix, and the
// app un-escapes them on read, so the same value also works via `docker run -e`.
const escaped = hash.replaceAll("$", "\\$");

console.log("\nAdd these to your .env file:\n");
console.log(`AUTH_PASSWORD_HASH="${escaped}"`);
console.log(`AUTH_SECRET="${secret}"`);
console.log("\nPassing it to Docker directly instead? Use the unescaped hash:\n");
console.log(`  -e AUTH_PASSWORD_HASH='${hash}'`);
console.log("\n(AUTH_SECRET is printed for convenience - keep your existing one if you have one.)");
