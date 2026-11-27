import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitize-html.js';

describe('sanitizeHtml', () => {
  it('drops script and style elements with their content', () => {
    const out = sanitizeHtml('<p>Hi</p><script>alert(1)</script><style>p{color:red}</style>');
    expect(out).toBe('<p>Hi</p>');
  });

  it('strips style, class and event-handler attributes', () => {
    const out = sanitizeHtml('<p style="color:red" class="x" onclick="evil()">Text</p>');
    expect(out).toBe('<p>Text</p>');
  });

  it('keeps paragraphs, lists, headings and http links', () => {
    const out = sanitizeHtml('<h2>Role</h2><ul><li>One</li></ul><p><a href="https://remotive.com/x" onclick="x()">Apply</a></p>');
    expect(out).toContain('<h2>Role</h2>');
    expect(out).toContain('<ul><li>One</li></ul>');
    expect(out).toContain('href="https://remotive.com/x"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).not.toContain('onclick');
  });

  it('removes javascript: hrefs and disallowed elements', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a><img src="https://a/b.png"><iframe src="https://e"></iframe>');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<iframe');
  });

  it('allows mailto links', () => {
    expect(sanitizeHtml('<a href="mailto:jobs@example.com">mail</a>')).toContain('href="mailto:jobs@example.com"');
  });
});
