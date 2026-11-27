import sanitizeHtmlLib from 'sanitize-html';

const OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'div', 'span',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code',
    'a',
  ],
  // rel/target are set by the transform below, never taken from the source.
  allowedAttributes: { a: ['href', 'rel', 'target'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed'],
  transformTags: {
    a: sanitizeHtmlLib.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
  },
};

/**
 * Plain text of (already sanitized) HTML, with every tag stripped, for phrase matching.
 * A space is put before each tag so adjacent blocks (`</li><li>`) do not run words together.
 */
export function htmlToText(html: string): string {
  return sanitizeHtmlLib(html.replace(/</g, ' <'), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}

/** The one allowlist sanitizer for stored `descriptionHtml` (AD-3). */
export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, OPTIONS);
}
