var url = require('url');

var redisURL;

if (process.env.REDISCLOUD_URL) {
  redisURL = url.parse(process.env.REDISCLOUD_URL);
}

var redisConfig = {
  develop: {
    port: 6379,
    hostanme: 'localhost'
  },
  production: {
    port: (redisURL ? redisURL.port : 6379),
    hostanme: (redisURL ? redisURL.hostname : 'localhost'),
    options: {
      no_ready_check: true
    }
  }
};

var _config = redisConfig.develop;
if (redisConfig.production !== undefined && process.env.NODE_ENV == 'production') {
  _config = redisConfig.production;
}

module.exports = _config;
