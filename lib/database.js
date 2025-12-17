const mysql = require('mysql2/promise');
const config = require('./config');

// Create connection pool
const pool = mysql.createPool(config.DB_CONFIG);

// Log function
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Database helper functions
const db = {
  // Execute query with error handling
  async query(sql, params = []) {
    try {
      const [rows] = await pool.execute(sql, params);
      return rows;
    } catch (error) {
      log(`Database error: ${error.message}`);
      throw error;
    }
  },

  // Check if username exists
  async isUsernameExists(username, table = null) {
    try {
      if (table) {
        const rows = await this.query(`SELECT COUNT(*) as count FROM ${table} WHERE username = ?`, [username]);
        return rows[0].count > 0;
      } else {
        const rowsFF = await this.query('SELECT COUNT(*) as count FROM freefire WHERE username = ?', [username]);
        const rowsFFMax = await this.query('SELECT COUNT(*) as count FROM ffmax WHERE username = ?', [username]);
        return (rowsFF[0].count + rowsFFMax[0].count) > 0;
      }
    } catch (error) {
      log(`Error checking username: ${error.message}`);
      return false;
    }
  },

  // Get user by username and password
  async getUserByCredentials(username, password, gameType = null) {
    try {
      let query;
      let params;
      
      if (gameType === 'ff') {
        query = "SELECT *, 'ff' as game_type FROM freefire WHERE username = ? AND password = ?";
        params = [username, password];
      } else if (gameType === 'ffmax') {
        query = "SELECT *, 'ffmax' as game_type FROM ffmax WHERE username = ? AND password = ?";
        params = [username, password];
      } else {
        query = `
          SELECT *, 'ff' as game_type FROM freefire WHERE username = ? AND password = ?
          UNION ALL
          SELECT *, 'ffmax' as game_type FROM ffmax WHERE username = ? AND password = ?
          LIMIT 1
        `;
        params = [username, password, username, password];
      }
      
      const rows = await this.query(query, params);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      log(`Error getting user: ${error.message}`);
      return null;
    }
  },

  // Extend user license
  async extendLicense(username, password, duration, gameType) {
    try {
      const table = gameType === 'ff' ? 'freefire' : 'ffmax';
      
      // Get current expiration
      const rows = await this.query(`SELECT expDate FROM ${table} WHERE username = ? AND password = ?`, [username, password]);
      
      if (rows.length === 0) return false;
      
      const currentExpDate = new Date(rows[0].expDate);
      const now = new Date();
      
      // Calculate new expiration date
      let newExpDate;
      if (currentExpDate < now) {
        // Expired, start from now
        newExpDate = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);
      } else {
        // Active, extend from current
        newExpDate = new Date(currentExpDate.getTime() + duration * 24 * 60 * 60 * 1000);
      }
      
      // Update expiration
      const result = await this.query(
        `UPDATE ${table} SET expDate = ? WHERE username = ? AND password = ?`,
        [newExpDate, username, password]
      );
      
      log(`License extended - Username: ${username}, New expiry: ${newExpDate}`);
      return result.affectedRows > 0;
    } catch (error) {
      log(`Error extending license: ${error.message}`);
      return false;
    }
  },

  // Save license to database
  async saveLicense(table, username, password, duration, reference) {
    try {
      // Check if username exists
      if (await this.isUsernameExists(username, table)) {
        log(`Username already exists: ${username}`);
        return false;
      }
      
      const expDate = new Date(Date.now() + duration * 24 * 60 * 60 * 1000);
      const uuid = '';
      const status = '2';
      
      const result = await this.query(
        `INSERT INTO ${table} (username, password, uuid, expDate, status, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [username, password, uuid, expDate, status, reference]
      );
      
      log(`License saved - Table: ${table}, Username: ${username}, Duration: ${duration} days`);
      return result.affectedRows > 0;
    } catch (error) {
      log(`Error saving license: ${error.message}`);
      return false;
    }
  },

  // User state management
  async saveUserState(chatId, state, data = {}) {
    try {
      const jsonData = JSON.stringify(data);
      const existing = await this.query('SELECT id FROM user_states WHERE chat_id = ?', [chatId]);
      
      if (existing.length > 0) {
        await this.query(
          'UPDATE user_states SET state = ?, data = ?, error_count = 0, updated_at = NOW() WHERE chat_id = ?',
          [state, jsonData, chatId]
        );
      } else {
        await this.query(
          'INSERT INTO user_states (chat_id, state, data, error_count, created_at, updated_at) VALUES (?, ?, ?, 0, NOW(), NOW())',
          [chatId, state, jsonData]
        );
      }
      
      log(`User state saved - Chat: ${chatId}, State: ${state}`);
      return true;
    } catch (error) {
      log(`Error saving user state: ${error.message}`);
      return false;
    }
  },

  async getUserState(chatId) {
    try {
      const rows = await this.query('SELECT state, data, error_count FROM user_states WHERE chat_id = ?', [chatId]);
      if (rows.length > 0) {
        return {
          state: rows[0].state,
          data: JSON.parse(rows[0].data),
          error_count: rows[0].error_count
        };
      }
      return null;
    } catch (error) {
      log(`Error getting user state: ${error.message}`);
      return null;
    }
  },

  async clearUserState(chatId) {
    try {
      await this.query('DELETE FROM user_states WHERE chat_id = ?', [chatId]);
      log(`User state cleared - Chat: ${chatId}`);
      return true;
    } catch (error) {
      log(`Error clearing user state: ${error.message}`);
      return false;
    }
  },

  async updateUserErrorCount(chatId, errorCount) {
    try {
      await this.query('UPDATE user_states SET error_count = ?, updated_at = NOW() WHERE chat_id = ?', [errorCount, chatId]);
      return true;
    } catch (error) {
      log(`Error updating error count: ${error.message}`);
      return false;
    }
  },

  // Point system
  async getUserPoints(chatId) {
    try {
      const rows = await this.query('SELECT points FROM user_points WHERE chat_id = ?', [chatId]);
      if (rows.length > 0) {
        return rows[0].points;
      } else {
        await this.query('INSERT INTO user_points (chat_id, points, created_at, updated_at) VALUES (?, 0, NOW(), NOW())', [chatId]);
        return 0;
      }
    } catch (error) {
      log(`Error getting user points: ${error.message}`);
      return 0;
    }
  },

  async addUserPoints(chatId, points, reason = '') {
    try {
      await this.query(
        `INSERT INTO user_points (chat_id, points, created_at, updated_at) 
         VALUES (?, ?, NOW(), NOW()) 
         ON DUPLICATE KEY UPDATE points = points + ?, updated_at = NOW()`,
        [chatId, points, points]
      );
      
      if (reason) {
        await this.query(
          'INSERT INTO point_transactions (chat_id, points, type, reason, created_at) VALUES (?, ?, "earn", ?, NOW())',
          [chatId, points, reason]
        );
      }
      
      log(`Points added - Chat: ${chatId}, Points: ${points}`);
      return true;
    } catch (error) {
      log(`Error adding points: ${error.message}`);
      return false;
    }
  },

  async redeemUserPoints(chatId, points, reason = '') {
    try {
      const currentPoints = await this.getUserPoints(chatId);
      if (currentPoints < points) {
        log(`Insufficient points - Chat: ${chatId}, Current: ${currentPoints}, Needed: ${points}`);
        return false;
      }
      
      const result = await this.query('UPDATE user_points SET points = points - ?, updated_at = NOW() WHERE chat_id = ?', [points, chatId]);
      
      if (result.affectedRows > 0 && reason) {
        await this.query(
          'INSERT INTO point_transactions (chat_id, points, type, reason, created_at) VALUES (?, ?, "redeem", ?, NOW())',
          [chatId, points, reason]
        );
      }
      
      log(`Points redeemed - Chat: ${chatId}, Points: ${points}`);
      return result.affectedRows > 0;
    } catch (error) {
      log(`Error redeeming points: ${error.message}`);
      return false;
    }
  },

  // Pending orders
  async savePendingOrder(orderId, chatId, gameType, duration, amount, depositCode, keyType, manualUsername = '', manualPassword = '') {
    try {
      await this.query(
        `INSERT INTO pending_orders (order_id, chat_id, game_type, duration, amount, deposit_code, key_type, manual_username, manual_password, status, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())`,
        [orderId, chatId, gameType, duration, amount, depositCode, keyType, manualUsername, manualPassword]
      );
      
      log(`Pending order saved - Order: ${orderId}, Chat: ${chatId}`);
      return true;
    } catch (error) {
      log(`Error saving pending order: ${error.message}`);
      return false;
    }
  },

  async getPendingOrder(chatId) {
    try {
      const rows = await this.query(
        'SELECT * FROM pending_orders WHERE chat_id = ? AND status = "pending" ORDER BY created_at DESC LIMIT 1',
        [chatId]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      log(`Error getting pending order: ${error.message}`);
      return null;
    }
  },

  async updateOrderStatus(depositCode, status) {
    try {
      await this.query('UPDATE pending_orders SET status = ?, updated_at = NOW() WHERE deposit_code = ?', [status, depositCode]);
      log(`Order status updated - Deposit: ${depositCode}, Status: ${status}`);
      return true;
    } catch (error) {
      log(`Error updating order status: ${error.message}`);
      return false;
    }
  },

  async cleanupExpiredOrders() {
    try {
      const expiredTime = new Date(Date.now() - config.ORDER_TIMEOUT * 1000);
      const result = await this.query('DELETE FROM pending_orders WHERE status = "pending" AND created_at < ?', [expiredTime]);
      
      if (result.affectedRows > 0) {
        log(`Cleaned up ${result.affectedRows} expired orders`);
      }
      return result.affectedRows;
    } catch (error) {
      log(`Error cleaning up orders: ${error.message}`);
      return 0;
    }
  }
};

module.exports = db;
