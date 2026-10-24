const path = require('path');
const qrcode = require('qrcode-terminal');
const { logger } = require('./config');
const { loadBaileys } = require('./lib/baileys');
const { onMessage } = require('./handler');

async function start() {
  const B = await loadBaileys();
  const { state, saveCreds } = await B.useMultiFileAuthState(path.join(__dirname, 'session'));
  const sock = B.makeWASocket({
    auth: state,
    logger,
    browser: B.Browsers.ubuntu('Chrome'),
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  // Login dengan kode pairing (opsional) — isi PAIRING_NUMBER di .env, contoh: 6281234567890
  if (process.env.PAIRING_NUMBER && !sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(process.env.PAIRING_NUMBER.replace(/\D/g, ''));
        console.log('🔑 Kode pairing:', code);
      } catch (e) {
        console.error('Gagal meminta kode pairing:', e.message);
      }
    }, 3000);
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr && !process.env.PAIRING_NUMBER) {
      console.log('Scan QR berikut lewat WhatsApp > Perangkat tertaut:');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') console.log('✅ Bot terhubung ke WhatsApp');
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === B.DisconnectReason.loggedOut) {
        console.log('❌ Sesi logout. Hapus folder "session" lalu jalankan ulang.');
        process.exit(1);
      }
      console.log('Koneksi terputus, mencoba menyambung ulang...');
      setTimeout(start, 3000);
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) onMessage(sock, msg).catch((e) => console.error(e));
  });
}

module.exports = { start };
