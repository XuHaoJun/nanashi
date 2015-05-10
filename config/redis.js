var Immutable = require('immutable');
var url = require('url');

var redisURL;

var auth_pass = null;
if (process.env.REDISCLOUD_URL) {
  redisURL = url.parse(process.env.REDISCLOUD_URL);
  auth_pass = redisURL.auth.split(":")[1];
}

var redisConfig = {
  develop: {
    client: 'ioredis',
    port: 6379,
    hostanme: 'localhost',
    options: {
      no_ready_check: true
    }
  },
  production: {
    client: 'redis',
    port: (redisURL ? redisURL.port : 6379),
    hostname: (redisURL ? redisURL.hostname : 'localhost'),
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

_config = Immutable.fromJS(_config);

module.exports = {
  get: function() {
    return _config;
  },
  getClient: function() {
    return _config.get('client');
  },
  getHostname: function() {
    return _config.get('hostname');
  },
  getOptions: function() {
    return _config.get('options') || Immutable.Map({});
  },
  getPort: function() {
    return _config.get('port');
  },
  getJSON: function() {
    return _config.toJSON();
  }
};
