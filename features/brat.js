const path = require('path');
const sharp = require('sharp');
const { Sticker } = require('wa-sticker-formatter');
const { cfg } = require('../config');
const { unwrap, getText } = require('../lib/utils');

// Font Archivo Narrow (SIL OFL) disertakan di assets/fonts agar tampilan sama di semua sistem.
const FONT_FILE = path.join(__dirname, '..', 'assets', 'fonts', 'ArchivoNarrow.ttf');
const SIZE = 512;
const PAD = 26;
const BLUR = 1.5;
const MAX_ANIM_MS = 6500; // total waktu kata-kata muncul (di luar jeda akhir)
const WORD_MS = 600; // maksimal jeda per kata
const HOLD_MS = 1800; // frame terakhir ditahan sebentar

const escapeMarkup = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Satu frame: teks huruf kecil, hitam, agak blur, di atas latar hijau ala "brat".
async function renderFrame(text) {
  const inner = SIZE - PAD * 2;
  const words = text.split(/\s+/).filter(Boolean).length;
  const layer = await sharp({
    text: {
      text: escapeMarkup(text.toLowerCase()),
      font: 'Archivo Narrow',
      fontfile: FONT_FILE,
      width: inner,
      height: inner, // width + height = ukuran font otomatis menyesuaikan kotak
      align: 'left',
      justify: words >= 5, // justify pada kata tunggal membuat huruf renggang, jadi hanya untuk teks panjang
      wrap: 'word-char',
      rgba: true,
    },
  })
    .resize({ width: inner, height: inner, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  return sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: cfg.brat.bg } })
    .composite([{ input: layer, left: PAD, top: PAD }])
    .blur(BLUR)
    .png()
    .toBuffer();
}

const toSticker = (buffer, quality) =>
  new Sticker(buffer, { pack: cfg.pack, author: cfg.author, type: 'full', quality }).toBuffer();

async function createStatic(text) {
  return toSticker(await renderFrame(text), 80);
}

// Animasi: kata muncul satu per satu (frame ke-n berisi n kata pertama).
async function createAnimated(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const frames = [];
  for (let i = 1; i <= words.length; i++) frames.push(await renderFrame(words.slice(0, i).join(' ')));
  if (frames.length === 1) return toSticker(frames[0], 80);

  const per = Math.min(WORD_MS, Math.floor(MAX_ANIM_MS / words.length));
  const delay = frames.map((_, i) => (i === frames.length - 1 ? HOLD_MS : per));
  const encode = (quality) =>
    sharp(frames, { join: { animated: true } }).webp({ quality, effort: 3, delay, loop: 0 }).toBuffer();

  let out = await toSticker(await encode(60), 60);
  if (out.length > cfg.maxAnimatedBytes) out = await toSticker(await encode(30), 30); // kompres ulang
  return out;
}

function getQuotedText(content) {
  const ctx = Object.values(content).find((v) => v && typeof v === 'object' && v.contextInfo)?.contextInfo;
  return ctx?.quotedMessage ? getText(unwrap(ctx.quotedMessage)).trim() : '';
}

// .brat <teks> | .bratvid <teks>   (atau balas pesan teks dengan perintahnya)
async function handleBrat(sock, msg, content, arg, reply, animated) {
  const raw = arg || getQuotedText(content);
  const text = animated
    ? raw.replace(/\s+/g, ' ').trim()
    : raw.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  const cmd = animated ? '.bratvid' : '.brat';
  if (!text) return reply(`Contoh: *${cmd} halo semuanya*\nAtau balas sebuah pesan teks dengan *${cmd}*`);

  const { maxChars, maxAnimChars, maxAnimWords } = cfg.brat;
  if (text.length > (animated ? maxAnimChars : maxChars))
    return reply(`Teks terlalu panjang (maks ${animated ? maxAnimChars : maxChars} karakter).`);
  if (animated && text.split(' ').length > maxAnimWords) return reply(`Terlalu banyak kata (maks ${maxAnimWords} kata).`);

  const jid = msg.key.remoteJid;
  if (animated) await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
  const webp = animated ? await createAnimated(text) : await createStatic(text);
  await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
  if (animated) await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
}

module.exports = { handleBrat };
