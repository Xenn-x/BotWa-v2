const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { cfg } = require('../config');

/* ───────────── State ───────────── */
const STATE_FILE = path.join(__dirname, '..', 'data', 'ai-state.json');
let aiState = {}; // jid -> true/false (mode AI otomatis per chat pribadi)
try {
  aiState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
} catch {}
const saveState = () => {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(aiState));
};
const history = new Map(); // userId -> Step[] ({ role: 'user' | 'model', parts: [{ text }] })
const lastAsk = new Map(); // userId -> timestamp (anti-spam)

/* ───────────── Gemini API ───────────── */
let gemini;
const getGemini = () => (gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));

const textStep = (role, text) => ({ role, parts: [{ text }] });

// Simpan hanya N langkah terakhir, dan riwayat harus selalu diawali giliran pengguna.
function trim(hist) {
  while (hist.length > cfg.ai.maxHistory) hist.shift();
  while (hist.length && hist[0].role !== 'user') hist.shift();
}

const isQuotaError = (err) => err?.status === 429;

function buildParams(model, contents, primary) {
  const params = { 
    model, 
    systemInstruction: cfg.ai.system, 
    contents 
  };
  
  if (primary) {
    if (cfg.ai.googleSearch) params.tools = [{ googleSearch: {} }];
    params.config = { 
      maxOutputTokens: cfg.ai.maxOutputTokens 
      // thinkingConfig: { thinkingBudget: cfg.ai.thinkingLevel } // Uncomment jika pakai model thinking
    };
  } else {
    // Model cadangan: pakai pengaturan bawaan model (tanpa tools/thinking)
    params.config = { maxOutputTokens: cfg.ai.maxOutputTokens };
  }
  return params;
}

async function generate(contents) {
  const call = (params) => getGemini().models.generateContent(params);

  try {
    return await call(buildParams(cfg.ai.model, contents, true));
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    console.warn(`[AI] 429 dari ${cfg.ai.model}: ${err.message}`);
    
    if (cfg.ai.googleSearch)
      console.warn('[AI] Tip: Google Search tidak tersedia di tier gratis untuk Gemini 3+. Set AI_GOOGLE_SEARCH=false.');
      
    if (!cfg.ai.fallbackModel || cfg.ai.fallbackModel === cfg.ai.model) throw err;
    
    console.warn(`[AI] Mencoba model cadangan: ${cfg.ai.fallbackModel}`);
    return await call(buildParams(cfg.ai.fallbackModel, contents, false));
  }
}

async function askAI(userId, text) {
  const hist = history.get(userId) || [];
  hist.push(textStep('user', text));
  trim(hist);
  history.set(userId, hist);

  try {
    const response = await generate(hist);
    let answer = response.text;

    // Deteksi jika AI tidak membalas dengan teks
    if (!answer && response.candidates && response.candidates.length > 0) {
      const finishReason = response.candidates[0].finishReason;
      
      // Jika AI berhenti bukan karena selesai dengan normal
      if (finishReason !== 'STOP') {
        throw new Error(`Gagal memproses (Alasan: ${finishReason})`);
      }
      
      // Coba ekstrak manual jika fungsi bawaan response.text meleset
      answer = response.candidates[0].content?.parts?.map(p => p.text || '').join('') || '';
    }

    if (!answer) {
      // Log respons asli ke console agar mudah di-debug
      console.error('[AI] Respons Mentah Kosong:', JSON.stringify(response, null, 2));
      throw new Error('Respons AI kosong (Mungkin model tidak mendukung tool yang aktif)');
    }

    hist.push(textStep('model', answer));
    trim(hist);
    return answer.trim();
  } catch (err) {
    hist.pop(); // buang pertanyaan yang gagal agar riwayat tetap konsisten
    throw err;
  }
}

/* ───────────── Format balasan untuk WhatsApp ───────────── */

// Gemini membalas dengan Markdown (**tebal**, ### judul); WhatsApp memakai *tebal*.
const toWhatsApp = (t) => t.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

// Pecah balasan panjang di batas baris/spasi agar nyaman dibaca.
function splitMessage(text, max = 4000) {
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

async function respond(sock, msg, userId, text, reply) {
  if (!process.env.GEMINI_API_KEY) return reply('⚠️ AI belum dikonfigurasi (GEMINI_API_KEY kosong).');
  const now = Date.now();
  if (now - (lastAsk.get(userId) || 0) < cfg.ai.cooldownMs) return;
  lastAsk.set(userId, now);

  await sock.sendPresenceUpdate('composing', msg.key.remoteJid);
  try {
    const answer = toWhatsApp(await askAI(userId, text));
    for (const part of splitMessage(answer)) await reply(part);
  } catch (err) {
    console.error('[AI]', err.message);
    await reply(isQuotaError(err) ? '⚠️ Kuota AI sedang habis, coba lagi nanti.' : '⚠️ AI sedang bermasalah, coba lagi nanti.');
  }
}

/* ───────────── Handler yang dipakai router ───────────── */

// Perintah: .ai <pertanyaan> | .ai on | .ai off | .ai reset
async function handleAICommand(sock, msg, { arg, isGroup, userId, reply }) {
  const sub = arg.toLowerCase();

  if (sub === 'on' || sub === 'off') {
    if (isGroup) return reply('Di grup, gunakan *.ai <pertanyaan>*.');
    aiState[msg.key.remoteJid] = sub === 'on';
    saveState();
    return reply(`Mode AI otomatis: *${sub.toUpperCase()}*`);
  }
  if (sub === 'reset') {
    history.delete(userId);
    return reply('Riwayat percakapan AI dihapus ✅');
  }
  if (!arg) return reply('Contoh: *.ai jelaskan apa itu blockchain*');
  return respond(sock, msg, userId, arg, reply);
}

// Pesan biasa (bukan perintah): dijawab AI hanya di chat pribadi jika mode otomatis aktif
async function handleAutoReply(sock, msg, { text, isGroup, userId, reply }) {
  if (isGroup || !text) return;
  if (!(aiState[msg.key.remoteJid] ?? cfg.ai.privateAuto)) return;
  return respond(sock, msg, userId, text, reply);
}

module.exports = { handleAICommand, handleAutoReply, askAI };