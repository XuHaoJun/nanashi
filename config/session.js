var _ = require('lodash');
var session = require('express-session');
var RedisStore = require('connect-redis')(session);


var sessionConfig = {
  develop: {
    secret: 'yourSecretKey',
    store: {client: 'redis'},
    resave: false,
    saveUninitialized: false
  },
  production: {
    secret: 'YourSecretKey',
    store: {client: 'redis'},
    resave: false,
    saveUninitialized: false
  }
};

var _config = sessionConfig.develop;
if (sessionConfig.production !== undefined && process.env.NODE_ENV == 'production') {
  _config = sessionConfig.production;
}

module.exports = _config;
