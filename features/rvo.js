const { loadBaileys } = require('../lib/baileys');
const { unwrap } = require('../lib/utils');

const VIEW_ONCE_WRAPPERS = ['viewOnceMessageV2', 'viewOnceMessage', 'viewOnceMessageV2Extension'];

// .rvo — balas foto/video "sekali lihat", hasilnya dikirim ke chat owner.
// Hanya owner (atau pesan dari akun bot sendiri) yang boleh memakai perintah ini.
async function handleRVO(sock, m, { isOwner, ownerJid, reply }) {
  const toOwner = (content) => sock.sendMessage(ownerJid, content, { quoted: m });

  if (!isOwner) return reply('Akses Ditolak!');

  const quotedMsg = unwrap(m.message)?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!quotedMsg) return toOwner({ text: '⚠️ Bos, reply dulu foto/video 1x lihatnya!' });

  const wrapper = VIEW_ONCE_WRAPPERS.find((k) => quotedMsg[k]);
  const realMsg = wrapper ? quotedMsg[wrapper].message : quotedMsg;
  const mediaType = ['imageMessage', 'videoMessage'].find((k) => realMsg?.[k]);
  if (!mediaType) return toOwner({ text: 'yang lu reply bukan media bos!' });

  const mediaObj = realMsg[mediaType];
  if (!wrapper && !mediaObj.viewOnce)
    return toOwner({ text: '⚠️ Kocak, itu kan foto/video biasa, ngapain dibobol!' });

  try {
    const B = await loadBaileys();
    const stream = await B.downloadContentFromMessage(mediaObj, mediaType.replace('Message', ''));
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const caption = mediaObj.caption ? `\n> *Caption:* ${mediaObj.caption}` : '';
    if (mediaType === 'imageMessage') await toOwner({ image: buffer, caption });
    else await toOwner({ video: buffer, caption, mimetype: 'video/mp4' });
  } catch (err) {
    console.error('Error bobol RVO:', err);
    await toOwner({ text: 'Waduh, gagal jir' });
  }
}

module.exports = { handleRVO };
