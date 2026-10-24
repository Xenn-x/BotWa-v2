const { Sticker } = require('wa-sticker-formatter');
const { cfg, logger } = require('../config');
const { loadBaileys } = require('../lib/baileys');
const { unwrap, getMedia } = require('../lib/utils');

const TYPES = ['full', 'crop', 'circle', 'rounded'];

async function createSticker(buffer, type, animated) {
  const build = (quality) =>
    new Sticker(buffer, { pack: cfg.pack, author: cfg.author, type, quality }).toBuffer();
  let out = await build(animated ? 40 : 70);
  if (animated && out.length > cfg.maxAnimatedBytes) out = await build(15); // kompres ulang
  return out;
}

async function handleSticker(sock, msg, content, args, reply) {
  const jid = msg.key.remoteJid;
  let media = getMedia(content);
  let target = msg;

  // Tidak ada media di pesan ini -> cek pesan yang di-reply
  if (!media) {
    const ctx = Object.values(content).find((v) => v && typeof v === 'object' && v.contextInfo)?.contextInfo;
    if (ctx?.quotedMessage) {
      media = getMedia(unwrap(ctx.quotedMessage));
      target = {
        key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant },
        message: ctx.quotedMessage,
      };
    }
  }
  if (!media) return reply('Kirim atau balas gambar / GIF / video dengan caption *.s*');
  if (media.animated && media.node.seconds > cfg.maxVideoSeconds)
    return reply(`Durasi terlalu panjang. Maksimal ${cfg.maxVideoSeconds} detik.`);

  await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } }); 
  const B = await loadBaileys();
  const buffer = await B.downloadMediaMessage(target, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
  const wanted = (args[0] || '').toLowerCase();
  const webp = await createSticker(buffer, TYPES.includes(wanted) ? wanted : 'full', media.animated);
  await sock.sendMessage(jid, { sticker: webp }, { quoted: msg });
  await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
}

module.exports = { handleSticker };
