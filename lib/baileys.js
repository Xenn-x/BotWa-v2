let cached;

// Memuat Baileys sekali saja. Kompatibel dengan Baileys v6 (CJS) dan v7 (ESM).
async function loadBaileys() {
  if (cached) return cached;
  const lib = await import('@whiskeysockets/baileys');
  const B = { ...(typeof lib.default === 'object' ? lib.default : {}), ...lib };
  B.makeWASocket = typeof lib.default === 'function' ? lib.default : lib.default?.default || lib.makeWASocket;
  cached = B;
  return B;
}

module.exports = { loadBaileys };
