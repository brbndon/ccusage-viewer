"use client";

import { useState } from "react";

export const INSTALL_COMMAND = "npm install";

interface Props {
  detail?: string;
  checking: boolean;
  onRecheck: () => void;
}

export default function SetupBanner({ detail, checking, onRecheck }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable; the command stays selectable on screen.
    }
  }

  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-xs"
    >
      <p className="font-bold">ccusage isn&apos;t installed yet</p>
      <p className="mt-1 text-xs text-amber-800">
        This viewer runs the <code>ccusage</code> CLI that ships with its npm
        dependencies. In the project folder, run the command below, then check
        again. Scanning is disabled until it is found.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="select-all rounded-md border border-amber-200 bg-white px-3 py-1.5 font-mono text-xs text-slate-800">
          {INSTALL_COMMAND}
        </code>
        <button
          type="button"
          onClick={copy}
          className="btn-press rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={onRecheck}
          disabled={checking}
          className="btn-press rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check again"}
        </button>
      </div>
      {detail && (
        <p className="mt-2 break-words font-mono text-[11px] text-amber-700">
          {detail}
        </p>
      )}
    </div>
  );
}
