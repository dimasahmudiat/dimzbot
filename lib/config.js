// Configuration module
module.exports = {
  // Bot Configuration
  BOT_TOKEN: process.env.BOT_TOKEN || '8506485993:AAHj4Rbis59F6N4Ap4GPGUwiN-8ugfpYgNw',
  ADMIN_CHAT_ID: process.env.ADMIN_CHAT_ID || '6201552432',
  WELCOME_IMAGE: process.env.WELCOME_IMAGE || 'https://dimzmods.my.id/demobot/img/contoh1.jpg',
  
  // Database Configuration
  DB_CONFIG: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'dimc6971_Dimas1120',
    password: process.env.DB_PASSWORD || 'dimasahm12',
    database: process.env.DB_NAME || 'dimc6971_Dimas_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+07:00'
  },
  
  // Payment API Configuration
  API_KEY: process.env.API_KEY || 'AjnQBMAhSZ4kJhqp',
  MERCHANT_CODE: process.env.MERCHANT_CODE || 'DIMZ1945',
  
  // Timeout Configuration (10 minutes)
  ORDER_TIMEOUT: 600,
  PAYMENT_CHECK_INTERVAL: 20,
  
  // Price Configuration
  PRICES: {
    '1': 15000,
    '2': 30000,
    '3': 40000,
    '4': 50000,
    '6': 70000,
    '8': 90000,
    '10': 100000,
    '15': 150000,
    '20': 180000,
    '30': 250000
  },
  
  // Point Configuration
  POINT_RULES: {
    '1': 1,
    '2': 1,
    '3': 2,
    '4': 3,
    '6': 4,
    '8': 5,
    '10': 6,
    '15': 8,
    '20': 10,
    '30': 15
  },
  
  POINTS_PER_DAY: 12
};
