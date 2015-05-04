var url = require('url');

var redisURL;

var auth_pass = null;
if (process.env.REDISCLOUD_URL) {
  redisURL = url.parse(process.env.REDISCLOUD_URL);
  auth_pass = redisURL.auth.split(":")[1];
}

var redisConfig = {
  develop: {
    port: 6379,
    hostanme: 'localhost',
    options: {
      no_ready_check: true
    }
  },
  production: {
    port: (redisURL ? redisURL.port : 6379),
    hostanme: (redisURL ? redisURL.hostname : 'localhost'),
    options: {
      auth_pass: auth_pass,
      no_ready_check: true
    }
  }
};

var _config = redisConfig.develop;
if (redisConfig.production !== undefined && process.env.NODE_ENV == 'production') {
  _config = redisConfig.production;
}

module.exports = _config;
