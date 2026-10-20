const entities={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};

/** Escape plain text for HTML text and quoted attributes. */
export const escapeHtml=value=>String(value ?? '').replace(/[&<>"']/g,char=>entities[char]);
