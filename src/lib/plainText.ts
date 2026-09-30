// Catalogue text (Google Books descriptions in particular) arrives as HTML:
// tags, <br>/<p> for line breaks and entities like &#39;. Pure, so the check
// scripts can run it.

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

function codePoint(n: number): string {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
}

/** Decode HTML entities (&#39; &#x2019; &amp; &eacute;…); unknown ones stay. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return codePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) || m;
    const named = NAMED[e.toLowerCase()];
    if (named) return named;
    // Latin letters with accents: &eacute; &Agrave; &ccedil; &ntilde; ...
    const acc = /^([a-z])(acute|grave|circ|uml|tilde|cedil|ring)$/i.exec(e);
    if (acc) {
      const mark = { acute: '́', grave: '̀', circ: '̂', uml: '̈', tilde: '̃', cedil: '̧', ring: '̊' }[acc[2].toLowerCase()];
      return (acc[1] + mark).normalize('NFC');
    }
    return m;
  });
}

/** HTML-ish catalogue text → plain text with paragraph breaks kept. */
export function plainText(s: string | undefined): string | undefined {
  if (!s) return s;
  const out = decodeEntities(
    s
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out || undefined;
}
