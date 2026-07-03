if (typeof marked !== 'undefined') {
  marked.setOptions({
    gfm: true,
    breaks: false,
  });
}

function renderMarkdown(text) {
  if (!text) return '';

  const input = String(text);

  if (typeof marked === 'undefined') {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  const html = marked.parse(input);

  if (typeof DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }

  return html;
}
