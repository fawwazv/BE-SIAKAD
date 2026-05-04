// src/middlewares/sanitizeMiddleware.js
// ═══════════════════════════════════════════════
// DATA SANITIZATION MIDDLEWARE
// Prevents XSS & SQL injection via input cleaning
// ═══════════════════════════════════════════════

/**
 * HTML special character map for escaping
 */
const escapeMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
};

const escapeRegex = /[&<>"']/g;
const CMS_HTML_TAGS = new Set(['p', 'div', 'ol', 'ul', 'li', 'strong', 'em', 'u', 'a', 'br']);
const CMS_ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify']);

/**
 * Escape HTML special characters in a string
 */
const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(escapeRegex, (char) => escapeMap[char]);
};

const escapeCmsText = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&(?!amp;|lt;|gt;|quot;|#39;|#x27;|nbsp;)/gi, '&amp;')
    .replace(/[<>"']/g, (char) => escapeMap[char]);
};

const escapeHtmlAttribute = (str) => escapeHtml(str).replace(/`/g, '&#x60;');

const isSafeHref = (href) => {
  const value = `${href}`.trim();
  if (!value) return false;
  if (/^(javascript|data|vbscript):/i.test(value)) return false;
  return /^(https?:|mailto:|tel:)/i.test(value) || /^[a-z0-9.-]+\.[a-z]{2,}/i.test(value);
};

const sanitizeCmsTag = (rawTag) => {
  const tagMatch = rawTag.match(/^<\s*(\/?)\s*([a-z0-9]+)([\s\S]*?)\/?\s*>$/i);
  if (!tagMatch) return escapeHtml(rawTag);

  const isClosing = tagMatch[1] === '/';
  const tagName = tagMatch[2].toLowerCase();
  const attrs = tagMatch[3] || '';

  if (!CMS_HTML_TAGS.has(tagName)) return '';
  if (tagName === 'br') return '<br>';
  if (isClosing) return `</${tagName}>`;

  const safeAttrs = [];
  if (tagName === 'a') {
    const hrefMatch = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i);
    const href = hrefMatch?.[2]?.trim();
    if (href && isSafeHref(href)) {
      safeAttrs.push(`href="${escapeHtmlAttribute(href)}"`);
    }
  }

  if (tagName === 'p' || tagName === 'div' || tagName === 'li') {
    const alignMatch = attrs.match(/\btext-align\s*:\s*([a-z]+)/i);
    const align = alignMatch?.[1]?.toLowerCase();
    if (align && CMS_ALIGN_VALUES.has(align)) {
      safeAttrs.push(`style="text-align:${align}"`);
    }
  }

  return `<${tagName}${safeAttrs.length ? ` ${safeAttrs.join(' ')}` : ''}>`;
};

const sanitizeCmsHtml = (value) => {
  if (typeof value !== 'string') return value;

  const withoutDangerousBlocks = value
    .trim()
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');

  let sanitized = '';
  let cursor = 0;
  const tagRegex = /<[^>]+>/g;
  for (const match of withoutDangerousBlocks.matchAll(tagRegex)) {
    sanitized += escapeCmsText(withoutDangerousBlocks.slice(cursor, match.index));
    sanitized += sanitizeCmsTag(match[0]);
    cursor = match.index + match[0].length;
  }
  sanitized += escapeCmsText(withoutDangerousBlocks.slice(cursor));
  return sanitized;
};

const shouldPreserveCmsContent = (req) => {
  const method = req.method?.toUpperCase();
  const url = req.originalUrl || req.url || '';
  return (method === 'POST' || method === 'PUT') && /^\/api\/cms(?:\/|$)/.test(url);
};

/**
 * Recursively sanitize an object's string values
 */
const sanitizeObject = (obj, options = {}) => {
  if (typeof obj === 'string') {
    return escapeHtml(obj.trim());
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, options));
  }
  if (obj !== null && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (options.preserveCmsContent && key === 'content') {
        sanitized[key] = sanitizeCmsHtml(value);
      } else {
        sanitized[key] = sanitizeObject(value, options);
      }
    }
    return sanitized;
  }
  return obj;
};

/**
 * Sanitize Request Body
 * 
 * Escapes HTML special characters in all string values
 * in req.body to prevent XSS injection.
 * 
 * Does NOT sanitize password fields (they should be hashed anyway).
 */
const sanitizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    // Preserve password as-is (will be hashed)
    const password = req.body.password;
    req.body = sanitizeObject(req.body, {
      preserveCmsContent: shouldPreserveCmsContent(req),
    });
    if (password !== undefined) {
      req.body.password = password;
    }
  }
  next();
};

/**
 * Sanitize Query Params
 * 
 * Escapes HTML in query string parameters
 */
const sanitizeQuery = (req, res, next) => {
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
};

/**
 * Sanitize Route Params
 * 
 * Escapes HTML in route parameters
 */
const sanitizeParams = (req, res, next) => {
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  next();
};

/**
 * Combined sanitizer — body + query + params
 * Use this as a single global middleware
 */
const sanitizeAll = (req, res, next) => {
  // Sanitize body (preserve password)
  if (req.body && typeof req.body === 'object') {
    const password = req.body.password;
    req.body = sanitizeObject(req.body, {
      preserveCmsContent: shouldPreserveCmsContent(req),
    });
    if (password !== undefined) {
      req.body.password = password;
    }
  }

  // Sanitize query
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  // Sanitize params
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }

  next();
};

module.exports = {
  sanitizeBody,
  sanitizeQuery,
  sanitizeParams,
  sanitizeAll,
  sanitizeCmsHtml,
};
