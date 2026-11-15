import { NextRequest, NextResponse } from "next/server";
import { readActivityCache, refreshActivity } from "@/lib/activity";
import { cleanDetail, rejectUntrustedRequest } from "@/lib/ccusage-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * All-history daily usage for the activity graph. Serves the saved copy, and
 * builds one when none exists; `refresh=1` rebuilds it.
 */
export async function GET(req: NextRequest) {
  const rejection = rejectUntrustedRequest(req);
  if (rejection) return rejection;

  try {
    const forceRefresh = new URL(req.url).searchParams.get("refresh") === "1";
    const activity = (!forceRefresh && (await readActivityCache())) || (await refreshActivity());
    return NextResponse.json(activity, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: "Activity scan failed", detail: cleanDetail(err) },
      { status: 500 }
    );
  }
}
