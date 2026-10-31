export function formatTime(totalSeconds, { hours = 'auto', padHours = false } = {}) {
  const safe = Number.isFinite(Number(totalSeconds)) ? Math.max(0, Number(totalSeconds)) : 0;
  const whole = Math.floor(safe + 1e-6);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const showHours = hours === true || (hours === 'auto' && h > 0);

  if (showHours) {
    return `${padHours ? String(h).padStart(2, '0') : h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m ? `${m} 分钟` : ''}`.trim();
  if (m > 0) return `${m} 分钟`;
  return `${seconds} 秒`;
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDate(timestamp) {
  if (!timestamp) return '';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

export function shortText(text, maxLength = 28) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trimEnd()}…`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
