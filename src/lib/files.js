export function downloadTextFile(content, filename, type = 'text/markdown;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      finish(resolve, duration);
    };
    video.onerror = () => finish(reject, new Error('无法读取视频元信息，请确认文件没有损坏'));
    video.src = url;
    setTimeout(() => finish(reject, new Error('读取视频超时，请尝试较小的文件')), 20000);
  });
}

export function isVideoFile(file) {
  if (!file) return false;
  if (file.type?.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v|ogv|mkv)$/i.test(file.name || '');
}

export function isSubtitleFile(file) {
  return /\.(srt|vtt)$/i.test(file?.name || '');
}
