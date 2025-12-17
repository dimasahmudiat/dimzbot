const db = require('../lib/database');
const telegram = require('../lib/telegram');
const payment = require('../lib/payment');
const config = require('../lib/config');
const utils = require('../lib/utils');

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Main webhook handler - FIXED for Vercel
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'Webhook endpoint ready' });
  }

  try {
    const update = req.body;
    
    // Validate update object
    if (!update || typeof update !== 'object') {
      log('Invalid update received');
      return res.status(200).json({ ok: true });
    }

    log(`Received update: ${JSON.stringify(update).substring(0, 200)}`);

    // Process cleanup
    await db.cleanupExpiredOrders();

    // Handle text messages
    if (update.message && update.message.text) {
      await handleTextMessage(update.message);
    }

    // Handle callback queries
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    // Always return 200 OK to Telegram
    return res.status(200).json({ ok: true });
  } catch (error) {
    log(`Error processing update: ${error.message}`);
    log(`Error stack: ${error.stack}`);
    // Still return 200 to prevent Telegram from retrying
    return res.status(200).json({ ok: true, error: error.message });
  }
};

// Handle text messages
async function handleTextMessage(message) {
  const chatId = message.chat.id;
  const text = message.text;
  const firstName = message.chat.first_name || 'User';

  log(`Processing text message - Chat: ${chatId}, Text: ${text}`);

  // Start command
  if (text.startsWith('/start')) {
    await db.clearUserState(chatId);
    const userPoints = await db.getUserPoints(chatId);
    
    const welcomeMessage = `🎮 <b>Selamat Datang, ${firstName}!</b>\n\n` +
      `✨ <b>BOT PEMBELIAN LISENSI FREE FIRE</b> ✨\n\n` +
      `💰 <b>Point Anda:</b> ${userPoints} points\n\n` +
      `🛒 <b>Fitur yang tersedia:</b>\n` +
      `• Beli lisensi baru (Random/Manual)\n` +
      `• Extend masa aktif akun\n` +
      `• Tukar point dengan lisensi gratis\n` +
      `• Support Free Fire & Free Fire MAX\n` +
      `• Pembayaran QRIS otomatis\n\n` +
      `💰 <b>Harga mulai dari Rp 15.000</b>\n` +
      `🎁 <b>Dapatkan point untuk setiap pembelian!</b>\n\n` +
      `⏰ <b>Pembayaran otomatis terdeteksi dalam 10 menit!</b>\n\n` +
      `Silakan pilih menu di bawah:`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '🛒 Beli Lisensi Baru', callback_data: 'new_order' }],
        [
          { text: '⏰ Extend Masa Aktif', callback_data: 'extend_user' },
          { text: '🎁 Tukar Point', callback_data: 'redeem_points' }
        ],
        [{ text: 'ℹ️ Bantuan', callback_data: 'help' }]
      ]
    };
    
    await telegram.sendPhoto(chatId, config.WELCOME_IMAGE, welcomeMessage, keyboard);
    return;
  }

  // Menu command
  if (text.startsWith('/menu')) {
    await showMainMenu(chatId);
    return;
  }

  // Points command
  if (text.startsWith('/points')) {
    const userPoints = await db.getUserPoints(chatId);
    const message = `💰 <b>POINT ANDA</b>\n\n` +
      `Total Point: <b>${userPoints} points</b>\n\n` +
      `📊 <b>Cara mendapatkan point:</b>\n` +
      `• Beli lisensi 1 hari = 1 point\n` +
      `• Beli lisensi 3 hari = 2 point\n` +
      `• Beli lisensi 7 hari = 5 point\n` +
      `• Dan seterusnya...\n\n` +
      `🎁 <b>Tukar point dengan lisensi gratis!</b>\n` +
      `12 points = 1 hari lisensi gratis`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '🎁 Tukar Point', callback_data: 'redeem_points' }],
        [{ text: '🛒 Beli Lisensi', callback_data: 'new_order' }],
        [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }]
      ]
    };
    
    await telegram.sendPhoto(chatId, config.WELCOME_IMAGE, message, keyboard);
    return;
  }

  // Handle state-based input
  const userState = await db.getUserState(chatId);
  
  if (userState && userState.state === 'waiting_manual_input') {
    await handleManualInput(chatId, text, userState);
    return;
  }
  
  if (userState && userState.state === 'waiting_extend_credentials') {
    await handleExtendCredentials(chatId, text, userState);
    return;
  }
}

// Handle callback queries
async function handleCallbackQuery(callback) {
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;
  const data = callback.data;
  const callbackId = callback.id;

  log(`Processing callback - Chat: ${chatId}, Data: ${data}`);

  await telegram.answerCallbackQuery(callbackId);

  try {
    if (data === 'main_menu') {
      await db.clearUserState(chatId);
      await showMainMenu(chatId, messageId);
    }
    else if (data === 'new_order') {
      await showGameTypeSelection(chatId, messageId);
    }
    else if (data === 'extend_user') {
      await showExtendGameType(chatId, messageId);
    }
    else if (data === 'redeem_points') {
      await showRedeemPointsMenu(chatId, messageId);
    }
    else if (data === 'help') {
      await showHelp(chatId, messageId);
    }
    else if (data.startsWith('type_')) {
      const gameType = data.replace('type_', '');
      await showDurationSelection(chatId, messageId, gameType);
    }
    else if (data.startsWith('duration_')) {
      const parts = data.split('_');
      const gameType = parts[1];
      const duration = parts[2];
      await showKeyTypeSelection(chatId, messageId, gameType, duration);
    }
    else if (data.startsWith('keytype_')) {
      const parts = data.split('_');
      const gameType = parts[1];
      const duration = parts[2];
      const keyType = parts[3];
      await processKeyTypeSelection(chatId, messageId, gameType, duration, keyType);
    }
    else if (data.startsWith('extend_type_')) {
      const gameType = data.replace('extend_type_', '');
      await showExtendCredentialsInput(chatId, messageId, gameType);
    }
    else if (data.startsWith('extend_duration_')) {
      const duration = data.replace('extend_duration_', '');
      await processExtendDuration(chatId, messageId, duration);
    }
    else if (data.startsWith('redeem_') && /^\d+$/.test(data.replace('redeem_', ''))) {
      const duration = data.replace('redeem_', '');
      await processPointRedemption(chatId, messageId, duration);
    }
    else if (data === 'redeem_ff' || data === 'redeem_ffmax') {
      const gameType = data === 'redeem_ff' ? 'ff' : 'ffmax';
      await completePointRedemption(chatId, messageId, gameType);
    }
    else if (data === 'check_payment') {
      await checkPaymentManually(chatId, messageId);
    }
    else if (data === 'check_extend') {
      await checkExtendPayment(chatId, messageId);
    }
    else if (data === 'cancel_order') {
      await cancelOrder(chatId, messageId);
    }
  } catch (error) {
    log(`Error handling callback: ${error.message}`);
    await telegram.sendMessage(chatId, '❌ <b>Terjadi kesalahan!</b>\n\nSilakan coba lagi atau gunakan /start');
  }
}

