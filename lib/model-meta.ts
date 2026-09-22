export interface ModelMeta {
  rawName: string;
  displayName: string;
  provider: string;
  family: 'openai' | 'anthropic' | 'deepseek' | 'grok' | 'google' | 'meta' | 'other';
  badgeClass: string;
  chipClass: string;
  barColor: string;
}

export function parseModelMeta(modelName: string): ModelMeta {
  const lower = modelName.toLowerCase();

  // Strip common provider prefixes for cleaner display
  let displayName = modelName;
  if (displayName.includes('/')) {
    displayName = displayName.split('/').pop() || displayName;
  }

  // Detect family & provider
  if (lower.includes('gpt') || lower.includes('codex') || lower.includes('o1') || lower.includes('o3') || lower.includes('davinci')) {
    return {
      rawName: modelName,
      displayName,
      provider: 'OpenAI',
      family: 'openai',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      chipClass: 'bg-emerald-100/70 text-emerald-800 border-emerald-200/80',
      barColor: '#059669', // emerald-600
    };
  }

  if (lower.includes('claude') || lower.includes('anthropic')) {
    return {
      rawName: modelName,
      displayName,
      provider: 'Anthropic',
      family: 'anthropic',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      chipClass: 'bg-amber-100/70 text-amber-900 border-amber-200/80',
      barColor: '#d97706', // amber-600
    };
  }

  if (lower.includes('deepseek')) {
    return {
      rawName: modelName,
      displayName,
      provider: 'DeepSeek',
      family: 'deepseek',
      badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
      chipClass: 'bg-sky-100/70 text-sky-800 border-sky-200/80',
      barColor: '#0284c7', // sky-600
    };
  }

  if (lower.includes('grok')) {
    return {
      rawName: modelName,
      displayName,
      provider: 'xAI',
      family: 'grok',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      chipClass: 'bg-indigo-100/70 text-indigo-800 border-indigo-200/80',
      barColor: '#4f46e5', // indigo-600
    };
  }

  if (lower.includes('gemini') || lower.includes('google')) {
    return {
      rawName: modelName,
      displayName,
      provider: 'Google',
      family: 'google',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      chipClass: 'bg-blue-100/70 text-blue-800 border-blue-200/80',
      barColor: '#2563eb', // blue-600
    };
  }

  if (lower.includes('llama') || lower.includes('meta')) {
    return {
      rawName: modelName,
      displayName,
      provider: 'Meta',
      family: 'meta',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
      chipClass: 'bg-purple-100/70 text-purple-800 border-purple-200/80',
      barColor: '#9333ea', // purple-600
    };
  }

  // Default / Other
  return {
    rawName: modelName,
    displayName,
    provider: modelName.includes('/') ? modelName.split('/')[0] : 'Custom',
    family: 'other',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    chipClass: 'bg-slate-100 text-slate-800 border-slate-200',
    barColor: '#64748b', // slate-500
  };
}

/** Formats numbers into human-readable compact notation (e.g. 9.58B, 627.8M, 42.4K) */
export function formatCompactNumber(n: number): string {
  if (!n || n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 1 : 2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  }
  if (abs >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toLocaleString('en-US');
}

/** Formats currency with clean decimal handling and standard negative formatting */
export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}
