import type { ReactNode } from 'react';

/**
 * A deliberately tiny Markdown renderer for the legal pages: headings, paragraphs, bullet lists, **bold**, *italic* and
 * links. Everything is turned into React elements (never HTML strings), so owner-written text can never inject markup or
 * script. Only https:, http: and mailto: links are allowed; anything else (javascript:, data:…) is shown as plain text.
 */
const SAFE_LINK = /^(https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+\.[^\s@]+)$/i;

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[1] !== undefined) out.push(<strong key={key}>{inline(m[1], key)}</strong>);
    else if (m[2] !== undefined) out.push(<em key={key}>{m[2]}</em>);
    else if (SAFE_LINK.test(m[4]!)) out.push(<a key={key} href={m[4]} target={m[4]!.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer nofollow" className="font-semibold text-forest underline">{m[3]}</a>);
    else out.push(m[3]); // unsafe link target: keep the words, drop the link
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  let para: string[] = []; let list: string[] = [];
  const flushPara = () => { if (para.length) { const k = `p${blocks.length}`; blocks.push(<p key={k} className="my-3 leading-relaxed">{para.flatMap((l, i) => [...(i ? [<br key={`${k}-b${i}`} />] : []), ...inline(l, `${k}-${i}`)])}</p>); para = []; } };
  const flushList = () => { if (list.length) { const k = `l${blocks.length}`; blocks.push(<ul key={k} className="my-3 list-disc space-y-1 pl-6">{list.map((l, i) => <li key={i}>{inline(l, `${k}-${i}`)}</li>)}</ul>); list = []; } };
  for (const raw of source.split('\n')) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const li = /^[-*]\s+(.*)$/.exec(line);
    if (h) {
      flushPara(); flushList();
      const level = h[1]!.length; const k = `h${blocks.length}`;
      blocks.push(level === 1 ? <h1 key={k} className="mb-2 mt-2 text-3xl font-bold">{inline(h[2]!, k)}</h1> : level === 2 ? <h2 key={k} className="mb-1 mt-6 text-xl font-bold">{inline(h[2]!, k)}</h2> : <h3 key={k} className="mb-1 mt-4 text-lg font-bold">{inline(h[2]!, k)}</h3>);
    } else if (li) { flushPara(); list.push(li[1]!); }
    else if (line.trim() === '') { flushPara(); flushList(); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return <>{blocks}</>;
}
