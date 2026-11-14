export type DatePreset = "all" | "today" | "last7" | "last30" | "month";

export const DATE_PRESET_IDS: readonly DatePreset[] = ["all", "today", "last7", "last30", "month"];

function localDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function rangeForPreset(preset: DatePreset, now = new Date()): [string, string] {
  if (preset === "all") return ["", ""];

  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const since = new Date(until);
  if (preset === "last7") since.setDate(since.getDate() - 6);
  if (preset === "last30") since.setDate(since.getDate() - 29);
  if (preset === "month") since.setDate(1);

  const start = preset === "today" ? until : since;
  return [localDateValue(start), localDateValue(until)];
}
