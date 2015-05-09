var serverConfig = {
  develop: {
    staticDirectory: ('client/dist')
  },
  production: {
    staticDirectory: ('public')
  }
};

var _config = serverConfig.develop;
if (serverConfig.production !== undefined && process.env.NODE_ENV == 'production') {
  _config = serverConfig.production;
}

module.exports = _config;
