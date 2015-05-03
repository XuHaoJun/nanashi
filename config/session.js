var session = require('express-session');
var RedisStore = require('connect-redis')(session);

var redisConfig = require('./redis');
redisConfig = JSON.parse(JSON.stringify(redisConfig));
redisConfig.db = 1;
var redisStore = new RedisStore(redisConfig);

var sessionConfig = {
  develop: {
    secret: 'yourSecretKey',
    store: redisStore,
    resave: false,
    saveUninitialized: false
  },
  production: {
    secret: 'YourSecretKey',
    store: redisStore,
    resave: false,
    saveUninitialized: false
  }
};

var _config = sessionConfig.develop;
if (sessionConfig.production !== undefined && process.env.NODE_ENV == 'production') {
  _config = sessionConfig.production;
}

module.exports = _config;
