require('dotenv').config();
const pino = require('pino');

const cfg = {
  pack: process.env.STICKER_PACK || 'Sticker Bot',
  author: process.env.STICKER_AUTHOR || 'WhatsApp Bot',
  ownerNumber: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''), // contoh: 6281234567890
  brat: {
    bg: /^#[0-9a-f]{6}$/i.test(process.env.BRAT_BG || '') ? process.env.BRAT_BG : '#ffffff', // warna latar
    maxChars: 300,
    maxAnimChars: 200,
    maxAnimWords: 25,
  },
  maxVideoSeconds: Number(process.env.MAX_VIDEO_SECONDS) || 10,
  maxAnimatedBytes: 1000 * 1024, // stiker animasi > ~1MB sering gagal tampil di WhatsApp
  ai: {
    model: process.env.AI_MODEL || 'gemini-3.8-flash',
    // Dipakai otomatis jika model utama kena batas kuota (429). Kosongkan untuk menonaktifkan.
    fallbackModel: process.env.AI_FALLBACK_MODEL ?? 'gemini-3.5-flash-lite',
    // Opsional. Kosong = pakai bawaan model (gemini-3.8-flash: thinking medium, output maks 65.536 token).
    thinkingLevel: process.env.AI_THINKING_LEVEL || '', // low | medium | high (3.8 Flash tidak mendukung 'minimal')
    maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS) || 0,
    // Grounding with Google Search tidak tersedia di tier gratis untuk Gemini 3+ (butuh billing/tier berbayar)
    googleSearch: (process.env.AI_GOOGLE_SEARCH || 'false') === 'true',
    system:
      process.env.AI_SYSTEM_PROMPT ||
      'Kamu adalah asisten WhatsApp yang ramah, singkat, dan membantu. Jawab dalam bahasa yang sama dengan pengguna.',
    privateAuto: (process.env.AI_PRIVATE_AUTO || 'true') === 'true',
    maxTurns: 10, // setelah sekian giliran, percakapan dimulai baru agar konteks tidak terus membesar
    cooldownMs: 3000,
    timeoutMs: 90000,
  },
};

const logger = pino({ level: 'silent' });

const MENU = `🤖 *Sticker & AI Bot*

*Sticker*
• Kirim gambar / GIF / video dengan caption *.s*
• Atau balas (reply) media tersebut dengan *.s*
• Bentuk: *.s full* | *.s crop* | *.s circle* | *.s rounded*
• GIF/video maksimal ${cfg.maxVideoSeconds} detik

*Brat*
• *.brat <teks>* — stiker teks gaya brat
• *.bratvid <teks>* — brat animasi (kata muncul satu per satu)
• Bisa juga balas pesan teks dengan *.brat* / *.bratvid*

*AI*
• *.ai <pertanyaan>* — tanya AI
• *.ai on* / *.ai off* — mode AI otomatis (chat pribadi)
• *.ai reset* — hapus riwayat percakapan

• *.menu* — tampilkan menu ini`;

module.exports = { cfg, logger, MENU };
