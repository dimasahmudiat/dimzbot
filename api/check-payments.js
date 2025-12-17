const db = require('../lib/database');
const payment = require('../lib/payment');
const telegram = require('../lib/telegram');
const config = require('../lib/config');
const utils = require('../lib/utils');

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Cron job endpoint to check pending payments
module.exports = async (req, res) => {
  try {
    log('Starting payment check cron job...');
    
    // Get all pending orders
    const pendingOrders = await db.query(
      'SELECT * FROM pending_orders WHERE status = "pending"'
    );
    
    log(`Found ${pendingOrders.length} pending orders`);
    
    let processedCount = 0;
    let expiredCount = 0;
    
    for (const order of pendingOrders) {
      const orderTime = new Date(order.created_at).getTime();
      const currentTime = Date.now();
      const timeDiff = Math.floor((currentTime - orderTime) / 1000);
      
      // Check if expired
      if (timeDiff > config.ORDER_TIMEOUT) {
        await db.updateOrderStatus(order.deposit_code, 'expired');
        expiredCount++;
        log(`Order expired: ${order.order_id}`);
        continue;
      }
      
      // Check payment status
      const paymentStatus = await payment.checkPaymentStatus(order.deposit_code);
      
      if (paymentStatus) {
        log(`Payment successful for order: ${order.order_id}`);
        
        // Process based on order type
        if (order.key_type === 'extend') {
          // Process extend
          if (await db.extendLicense(order.manual_username, order.manual_password, order.duration, order.game_type)) {
            const userData = await db.getUserByCredentials(order.manual_username, order.manual_password, order.game_type);
            
            if (userData) {
              const newExpDate = utils.formatDate(userData.expDate);
              await sendExtendSuccess(order.chat_id, userData, order.duration, newExpDate);
              await db.updateOrderStatus(order.deposit_code, 'completed');
              processedCount++;
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
            await sendLicenseToUser(order.chat_id, order.game_type, order.duration, credentials, order.key_type);
            await db.updateOrderStatus(order.deposit_code, 'completed');
            processedCount++;
          }
        }
      }
    }
    
    log(`Payment check completed - Processed: ${processedCount}, Expired: ${expiredCount}`);
    
    res.status(200).json({
      success: true,
      pending_orders: pendingOrders.length,
      processed: processedCount,
      expired: expiredCount
    });
  } catch (error) {
    log(`Error in payment check: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

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
