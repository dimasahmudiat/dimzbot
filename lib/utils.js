const config = require('./config');

// Generate random credentials
function generateRandomCredentials() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  
  let username = '';
  for (let i = 0; i < 2; i++) {
    username += letters[Math.floor(Math.random() * letters.length)];
  }
  for (let i = 0; i < 2; i++) {
    username += numbers[Math.floor(Math.random() * numbers.length)];
  }
  
  let password = '';
  for (let i = 0; i < 2; i++) {
    password += numbers[Math.floor(Math.random() * numbers.length)];
  }
  
  return { username, password };
}

// Generate redeem credentials
function generateRedeemCredentials() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  
  let username = 'redeem';
  username += numbers[Math.floor(Math.random() * numbers.length)];
  for (let i = 0; i < 2; i++) {
    username += letters[Math.floor(Math.random() * letters.length)];
  }
  
  const password = numbers[Math.floor(Math.random() * numbers.length)];
  
  return { username, password };
}

// Calculate points for duration
function calculatePointsForDuration(duration) {
  return config.POINT_RULES[duration] || 0;
}

// Calculate points needed for days
function calculatePointsNeededForDays(days) {
  return days * config.POINTS_PER_DAY;
}

// Format date
function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

// Format currency
function formatCurrency(amount) {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

module.exports = {
  generateRandomCredentials,
  generateRedeemCredentials,
  calculatePointsForDuration,
  calculatePointsNeededForDays,
  formatDate,
  formatCurrency
};
