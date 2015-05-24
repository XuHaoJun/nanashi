var MongodbLogRawStream = require('../lib/MongodbWriteRawStream');

var _expressLogger = require('express-bunyan-logger')({
  name: require('./server').appName,
  genReqId: function(req) {
    return req.id;
  },
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

module.exports = _expressLogger;
