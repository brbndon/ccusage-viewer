import { NextRequest, NextResponse } from "next/server";
import {
  isDateParam,
  isProviderSlug,
  isViewKey,
  normalizeDateParam,
  PROVIDERS,
  type ProviderSlug,
  VIEW_SUPPORT,
} from "@/lib/ccusage";
import { rejectUntrustedRequest } from "@/lib/ccusage-server";
import { executeScan, type ScanParams } from "@/lib/scan-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_PROVIDERS: ProviderSlug[] = PROVIDERS.filter(
  (p) => p !== "antigravity"
);

export async function GET(req: NextRequest) {
  const rejection = rejectUntrustedRequest(req);
  if (rejection) return rejection;

  const url = new URL(req.url);
  const viewRaw = url.searchParams.get("view") ?? "daily";
  const since = url.searchParams.get("since") ?? "";
  const until = url.searchParams.get("until") ?? "";
  const providersParam = url.searchParams.get("providers");

  if (!isViewKey(viewRaw)) {
    return NextResponse.json({ error: `Invalid view: ${viewRaw}` }, { status: 400 });
  }
  if (since && !isDateParam(since)) {
    return NextResponse.json({ error: `Invalid since: ${since}` }, { status: 400 });
  }
  if (until && !isDateParam(until)) {
    return NextResponse.json({ error: `Invalid until: ${until}` }, { status: 400 });
  }
  if (since && until && normalizeDateParam(since) > normalizeDateParam(until)) {
    return NextResponse.json(
      { error: `Invalid range: since ${since} is after until ${until}` },
      { status: 400 }
    );
  }

  const isAll = providersParam === "all";
  let requestedProviders: ProviderSlug[] = [];

  if (!isAll) {
    if (providersParam === null || providersParam === "") {
      requestedProviders = [...DEFAULT_PROVIDERS];
    } else {
      const rawSlugs = providersParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (rawSlugs.length === 0) {
        return NextResponse.json(
          { error: "No providers specified" },
          { status: 400 }
        );
      }
      const dedupedSlugs = Array.from(new Set(rawSlugs));
      for (const slug of dedupedSlugs) {
        if (!isProviderSlug(slug)) {
          return NextResponse.json(
            { error: `Unknown provider: ${slug}` },
            { status: 400 }
          );
        }
        requestedProviders.push(slug);
      }
    }

    // Validate view support against the requested providers
    for (const p of requestedProviders) {
      if (!VIEW_SUPPORT[p]?.includes(viewRaw)) {
        return NextResponse.json(
          { error: `view ${viewRaw} is not supported by provider ${p}` },
          { status: 400 }
        );
      }
    }
  }

  const scan: ScanParams = { view: viewRaw, since, until, isAll, requestedProviders };

  if (url.searchParams.get("stream") !== "1") {
    return executeScan(scan, req.signal);
  }

  // Streamed form: NDJSON progress events, then one terminal `result` or
  // `error` event carrying the same body/status the plain JSON form returns.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: object) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Client went away; the scan is aborted through req.signal.
        }
      };
      emit({
        type: "start",
        providers: isAll ? ["all"] : requestedProviders,
      });
      const res = await executeScan(scan, req.signal, (provider, ok, ms) =>
        emit({ type: "provider", provider, ok, ms })
      );
      const body = await res.json();
      emit(
        res.ok
          ? { type: "result", body }
          : { type: "error", status: res.status, body }
      );
      try {
        controller.close();
      } catch {
        // Already closed by a cancelled client.
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
