// Netlify overwrites this value during production builds through netlify.toml.
// Keeping it empty preserves local development against http://localhost:8000.
window.SENTINEL_API_BASE = window.SENTINEL_API_BASE || "";
