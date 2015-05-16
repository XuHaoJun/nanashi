var os = require("os");
var serverConfig = {
  develop: {
    appName: 'nanashi-test',
    hostname: os.hostname(),
    cluster: {
      disable: true,
      workers: 2
    },
    port: process.env.PORT || 3000,
    staticDirectory: 'client/dist'
  },
  production: {
    appName: 'nanashi',
    hostname: os.hostname(),
    cluster: {
      disable: true,
      workers: process.env.WORKERS || process.env.WEB_CONCURRENCY || 2
    },
    port: process.env.PORT || 3000,
    staticDirectory: 'public'
  }
};

var _config = serverConfig.develop;
if (serverConfig.production !== undefined && process.env.NODE_ENV == 'production') {
  _config = serverConfig.production;
}

module.exports = _config;
