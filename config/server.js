var serverConfig = {
  develop: {
    cluster: {
      disable: false,
      workers: 2
    },
    port: process.env.PORT || 3000,
    staticDirectory: ('client/dist')
  },
  production: {
    cluster: {
      disable: false,
      workers: 2
    },
    port: process.env.PORT || 3000,
    staticDirectory: ('public')
  }
};

var _config = serverConfig.develop;
if (serverConfig.production !== undefined && process.env.NODE_ENV == 'production') {
  _config = serverConfig.production;
}

module.exports = _config;
