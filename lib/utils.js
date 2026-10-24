const { cfg } = require('../config');

// Membuka pembungkus pesan (ephemeral, view-once, dokumen + caption)
function unwrap(m) {
  let cur = m;
  for (let i = 0; i < 5 && cur; i++) {
    const inner =
      cur.ephemeralMessage?.message ||
      cur.viewOnceMessage?.message ||
      cur.viewOnceMessageV2?.message ||
      cur.viewOnceMessageV2Extension?.message ||
      cur.documentWithCaptionMessage?.message;
    if (!inner) break;
    cur = inner;
  }
  return cur;
}

const getText = (c) =>
  c?.conversation ||
  c?.extendedTextMessage?.text ||
  c?.imageMessage?.caption ||
  c?.videoMessage?.caption ||
  c?.documentMessage?.caption ||
  '';

// GIF di WhatsApp dikirim sebagai videoMessage (gifPlayback), jadi ditangani sama dengan video.
function getMedia(c) {
  if (!c) return null;
  if (c.imageMessage) return { animated: false, node: c.imageMessage };
  if (c.videoMessage) return { animated: true, node: c.videoMessage };
  const mime = c.documentMessage?.mimetype || '';
  if (mime.startsWith('image/')) return { animated: mime === 'image/gif', node: c.documentMessage };
  if (mime.startsWith('video/')) return { animated: true, node: c.documentMessage };
  return null;
}

const jidNumber = (jid) => (jid || '').split('@')[0].split(':')[0];

// Owner = nomor di OWNER_NUMBER, atau pesan yang dikirim dari akun bot itu sendiri (fromMe).
// Baileys 7 bisa memakai JID "@lid", jadi field *Alt (berisi nomor telepon) ikut dicek.
function isOwner(msg) {
  if (msg.key.fromMe) return true;
  if (!cfg.ownerNumber) return false;
  const { participant, participantAlt, remoteJid, remoteJidAlt } = msg.key;
  return [participant, participantAlt, remoteJid, remoteJidAlt].some(
    (j) => j?.endsWith('@s.whatsapp.net') && jidNumber(j) === cfg.ownerNumber,
  );
}

// Tujuan hasil perintah owner: OWNER_NUMBER, atau chat akun bot sendiri jika kosong.
function getOwnerJid(sock) {
  if (cfg.ownerNumber) return `${cfg.ownerNumber}@s.whatsapp.net`;
  return (sock.user?.id || '').replace(/:\d+@/, '@');
}

module.exports = { unwrap, getText, getMedia, isOwner, getOwnerJid };