// Helper functions
async function showMainMenu(chatId, messageId = null) {
  const userPoints = await db.getUserPoints(chatId);
  
  const message = `🏠 <b>Menu Utama</b>\n\n` +
    `💰 <b>Point Anda:</b> ${userPoints} points\n\n` +
    `Silakan pilih menu yang diinginkan:`;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '🛒 Beli Lisensi Baru', callback_data: 'new_order' }],
      [
        { text: '⏰ Extend Masa Aktif', callback_data: 'extend_user' },
        { text: '🎁 Tukar Point', callback_data: 'redeem_points' }
      ],
      [{ text: 'ℹ️ Bantuan', callback_data: 'help' }]
    ]
  };
  
  if (messageId) {
    await telegram.editMessageSmart(chatId, messageId, message, keyboard);
  } else {
    await telegram.sendPhoto(chatId, config.WELCOME_IMAGE, message, keyboard);
  }
}

async function showGameTypeSelection(chatId, messageId) {
  const message = `👋 <b>Halo!</b>\n\n` +
    `Silakan pilih jenis Free Fire yang ingin Anda beli:`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🎮 FREE FIRE', callback_data: 'type_ff' },
        { text: '⚡ FREE FIRE MAX', callback_data: 'type_ffmax' }
      ],
      [{ text: '↩️ Kembali', callback_data: 'main_menu' }]
    ]
  };
  
  await telegram.editMessageSmart(chatId, messageId, message, keyboard);
}

async function showDurationSelection(chatId, messageId, gameType) {
  const message = `💰 <b>Pilih Durasi Lisensi ${gameType.toUpperCase()}:</b>\n\n` +
    `Silakan pilih durasi:`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '1 Hari - 15k', callback_data: `duration_${gameType}_1` },
        { text: '2 Hari - 30k', callback_data: `duration_${gameType}_2` },
        { text: '3 Hari - 40k', callback_data: `duration_${gameType}_3` }
      ],
      [
        { text: '4 Hari - 50k', callback_data: `duration_${gameType}_4` },
        { text: '6 Hari - 70k', callback_data: `duration_${gameType}_6` },
        { text: '8 Hari - 90k', callback_data: `duration_${gameType}_8` }
      ],
      [
        { text: '10 Hari - 100k', callback_data: `duration_${gameType}_10` },
        { text: '15 Hari - 150k', callback_data: `duration_${gameType}_15` }
      ],
      [
        { text: '20 Hari - 180k', callback_data: `duration_${gameType}_20` },
        { text: '30 Hari - 250k', callback_data: `duration_${gameType}_30` }
      ],
      [
        { text: '↩️ Kembali', callback_data: 'new_order' },
        { text: '🏠 Menu Utama', callback_data: 'main_menu' }
      ]
    ]
  };
  
  await telegram.editMessageSmart(chatId, messageId, message, keyboard);
}

async function showKeyTypeSelection(chatId, messageId, gameType, duration) {
  const message = `🔑 <b>Pilih Tipe Key untuk ${gameType.toUpperCase()}:</b>\n\n` +
    `🎲 <b>RANDOM KEY</b>\n` +
    `• Username & password digenerate otomatis\n` +
    `• Format: 2 huruf + 2 angka (Username), 2 angka (Password)\n\n` +
    `✏️ <b>MANUAL KEY</b>\n` +
    `• Input username & password manual\n` +
    `• Format: <code>/username-password</code>\n\n` +
    `Silakan pilih tipe key:`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🎲 RANDOM KEY', callback_data: `keytype_${gameType}_${duration}_random` },
        { text: '✏️ MANUAL KEY', callback_data: `keytype_${gameType}_${duration}_manual` }
      ],
      [
        { text: '↩️ Kembali', callback_data: `type_${gameType}` },
        { text: '🏠 Menu Utama', callback_data: 'main_menu' }
      ]
    ]
  };
  
  await telegram.editMessageSmart(chatId, messageId, message, keyboard);
}

