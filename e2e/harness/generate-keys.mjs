/**
 * Generates the RS256 keypair the browser suite signs its sessions with.
 * Regenerated per environment and never committed: a checked-in signing key is
 * a liability even in a test harness.
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

writeFileSync(path.join(dir, "jwt-private.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));

const jwk = publicKey.export({ format: "jwk" });
writeFileSync(
  path.join(dir, "jwks.json"),
  JSON.stringify({ keys: [{ ...jwk, alg: "RS256", use: "sig", kid: "qentrax-e2e" }] }, null, 2),
);
console.log("harness keys generated");
