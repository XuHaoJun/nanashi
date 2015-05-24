var bunyan = require('bunyan');

var MongodbLogRawStream = require('../lib/MongodbWriteRawStream');

var _logger = bunyan.createLogger({
  name: require('./server').appName,
  streams: [
    {
      level: 'info',
      stream: new MongodbLogRawStream(require('./mongodb').url, 'httpLog'),
      type: 'raw'
    },
    {
      level: 'info',
      stream: process.stdout
    }
  ]
});

module.exports = _logger;