async function processKeyTypeSelection(chatId, messageId, gameType, duration, keyType) {
  if (keyType === 'random') {
    const amount = config.PRICES[duration];
    const orderId = 'DIMZ' + Date.now() + Math.floor(Math.random() * 900 + 100);
    
    const paymentData = await payment.createPayment(orderId, amount);
    
    if (paymentData && paymentData.status) {
      const data = paymentData.data;
      
      const message = `💳 <b>PEMBAYARAN ${gameType.toUpperCase()} (RANDOM)</b>\n\n` +
        `Jenis: <b>${gameType.toUpperCase()}</b>\n` +
        `Durasi: <b>${duration} Hari</b>\n` +
        `Tipe: <b>KEY RANDOM</b>\n` +
        `Harga: <b>${utils.formatCurrency(amount)}</b>\n` +
        `Order ID: <code>${orderId}</code>\n\n` +
        `📱 <b>INSTRUKSI PEMBAYARAN:</b>\n` +
        `1. Scan QR Code di bawah\n` +
        `2. Bayar sesuai amount\n` +
        `3. Pembayaran akan terdeteksi otomatis\n\n` +
        `⏰ <b>Batas Waktu: 10 MENIT</b>\n` +
        `🔄 <b>Cek Otomatis: Setiap 20 detik</b>\n` +
        `QR akan otomatis terhapus setelah 10 menit jika tidak bayar\n` +
        `Expired: ${data.expired}\n\n` +
        `🚀 <b>Pembayaran akan diproses otomatis!</b>`;
      
      const keyboard = {
        inline_keyboard: [
          [{ text: '🔍 Cek Status Manual', callback_data: 'check_payment' }],
          [{ text: '❌ Batalkan Pesanan', callback_data: 'cancel_order' }]
        ]
      };
      
      await db.savePendingOrder(orderId, chatId, gameType, duration, amount, data.kode_deposit, 'random');
      await telegram.sendPhoto(chatId, data.link_qr, message, keyboard);
    } else {
      await telegram.editMessageSmart(chatId, messageId, '❌ Gagal membuat pembayaran. Silakan coba lagi.', getBackButton(`type_${gameType}`));
    }
  } else if (keyType === 'manual') {
    await db.saveUserState(chatId, 'waiting_manual_input', { game_type: gameType, duration: duration });
    
    const instruction = `✏️ <b>MASUKKAN USERNAME & PASSWORD</b>\n\n` +
      `📝 <b>Gunakan format:</b>\n` +
      `<code>/username-password</code>\n\n` +
      `🎯 <b>Contoh:</b>\n` +
      `<code>/kambing-1</code>\n` +
      `<code>/player-123</code>\n` +
      `<code>/gamer-99</code>\n\n` +
      `➡️ <b>Username</b> sebelum tanda minus (-)\n` +
      `➡️ <b>Password</b> setelah tanda minus (-)`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '↩️ Kembali', callback_data: `duration_${gameType}_${duration}` },
          { text: '🏠 Menu Utama', callback_data: 'main_menu' }
        ]
      ]
    };
    
    await telegram.editMessageSmart(chatId, messageId, instruction, keyboard);
  }
}

async function handleManualInput(chatId, text, userState) {
  if (!text.startsWith('/')) {
    await telegram.sendMessage(chatId, '❌ <b>Gunakan format command!</b>\n\nFormat: <code>/username-password</code>\nContoh: <code>/kambing-1</code>', getBackButton('new_order'));
    return;
  }
  
  const input = text.substring(1);
  const parts = input.split('-', 2);
  
  if (parts.length !== 2) {
    await telegram.sendMessage(chatId, '❌ <b>Format tidak valid!</b>\n\nFormat: <code>/username-password</code>\nContoh: <code>/kambing-1</code>', getBackButton('new_order'));
    return;
  }
  
  const username = parts[0].trim();
  const password = parts[1].trim();
  
  if (!username || !password) {
    await telegram.sendMessage(chatId, '❌ <b>Username dan password tidak boleh kosong!</b>\n\nFormat: <code>/username-password</code>\nContoh: <code>/kambing-1</code>', getBackButton('new_order'));
    return;
  }
  
  const gameType = userState.data.game_type;
  const table = gameType === 'ff' ? 'freefire' : 'ffmax';
  
  if (await db.isUsernameExists(username, table)) {
    const gameName = gameType === 'ff' ? 'FREE FIRE' : 'FREE FIRE MAX';
    const errorMessage = `❌ <b>Username sudah digunakan di ${gameName}!</b>\n\n` +
      `Username <code>${username}</code> sudah terdaftar di <b>${gameName}</b>.\n\n` +
      `💡 <b>Tips:</b> Gunakan username yang berbeda\n\n` +
      `📝 <b>Format:</b> <code>/username-password</code>\n` +
      `🎯 <b>Contoh:</b> <code>/player123-1</code>`;
    
    await telegram.sendMessage(chatId, errorMessage, getBackButton('new_order'));
    return;
  }
  
  const duration = userState.data.duration;
  const amount = config.PRICES[duration];
  const orderId = 'DIMZ' + Date.now() + Math.floor(Math.random() * 900 + 100);
  
  const paymentData = await payment.createPayment(orderId, amount);
  
  if (paymentData && paymentData.status) {
    const data = paymentData.data;
    
    const message = `💳 <b>PEMBAYARAN ${gameType.toUpperCase()} (MANUAL)</b>\n\n` +
      `Jenis: <b>${gameType.toUpperCase()}</b>\n` +
      `Durasi: <b>${duration} Hari</b>\n` +
      `Tipe: <b>KEY MANUAL</b>\n` +
      `Username: <code>${username}</code>\n` +
      `Password: <code>${password}</code>\n` +
      `Harga: <b>${utils.formatCurrency(amount)}</b>\n` +
      `Order ID: <code>${orderId}</code>\n\n` +
      `📱 <b>INSTRUKSI PEMBAYARAN:</b>\n` +
      `1. Scan QR Code di bawah\n` +
      `2. Bayar sesuai amount\n` +
      `3. Pembayaran akan terdeteksi otomatis\n\n` +
      `⏰ <b>Batas Waktu: 10 MENIT</b>\n` +
      `🔄 <b>Cek Otomatis: Setiap 20 detik</b>\n` +
      `QR akan otomatis terhapus setelah 10 menit jika tidak bayar\n` +
      `Expired: ${data.expired}\n\n` +
      `🚀 <b>Pembayaran akan diproses otomatis!</b>`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔍 Cek Status Manual', callback_data: 'check_payment' }],
        [{ text: '❌ Batalkan Pesanan', callback_data: 'cancel_order' }]
      ]
    };
    
    await db.savePendingOrder(orderId, chatId, gameType, duration, amount, data.kode_deposit, 'manual', username, password);
    await db.clearUserState(chatId);
    await telegram.sendPhoto(chatId, data.link_qr, message, keyboard);
  } else {
    await telegram.sendMessage(chatId, '❌ Gagal membuat pembayaran. Silakan coba lagi.', getBackButton('new_order'));
    await db.clearUserState(chatId);
  }
}

