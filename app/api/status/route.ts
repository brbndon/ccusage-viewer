import { NextRequest, NextResponse } from "next/server";
import {
  checkCcusage,
  detectProviders,
  rejectUntrustedRequest,
} from "@/lib/ccusage-server";

export const dynamic = "force-dynamic";

/** Cheap preflight so the UI can explain a missing ccusage before any scan. */
export async function GET(req: NextRequest) {
  const rejection = rejectUntrustedRequest(req);
  if (rejection) return rejection;

  try {
    const [{ engine }, detected] = await Promise.all([
      checkCcusage(),
      detectProviders(),
    ]);
    return NextResponse.json({ ok: true, engine, detected });
  } catch {
    return NextResponse.json({
      ok: false,
      detail: "The ccusage CLI was not found in node_modules.",
    });
  }
}
