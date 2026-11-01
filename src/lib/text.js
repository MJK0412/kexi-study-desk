export async function convertTextsToSimplified(texts) {
  const source = Array.isArray(texts) ? texts.map((text) => String(text ?? '')) : [];
  if (!source.length) return source;
  try {
    const response = await fetch('/api/text/t2s', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: source }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data.texts) || data.texts.length !== source.length) return null;
    return data.texts.map((text, index) => String(text ?? source[index]));
  } catch {
    return null;
  }
}

export function textsDiffer(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return true;
  return left.some((text, index) => String(text) !== String(right[index]));
}
