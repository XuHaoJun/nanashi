var session = require('express-session');
var RedisStore = require('connect-redis')(session);

var redisConfig = require('./redis');

var redisStore;
if (redisConfig) {
  redisStore = new RedisStore(redisConfig);
}

var sessionConfig = {
  develop: {
    secret: 'yourSecretKey',
    resave: false,
    saveUninitialized: true
  },
  production: {
    secret: 'YourSecretKey',
    store: redisStore
  }
};

var _config = sessionConfig.develop;
if (sessionConfig.production !== undefined && process.env.NODE_ENV == 'production') {
  _config = sessionConfig.production;
}

module.exports = _config;