async function showExtendGameType(chatId, messageId) {
  const message = `🎮 <b>EXTEND MASA AKTIF</b>\n\n` +
    `Pilih jenis Free Fire yang ingin di-extend:`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🎮 FREE FIRE', callback_data: 'extend_type_ff' },
        { text: '⚡ FREE FIRE MAX', callback_data: 'extend_type_ffmax' }
      ],
      [{ text: '↩️ Kembali', callback_data: 'main_menu' }]
    ]
  };
  
  await telegram.editMessageSmart(chatId, messageId, message, keyboard);
}

async function showExtendCredentialsInput(chatId, messageId, gameType) {
  const gameName = gameType === 'ff' ? 'FREE FIRE' : 'FREE FIRE MAX';
  
  await db.saveUserState(chatId, 'waiting_extend_credentials', { game_type: gameType });
  
  const message = `✏️ <b>EXTEND ${gameName}</b>\n\n` +
    `Masukkan <b>USERNAME dan PASSWORD</b> yang ingin di-extend:\n\n` +
    `📝 <b>Format:</b>\n` +
    `<code>/username-password</code>\n\n` +
    `🎯 <b>Contoh:</b>\n` +
    `<code>/kambing-1</code>\n` +
    `<code>/player-123</code>\n\n` +
    `⚠️ <b>Pastikan username dan password terdaftar di ${gameName}</b>`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '↩️ Kembali', callback_data: 'extend_user' },
        { text: '🏠 Menu Utama', callback_data: 'main_menu' }
      ]
    ]
  };
  
  await telegram.editMessageSmart(chatId, messageId, message, keyboard);
}

async function handleExtendCredentials(chatId, text, userState) {
  if (!text.startsWith('/')) {
    await telegram.sendMessage(chatId, '❌ <b>Gunakan format command!</b>\n\nFormat: <code>/username-password</code>\nContoh: <code>/kambing-1</code>', getBackButton('extend_user'));
    return;
  }
  
  const input = text.substring(1);
  const parts = input.split('-', 2);
  
  if (parts.length !== 2) {
    await telegram.sendMessage(chatId, '❌ <b>Format tidak valid!</b>\n\nFormat: <code>/username-password</code>\nContoh: <code>/kambing-1</code>', getBackButton('extend_user'));
    return;
  }
  
  const username = parts[0].trim();
  const password = parts[1].trim();
  const gameType = userState.data.game_type;
  
  const userData = await db.getUserByCredentials(username, password, gameType);
  
  if (userData) {
    await db.saveUserState(chatId, 'waiting_extend_duration', {
      username: username,
      password: password,
      user_data: userData,
      game_type: gameType
    });
    
    const gameName = gameType === 'ff' ? 'FREE FIRE' : 'FREE FIRE MAX';
    const currentExp = utils.formatDate(userData.expDate);
    
    const message = `✅ <b>USERNAME DAN PASSWORD COCOK!</b>\n\n` +
      `Username: <code>${username}</code>\n` +
      `Jenis: <b>${gameName}</b>\n` +
      `Masa Aktif Saat Ini: <b>${currentExp} WIB</b>\n\n` +
      `💰 <b>Pilih Durasi Extend:</b>`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '1 Hari - 15k', callback_data: 'extend_duration_1' },
          { text: '2 Hari - 30k', callback_data: 'extend_duration_2' },
          { text: '3 Hari - 40k', callback_data: 'extend_duration_3' }
        ],
        [
          { text: '4 Hari - 50k', callback_data: 'extend_duration_4' },
          { text: '6 Hari - 70k', callback_data: 'extend_duration_6' },
          { text: '8 Hari - 90k', callback_data: 'extend_duration_8' }
        ],
        [
          { text: '10 Hari - 100k', callback_data: 'extend_duration_10' },
          { text: '15 Hari - 150k', callback_data: 'extend_duration_15' }
        ],
        [
          { text: '20 Hari - 180k', callback_data: 'extend_duration_20' },
          { text: '30 Hari - 250k', callback_data: 'extend_duration_30' }
        ],
        [
          { text: '↩️ Kembali', callback_data: `extend_type_${gameType}` },
          { text: '🏠 Menu Utama', callback_data: 'main_menu' }
        ]
      ]
    };
    
    await telegram.sendMessage(chatId, message, keyboard);
  } else {
    const currentErrorCount = userState.error_count || 0;
    const newErrorCount = currentErrorCount + 1;
    await db.updateUserErrorCount(chatId, newErrorCount);
    
    const gameName = gameType === 'ff' ? 'FREE FIRE' : 'FREE FIRE MAX';
    let errorMessage = `❌ <b>Username dan Password tidak cocok di ${gameName}!</b>\n\n`;
    
    if (newErrorCount >= 2) {
      errorMessage += `⚠️ <b>Anda telah 2 kali melakukan kesalahan.</b>\n` +
        `Silakan mulai ulang dari menu utama.\n\n`;
      await db.clearUserState(chatId);
      await telegram.sendMessage(chatId, errorMessage, getBackButton());
    } else {
      errorMessage += `Silakan coba lagi dengan username dan password yang benar:\n\n` +
        `Format: <code>/username-password</code>\n` +
        `Contoh: <code>/kambing-1</code>`;
      await telegram.sendMessage(chatId, errorMessage, getBackButton('extend_user'));
    }
  }
}

