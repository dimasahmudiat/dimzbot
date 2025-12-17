const axios = require('axios');
const config = require('./config');

const BASE_URL = `https://api.telegram.org/bot${config.BOT_TOKEN}`;

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

const telegram = {
  // Send message
  async sendMessage(chatId, text, replyMarkup = null) {
    try {
      const data = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      };
      
      if (replyMarkup) {
        data.reply_markup = replyMarkup;
      }
      
      const response = await axios.post(`${BASE_URL}/sendMessage`, data);
      log(`Message sent to ${chatId}: ${text.substring(0, 50)}...`);
      return response.data;
    } catch (error) {
      log(`Error sending message: ${error.message}`);
      return null;
    }
  },

  // Send photo
  async sendPhoto(chatId, photoUrl, caption = '', replyMarkup = null) {
    try {
      const data = {
        chat_id: chatId,
        photo: photoUrl,
        caption: caption,
        parse_mode: 'HTML'
      };
      
      if (replyMarkup) {
        data.reply_markup = replyMarkup;
      }
      
      const response = await axios.post(`${BASE_URL}/sendPhoto`, data);
      log(`Photo sent to ${chatId}`);
      return response.data;
    } catch (error) {
      log(`Error sending photo: ${error.message}`);
      // Fallback to text message
      return await this.sendMessage(chatId, caption, replyMarkup);
    }
  },

  // Edit message text
  async editMessageText(chatId, messageId, text, replyMarkup = null) {
    try {
      const data = {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'HTML'
      };
      
      if (replyMarkup) {
        data.reply_markup = replyMarkup;
      }
      
      const response = await axios.post(`${BASE_URL}/editMessageText`, data);
      return response.data;
    } catch (error) {
      log(`Error editing message text: ${error.message}`);
      return null;
    }
  },

  // Edit message caption
  async editMessageCaption(chatId, messageId, caption, replyMarkup = null) {
    try {
      const data = {
        chat_id: chatId,
        message_id: messageId,
        caption: caption,
        parse_mode: 'HTML'
      };
      
      if (replyMarkup) {
        data.reply_markup = replyMarkup;
      }
      
      const response = await axios.post(`${BASE_URL}/editMessageCaption`, data);
      return response.data;
    } catch (error) {
      log(`Error editing message caption: ${error.message}`);
      return null;
    }
  },

  // Smart edit (tries caption first, then text, then sends new)
  async editMessageSmart(chatId, messageId, text, replyMarkup = null) {
    // Try editing caption first (for photos)
    let result = await this.editMessageCaption(chatId, messageId, text, replyMarkup);
    if (result && result.ok) return result;
    
    // Try editing text
    result = await this.editMessageText(chatId, messageId, text, replyMarkup);
    if (result && result.ok) return result;
    
    // Fallback: send new message
    return await this.sendPhoto(chatId, config.WELCOME_IMAGE, text, replyMarkup);
  },

  // Delete message
  async deleteMessage(chatId, messageId) {
    try {
      const response = await axios.post(`${BASE_URL}/deleteMessage`, {
        chat_id: chatId,
        message_id: messageId
      });
      log(`Message ${messageId} deleted from ${chatId}`);
      return response.data;
    } catch (error) {
      log(`Error deleting message: ${error.message}`);
      return null;
    }
  },

  // Answer callback query
  async answerCallbackQuery(callbackId, text = '') {
    try {
      const data = { callback_query_id: callbackId };
      if (text) data.text = text;
      
      const response = await axios.post(`${BASE_URL}/answerCallbackQuery`, data);
      return response.data;
    } catch (error) {
      log(`Error answering callback: ${error.message}`);
      return null;
    }
  },

  // Send to admin
  async notifyAdmin(message) {
    return await this.sendMessage(config.ADMIN_CHAT_ID, message);
  }
};

module.exports = telegram;
