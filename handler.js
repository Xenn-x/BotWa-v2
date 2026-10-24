const { MENU } = require('./config');
const { unwrap, getText, isOwner, getOwnerJid } = require('./lib/utils');
const { handleSticker } = require('./features/sticker');
const { handleRVO } = require('./features/rvo');
const { handleBrat } = require('./features/brat');
const ai = require('./features/ai');

// Perintah yang boleh dijalankan lewat pesan dari akun bot sendiri (fromMe).
// Pesan fromMe lainnya diabaikan agar bot tidak membalas dirinya sendiri.
const SELF_COMMANDS = new Set(['rvo', 'readviewonce']);

// Router: menerima setiap pesan masuk dan meneruskannya ke fitur yang sesuai.
async function onMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  if (!msg.message || jid === 'status@broadcast') return;

  const content = unwrap(msg.message);
  const text = getText(content).trim();
  const ctx = {
    isGroup: jid.endsWith('@g.us'),
    userId: msg.key.participant || jid,
    isOwner: isOwner(msg),
    ownerJid: getOwnerJid(sock),
    reply: (t) => sock.sendMessage(jid, { text: t }, { quoted: msg }),
  };
  const match = text.match(/^[.!/](\w+)(?:\s+([\s\S]*))?$/);

  try {
    if (!match) return msg.key.fromMe ? undefined : await ai.handleAutoReply(sock, msg, { ...ctx, text });

    const cmd = match[1].toLowerCase();
    const arg = (match[2] || '').trim();
    if (msg.key.fromMe && !SELF_COMMANDS.has(cmd)) return;

    switch (cmd) {
      case 'menu':
      case 'help':
        return await ctx.reply(MENU);

      case 's':
      case 'sticker':
      case 'stiker':
      case 'sgif':
      case 'svideo':
        return await handleSticker(sock, msg, content, arg.split(/\s+/), ctx.reply);

      case 'brat':
        return await handleBrat(sock, msg, content, arg, ctx.reply, false);

      case 'bratvid':
      case 'bratvideo':
      case 'bratanim':
      case 'bratgif':
        return await handleBrat(sock, msg, content, arg, ctx.reply, true);

      case 'ai':
        return await ai.handleAICommand(sock, msg, { ...ctx, arg });

      case 'rvo':
      case 'readviewonce':
        return await handleRVO(sock, msg, ctx);
    }
  } catch (err) {
    console.error('[ERROR]', err);
    await ctx.reply('⚠️ Terjadi kesalahan saat memproses permintaan.').catch(() => {});
  }
}

module.exports = { onMessage };