async function processExtendDuration(chatId, messageId, duration) {
  const userState = await db.getUserState(chatId);
  
  if (!userState || userState.state !== 'waiting_extend_duration') {
    await telegram.sendMessage(chatId, '❌ <b>Sesi telah berakhir!</b>\n\nSilakan mulai ulang.', getBackButton('extend_user'));
    return;
  }
  
  const username = userState.data.username;
  const password = userState.data.password;
  const userData = userState.data.user_data;
  const gameType = userState.data.game_type;
  const amount = config.PRICES[duration];
  
  const orderId = 'EXTEND' + Date.now() + Math.floor(Math.random() * 900 + 100);
  
  const paymentData = await payment.createPayment(orderId, amount);
  
  if (paymentData && paymentData.status) {
    const data = paymentData.data;
    const gameName = gameType === 'ff' ? 'FREE FIRE' : 'FREE FIRE MAX';
    const currentExp = utils.formatDate(userData.expDate);
    const newExpDate = utils.formatDate(new Date(new Date(userData.expDate).getTime() + duration * 24 * 60 * 60 * 1000));
    
    const message = `💳 <b>EXTEND ${gameName}</b>\n\n` +
      `Username: <code>${username}</code>\n` +
      `Password: <code>${password}</code>\n` +
      `Jenis: <b>${gameName}</b>\n` +
      `Durasi: <b>${duration} Hari</b>\n` +
      `Harga: <b>${utils.formatCurrency(amount)}</b>\n` +
      `Masa Aktif Saat Ini: <b>${currentExp} WIB</b>\n` +
      `Masa Aktif Baru: <b>${newExpDate} WIB</b>\n` +
      `Order ID: <code>${orderId}</code>\n\n` +
      `📱 <b>INSTRUKSI PEMBAYARAN:</b>\n` +
      `1. Scan QR Code di bawah\n` +
      `2. Bayar sesuai amount\n` +
      `3. Pembayaran akan terdeteksi otomatis\n\n` +
      `⏰ <b>Batas Waktu: 10 MENIT</b>\n` +
      `🔄 <b>Cek Otomatis: Setiap 20 detik</b>\n` +
      `QR akan otomatis terhapus setelah 10 menit jika tidak bayar\n` +
      `Expired: ${data.expired}\n\n` +
      `🚀 <b>Pembayaran akan diproses otomatis!</b>`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔍 Cek Status Manual', callback_data: 'check_extend' }],
        [{ text: '❌ Batalkan Pesanan', callback_data: 'cancel_order' }]
      ]
    };
    
    await db.savePendingOrder(orderId, chatId, gameType, duration, amount, data.kode_deposit, 'extend', username, password);
    await db.clearUserState(chatId);
    await telegram.sendPhoto(chatId, data.link_qr, message, keyboard);
  } else {
    await telegram.editMessageSmart(chatId, messageId, '❌ Gagal membuat pembayaran extend. Silakan coba lagi.', getBackButton('extend_user'));
    await db.clearUserState(chatId);
  }
}

async function showRedeemPointsMenu(chatId, messageId) {
  const userPoints = await db.getUserPoints(chatId);
  
  const message = `🎁 <b>TUKAR POINT</b>\n\n` +
    `💰 <b>Point Anda:</b> ${userPoints} points\n\n` +
    `📊 <b>Rate Penukaran:</b>\n` +
    `• 1 Hari = 12 points\n` +
    `• 2 Hari = 24 points\n` +
    `• 3 Hari = 36 points\n` +
    `• 7 Hari = 84 points\n\n` +
    `Pilih durasi yang ingin ditukar:`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '1 Hari - 12 points', callback_data: 'redeem_1' },
        { text: '2 Hari - 24 points', callback_data: 'redeem_2' }
      ],
      [
        { text: '3 Hari - 36 points', callback_data: 'redeem_3' },
        { text: '7 Hari - 84 points', callback_data: 'redeem_7' }
      ],
      [{ text: '↩️ Kembali', callback_data: 'main_menu' }]
    ]
  };
  
  if (messageId) {
    await telegram.editMessageSmart(chatId, messageId, message, keyboard);
  } else {
    await telegram.sendPhoto(chatId, config.WELCOME_IMAGE, message, keyboard);
  }
}

async function processPointRedemption(chatId, messageId, duration) {
  const userPoints = await db.getUserPoints(chatId);
  const pointsNeeded = utils.calculatePointsNeededForDays(duration);
  
  if (userPoints < pointsNeeded) {
    const message = `❌ <b>Point tidak cukup!</b>\n\n` +
      `Point yang dibutuhkan: <b>${pointsNeeded} points</b>\n` +
      `Point Anda: <b>${userPoints} points</b>\n\n` +
      `Silakan kumpulkan point lebih banyak dengan melakukan pembelian.`;
    
    await telegram.editMessageSmart(chatId, messageId, message, getBackButton('redeem_points'));
    return;
  }
  
  const message = `🎮 <b>PILIH JENIS GAME</b>\n\n` +
    `Anda akan menukar <b>${pointsNeeded} points</b> untuk lisensi <b>${duration} hari</b>\n\n` +
    `Pilih jenis Free Fire:`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🎮 FREE FIRE', callback_data: 'redeem_ff' },
        { text: '⚡ FREE FIRE MAX', callback_data: 'redeem_ffmax' }
      ],
      [{ text: '↩️ Kembali', callback_data: 'redeem_points' }]
    ]
  };
  
  await db.saveUserState(chatId, 'waiting_redeem_game', {
    duration: duration,
    points_needed: pointsNeeded
  });
  
  await telegram.editMessageSmart(chatId, messageId, message, keyboard);
}

