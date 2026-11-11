import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './markdown';

const html = (src: string) => render(<Markdown source={src} />).container.innerHTML;

describe('Markdown (policy pages)', () => {
  it('renders headings, paragraphs, lists, bold and safe links', () => {
    const out = html('# Title\n\nHello **world** and *you*.\nSecond line\n\n## Part\n- one\n- two with [site](https://example.com)\n\nMail [us](mailto:a@b.com)');
    expect(out).toContain('<h1');
    expect(out).toContain('<strong>world</strong>');
    expect(out).toContain('<em>you</em>');
    expect(out).toContain('<br>');
    expect(out.match(/<li>/g)).toHaveLength(2);
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('href="mailto:a@b.com"');
  });
  it('never turns owner text into HTML or script', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)>\n\n**<b>bold</b>**');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
    expect(out).not.toMatch(/<b>/);
  });
  it('drops unsafe link targets but keeps the words', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html;base64,AAAA', 'vbscript:x', 'file:///etc/passwd']) {
      const out = html(`Click [here](${bad}) now`);
      expect(out).not.toContain('<a');
      expect(out).not.toContain(bad.slice(0, 5) === 'javas' ? 'href' : '<a');
      expect(out).toContain('here');
    }
  });
});
