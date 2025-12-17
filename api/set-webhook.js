const axios = require('axios');
const config = require('../lib/config');

// Set webhook endpoint
module.exports = async (req, res) => {
  try {
    const webhookUrl = `${process.env.VERCEL_URL || 'https://dimzbot-git-main-dimasahmudiats-projects.vercel.app'}/api/webhook`;
    
    const response = await axios.post(
      `https://api.telegram.org/bot${config.BOT_TOKEN}/setWebhook`,
      {
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query']
      }
    );
    
    console.log('Webhook set response:', response.data);
    
    res.status(200).json({
      success: true,
      webhook_url: webhookUrl,
      telegram_response: response.data
    });
  } catch (error) {
    console.error('Error setting webhook:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