async function completePointRedemption(chatId, messageId, gameType) {
  const userState = await db.getUserState(chatId);
  
  if (!userState || userState.state !== 'waiting_redeem_game') {
    await telegram.editMessageSmart(chatId, messageId, '❌ <b>Sesi telah berakhir!</b>\n\nSilakan mulai ulang dari menu penukaran point.', getBackButton('redeem_points'));
    return;
  }
  
  const duration = userState.data.duration;
  const pointsNeeded = userState.data.points_needed;
  const userPoints = await db.getUserPoints(chatId);
  
  if (userPoints < pointsNeeded) {
    await telegram.editMessageSmart(chatId, messageId, `❌ <b>Point tidak cukup!</b>\n\nPoint yang dibutuhkan: <b>${pointsNeeded} points</b>\nPoint Anda: <b>${userPoints} points</b>`, getBackButton('redeem_points'));
    return;
  }
  
  // Generate credentials
  let credentials = utils.generateRedeemCredentials();
  const table = gameType === 'ff' ? 'freefire' : 'ffmax';
  
  // Check if username exists
  let attempts = 0;
  while (await db.isUsernameExists(credentials.username, table) && attempts < 10) {
    credentials = utils.generateRedeemCredentials();
    attempts++;
  }
  
  if (attempts >= 10) {
    await telegram.editMessageSmart(chatId, messageId, '❌ <b>Gagal generate username unik!</b>\n\nSilakan coba lagi.', getBackButton('redeem_points'));
    return;
  }
  
  // Redeem points first
  if (!await db.redeemUserPoints(chatId, pointsNeeded, `Penukaran lisensi ${duration} hari`)) {
    await telegram.editMessageSmart(chatId, messageId, '❌ <b>Gagal menukar point!</b>\n\nTerjadi kesalahan sistem. Silakan coba lagi.', getBackButton('redeem_points'));
    return;
  }
  
  // Save license
  if (await db.saveLicense(table, credentials.username, credentials.password, duration, 'DIMZ1945')) {
    const gameName = gameType === 'ff' ? 'FREE FIRE' : 'FREE FIRE MAX';
    const expiryDate = utils.formatDate(new Date(Date.now() + duration * 24 * 60 * 60 * 1000));
    const newUserPoints = await db.getUserPoints(chatId);
    
    const message = `🎉 <b>PENUKARAN POINT BERHASIL!</b>\n\n` +
      `Anda berhasil menukar <b>${pointsNeeded} points</b>\n` +
      `Untuk lisensi <b>${gameName}</b> selama <b>${duration} hari</b>\n\n` +
      `📱 <b>AKUN ANDA:</b>\n` +
      `Username: <code>${credentials.username}</code>\n` +
      `Password: <code>${credentials.password}</code>\n` +
      `Tipe Key: <b>REDEEM (AUTO RANDOM)</b>\n\n` +
      `⏰ <b>MASA AKTIF:</b>\n` +
      `Berlaku hingga: <b>${expiryDate} WIB</b>\n\n` +
      `🎮 <b>JENIS GAME:</b> ${gameName}\n` +
      `💰 <b>SISA POINT:</b> ${newUserPoints} points\n\n` +
      `✨ <b>Selamat bermain!</b> 🎮\n\n` +
      `📁 <b>Untuk file dan tutorial instalasi:</b>\n` +
      `Klik tombol '📁 File & Cara Pasang' di bawah`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '📁 File & Cara Pasang', url: 'https://t.me/+RY2yMHn_jts3YzA1' }],
        [
          { text: '🎁 Tukar Lagi', callback_data: 'redeem_points' },
          { text: '🛒 Beli Lisensi', callback_data: 'new_order' }
        ],
        [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }]
      ]
    };
    
    await telegram.sendPhoto(chatId, config.WELCOME_IMAGE, message, keyboard);
    
    // Notify admin
    const adminMessage = `🎁 <b>PENUKARAN POINT BARU!</b>\n\n` +
      `User ID: <code>${chatId}</code>\n` +
      `Jenis Game: <b>${gameName}</b>\n` +
      `Durasi: <b>${duration} Hari</b>\n` +
      `Tipe Key: <b>REDEEM (AUTO RANDOM)</b>\n` +
      `Username: <code>${credentials.username}</code>\n` +
      `Password: <code>${credentials.password}</code>\n` +
      `Point Ditukar: <b>${pointsNeeded} points</b>\n` +
      `Masa Aktif: <b>${expiryDate} WIB</b>\n` +
      `Waktu: ${utils.formatDate(new Date())}`;
    
    await telegram.notifyAdmin(adminMessage);
    await db.clearUserState(chatId);
  } else {
    // Refund points
    await db.addUserPoints(chatId, pointsNeeded, 'Refund gagal penukaran');
    await telegram.editMessageSmart(chatId, messageId, '❌ <b>Gagal membuat lisensi!</b>\n\nPoint telah dikembalikan. Silakan coba lagi.', getBackButton('redeem_points'));
  }
}

async function checkPaymentManually(chatId, messageId) {
  const order = await db.getPendingOrder(chatId);
  
  if (!order) {
    await telegram.editMessageSmart(chatId, messageId, '❌ Tidak ada pesanan pending ditemukan.', getBackButton('new_order'));
    return;
  }
  
  // Check if expired
  const orderTime = new Date(order.created_at).getTime();
  const currentTime = Date.now();
  const timeDiff = Math.floor((currentTime - orderTime) / 1000);
  
  if (timeDiff > config.ORDER_TIMEOUT) {
    await db.updateOrderStatus(order.deposit_code, 'expired');
    await telegram.editMessageSmart(chatId, messageId, '❌ <b>Pesanan telah expired!</b>\n\nPembayaran tidak dilakukan dalam waktu 10 menit.\n\nSilakan buat pesanan baru.', getBackButton('new_order'));
    return;
  }
  
  const paymentStatus = await payment.checkPaymentStatus(order.deposit_code);
  
  if (paymentStatus) {
    await processSuccessfulPayment(chatId, order);
  } else {
    const remainingTime = config.ORDER_TIMEOUT - timeDiff;
    const remainingMinutes = Math.floor(remainingTime / 60);
    const remainingSeconds = remainingTime % 60;
    
    const statusMessage = `⏳ <b>Status Pembayaran: PENDING</b>\n\n` +
      `Pembayaran Anda masih dalam proses.\n\n` +
      `⏰ <b>Sisa Waktu:</b> ${remainingMinutes}m ${remainingSeconds}s\n` +
      `🔄 <b>Cek otomatis setiap 20 detik</b>\n\n` +
      `Silakan tunggu beberapa saat dan coba lagi.`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔄 Cek Lagi', callback_data: 'check_payment' }],
        [{ text: '❌ Batalkan', callback_data: 'cancel_order' }]
      ]
    };
    
    await telegram.editMessageSmart(chatId, messageId, statusMessage, keyboard);
  }
}

