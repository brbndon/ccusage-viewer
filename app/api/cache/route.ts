import { NextRequest, NextResponse } from "next/server";
import { rejectUntrustedRequest } from "@/lib/ccusage-server";
import { isCacheRefreshing, readScanCache } from "@/lib/scan-cache";

export const dynamic = "force-dynamic";

/** The last saved scan, so the page can show usage without scanning. */
export async function GET(req: NextRequest) {
  const rejection = rejectUntrustedRequest(req);
  if (rejection) return rejection;

  return NextResponse.json(
    { cached: await readScanCache(), refreshing: isCacheRefreshing() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
