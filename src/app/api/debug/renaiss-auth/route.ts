import { NextResponse } from "next/server";

/**
 * Temporary diagnostic: exposes what authHeaders() would produce right now,
 * in THIS running process — masked, no secret exposed — to check whether
 * it's ever inconsistent (missing key/secret) independent of any network
 * call or rate limit. Safe to hit repeatedly; remove once the Renaiss
 * auth-dropout investigation is closed.
 */
export async function GET() {
  const key = process.env.RENAISS_API_KEY ?? process.env["X-Api-Key"];
  const secret = process.env.RENAISS_API_SECRET ?? process.env["X-Api-Secret"];
  return NextResponse.json({
    time: new Date().toISOString(),
    pid: process.pid,
    keyPresent: !!key,
    keyFingerprint: key ? `${key.slice(0, 6)}…${key.slice(-4)} (len ${key.length})` : null,
    secretPresent: !!secret,
    secretLen: secret ? secret.length : null,
  });
}
