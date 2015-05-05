var _ = require('lodash');
var session = require('express-session');
var RedisStore = require('connect-redis')(session);

var redisConfig = require('./redis').getJSON();
if (redisConfig.hostname) {
  redisConfig.host = redisConfig.hostname;
}
if (redisConfig.options) {
  _.forEach(redisConfig.options, function(v, k) {
    redisConfig[k] = v;
  });
}
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
