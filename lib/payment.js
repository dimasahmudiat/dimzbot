const axios = require('axios');
const config = require('./config');

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

const payment = {
  // Create payment
  async createPayment(orderId, amount) {
    try {
      const url = `https://cvqris-ariepulsa.my.id/qris/?action=get-deposit&kode=${encodeURIComponent(orderId)}&nominal=${amount}&apikey=${config.API_KEY}`;
      
      log(`Creating payment: ${url}`);
      const response = await axios.get(url);
      log(`Payment response: ${JSON.stringify(response.data)}`);
      
      return response.data;
    } catch (error) {
      log(`Error creating payment: ${error.message}`);
      return null;
    }
  },

  // Check payment status
  async checkPaymentStatus(depositCode) {
    try {
      const url = `https://cvqris-ariepulsa.my.id/qris/?action=get-mutasi&kode=${encodeURIComponent(depositCode)}&apikey=${config.API_KEY}`;
      
      log(`Checking payment status: ${url}`);
      const response = await axios.get(url);
      const data = response.data;
      
      log(`Payment status response: ${JSON.stringify(data)}`);
      
      if (data && data.status && data.data && data.data.status === 'Success') {
        return data.data;
      }
      
      return false;
    } catch (error) {
      log(`Error checking payment status: ${error.message}`);
      return false;
    }
  }
};

module.exports = payment;