async function checkExtendPayment(chatId, messageId) {
  const order = await db.getPendingOrder(chatId);
  
  if (!order || order.key_type !== 'extend') {
    await telegram.editMessageSmart(chatId, messageId, '❌ Tidak ada pesanan extend ditemukan.', getBackButton('extend_user'));
    return;
  }
  
  const orderTime = new Date(order.created_at).getTime();
  const currentTime = Date.now();
  const timeDiff = Math.floor((currentTime - orderTime) / 1000);
  
  if (timeDiff > config.ORDER_TIMEOUT) {
    await db.updateOrderStatus(order.deposit_code, 'expired');
    await telegram.editMessageSmart(chatId, messageId, '❌ <b>Pesanan extend telah expired!</b>\n\nPembayaran tidak dilakukan dalam waktu 10 menit.', getBackButton('extend_user'));
    return;
  }
  
  const paymentStatus = await payment.checkPaymentStatus(order.deposit_code);
  
  if (paymentStatus) {
    await processSuccessfulPayment(chatId, order);
  } else {
    const remainingTime = config.ORDER_TIMEOUT - timeDiff;
    const remainingMinutes = Math.floor(remainingTime / 60);
    const remainingSeconds = remainingTime % 60;
    
    const statusMessage = `⏳ <b>Status Extend: PENDING</b>\n\n` +
      `Pembayaran extend masih dalam proses.\n\n` +
      `⏰ <b>Sisa Waktu:</b> ${remainingMinutes}m ${remainingSeconds}s\n` +
      `🔄 <b>Cek otomatis setiap 20 detik</b>\n\n` +
      `Silakan tunggu beberapa saat dan coba lagi.`;
    
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔄 Cek Lagi', callback_data: 'check_extend' }],
        [{ text: '❌ Batalkan', callback_data: 'cancel_order' }]
      ]
    };
    
    await telegram.editMessageSmart(chatId, messageId, statusMessage, keyboard);
  }
}

async function processSuccessfulPayment(chatId, order) {
  if (order.key_type === 'extend') {
    // Process extend
    if (await db.extendLicense(order.manual_username, order.manual_password, order.duration, order.game_type)) {
      const userData = await db.getUserByCredentials(order.manual_username, order.manual_password, order.game_type);
      
      if (userData) {
        const newExpDate = utils.formatDate(userData.expDate);
        await sendExtendSuccess(chatId, userData, order.duration, newExpDate);
        await db.updateOrderStatus(order.deposit_code, 'completed');
      }
    }
  } else {
    // Process new license
    let credentials;
    if (order.key_type === 'manual') {
      credentials = {
        username: order.manual_username,
        password: order.manual_password
      };
    } else {
      credentials = utils.generateRandomCredentials();
    }
    
    const table = order.game_type === 'ff' ? 'freefire' : 'ffmax';
    
    if (await db.saveLicense(table, credentials.username, credentials.password, order.duration, config.MERCHANT_CODE)) {
      await sendLicenseToUser(chatId, order.game_type, order.duration, credentials, order.key_type);
      await db.updateOrderStatus(order.deposit_code, 'completed');
    }
  }
}

async function sendLicenseToUser(chatId, gameType, duration, credentials, keyType) {
  const gameName = gameType === 'ff' ? 'FREE FIRE' : 'FREE FIRE MAX';
  const expiryDate = utils.formatDate(new Date(Date.now() + duration * 24 * 60 * 60 * 1000));
  
  const pointsEarned = utils.calculatePointsForDuration(duration);
  await db.addUserPoints(chatId, pointsEarned, `Pembelian lisensi ${duration} hari`);
  
  const userPoints = await db.getUserPoints(chatId);
  
  const message = `🎉 <b>PEMBAYARAN BERHASIL!</b>\n\n` +
    `Terima kasih telah membeli lisensi <b>${gameName}</b>\n` +
    `Durasi: <b>${duration} Hari</b>\n` +
    `Tipe Key: <b>${keyType === 'manual' ? 'MANUAL' : 'RANDOM'}</b>\n\n` +
    `📱 <b>AKUN ANDA:</b>\n` +
    `Username: <code>${credentials.username}</code>\n` +
    `Password: <code>${credentials.password}</code>\n\n` +
    `⏰ <b>MASA AKTIF:</b>\n` +
    `Berlaku hingga: <b>${expiryDate} WIB</b>\n\n` +
    `🎁 <b>REWARD POINT:</b>\n` +
    `Anda mendapatkan <b>${pointsEarned} points</b>\n` +
    `Total point Anda: <b>${userPoints} points</b>\n\n` +
    `✨ <b>Selamat bermain!</b> 🎮\n\n` +
    `📁 <b>Untuk file dan tutorial instalasi:</b>\n` +
    `Klik tombol '📁 File & Cara Pasang' di bawah`;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '📁 File & Cara Pasang', url: 'https://t.me/+RY2yMHn_jts3YzA1' }],
      [
        { text: '🔄 Beli Lagi', callback_data: 'new_order' },
        { text: '🎁 Tukar Point', callback_data: 'redeem_points' }
      ],
      [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }]
    ]
  };
  
  await telegram.sendPhoto(chatId, config.WELCOME_IMAGE, message, keyboard);
  
  // Notify admin
  const adminMessage = `💰 <b>PEMBELIAN BERHASIL!</b>\n\n` +
    `User ID: <code>${chatId}</code>\n` +
    `Jenis Game: <b>${gameName}</b>\n` +
    `Durasi: <b>${duration} Hari</b>\n` +
    `Tipe Key: <b>${keyType === 'manual' ? 'MANUAL' : 'RANDOM'}</b>\n` +
    `Username: <code>${credentials.username}</code>\n` +
    `Password: <code>${credentials.password}</code>\n` +
    `Point Diberikan: <b>${pointsEarned} points</b>\n` +
    `Masa Aktif: <b>${expiryDate} WIB</b>\n` +
    `Waktu: ${utils.formatDate(new Date())}`;
  
  await telegram.notifyAdmin(adminMessage);
}

async function sendExtendSuccess(chatId, userData, duration, newExpDate) {
  const gameName = userData.game_type === 'ff' ? 'FREE FIRE' : 'FREE FIRE MAX';
  const currentExp = utils.formatDate(userData.expDate);
  
  const pointsEarned = utils.calculatePointsForDuration(duration);
  await db.addUserPoints(chatId, pointsEarned, `Extend lisensi ${duration} hari`);
  
  const userPoints = await db.getUserPoints(chatId);
  
  const message = `🎉 <b>EXTEND BERHASIL!</b>\n\n` +
    `Akun Anda berhasil di-extend\n` +
    `Jenis: <b>${gameName}</b>\n` +
    `Username: <code>${userData.username}</code>\n` +
    `Durasi Tambahan: <b>${duration} Hari</b>\n` +
    `Masa Aktif Lama: <b>${currentExp} WIB</b>\n` +
    `Masa Aktif Baru: <b>${newExpDate} WIB</b>\n\n` +
    `🎁 <b>REWARD POINT:</b>\n` +
    `Anda mendapatkan <b>${pointsEarned} points</b>\n` +
    `Total point Anda: <b>${userPoints} points</b>\n\n` +
    `✨ <b>Selamat bermain!</b> 🎮\n\n` +
    `📁 <b>Untuk file dan tutorial instalasi:</b>\n` +
    `Klik tombol '📁 File & Cara Pasang' di bawah`;
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '📁 File & Cara Pasang', url: 'https://t.me/+RY2yMHn_jts3YzA1' }],
      [
        { text: '🔄 Extend Lagi', callback_data: 'extend_user' },
        { text: '🎁 Tukar Point', callback_data: 'redeem_points' }
      ],
      [{ text: '🔄 Beli Baru', callback_data: 'new_order' }],
      [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }]
    ]
  };
  
  await telegram.sendPhoto(chatId, config.WELCOME_IMAGE, message, keyboard);
  
  // Notify admin
  const adminMessage = `⏰ <b>EXTEND BERHASIL!</b>\n\n` +
    `User ID: <code>${chatId}</code>\n` +
    `Jenis Game: <b>${gameName}</b>\n` +
    `Username: <code>${userData.username}</code>\n` +
    `Durasi: <b>${duration} Hari</b>\n` +
    `Point Diberikan: <b>${pointsEarned} points</b>\n` +
    `Masa Aktif Baru: <b>${newExpDate} WIB</b>\n` +
    `Waktu: ${utils.formatDate(new Date())}`;
  
  await telegram.notifyAdmin(adminMessage);
}

async function cancelOrder(chatId, messageId) {
  const order = await db.getPendingOrder(chatId);
  if (order) {
    await db.updateOrderStatus(order.deposit_code, 'cancelled');
  }
  await db.clearUserState(chatId);
  await telegram.editMessageSmart(chatId, messageId, '❌ Pesanan dibatalkan.', getBackButton());
}

async function showHelp(chatId, messageId) {
  const userPoints = await db.getUserPoints(chatId);
  
  const helpMessage = `ℹ️ <b>BANTUAN</b>\n\n` +
    `💰 <b>Point Anda:</b> ${userPoints} points\n\n` +
    `📝 <b>Cara Penggunaan:</b>\n` +
    `1. Pilih 'Beli Lisensi Baru' untuk pembelian baru\n` +
    `2. Pilih 'Extend Masa Aktif' untuk memperpanjang\n` +
    `3. Pilih 'Tukar Point' untuk lisensi gratis\n` +
    `4. Ikuti instruksi yang diberikan\n\n` +
    `🔧 <b>Fitur:</b>\n` +
    `• Support Free Fire & Free Fire MAX\n` +
    `• Pembayaran QRIS otomatis\n` +
    `• Extend masa aktif\n` +
    `• Key random & manual\n` +
    `• Sistem point/reward\n\n` +
    `🎁 <b>Sistem Point:</b>\n` +
    `• Dapatkan point dari setiap pembelian\n` +
    `• 12 points = 1 hari lisensi gratis\n` +
    `• Point tidak memiliki masa kedaluwarsa\n\n` +
    `⏰ <b>Pembayaran Otomatis:</b>\n` +
    `• QR berlaku selama 10 menit\n` +
    `• Cek pembayaran otomatis setiap 20 detik\n` +
    `• QR terhapus otomatis jika tidak dibayar\n` +
    `• Pesan sukses tidak akan dihapus\n\n` +
    `❓ <b>Pertanyaan?</b>\n` +
    `Hubungi admin jika ada kendala @dimasvip1120`;
  
  await showMainMenu(chatId, helpMessage, messageId);
}

function getBackButton(previousAction = '') {
  const buttons = [];
  
  if (previousAction) {
    buttons.push([{ text: '↩️ Kembali', callback_data: previousAction }]);
  }
  
  buttons.push([{ text: '🏠 Menu Utama', callback_data: 'main_menu' }]);
  
  return { inline_keyboard: buttons };
}
