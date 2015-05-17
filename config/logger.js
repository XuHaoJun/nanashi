var bunyan = require('bunyan');
var Promise = require("bluebird");
var MongoClient = Promise.promisifyAll(require("mongodb"));

function MongodbRawStream() {
  MongoClient
    .connectAsync(require('./mongodb').url)
    .then(function(db) {
      this.db = db;
      this.collection = db.collection('gameLog');
    }.bind(this)).catch(console.log);
}

MongodbRawStream.prototype.write = function (rec) {
  // TODO
  // put rec to buffer until mongodb stream open and pull recs.
  if (this.collection) {
    this.collection.insert(rec);
  }
};

var _logger = bunyan.createLogger({
  name: require('./server').appName,
  streams: [
    {
      level: 'info',
      stream: new MongodbRawStream(),
      type: 'raw'
    },
    {
      level: 'info',
      stream: process.stdout
    },
  ]
});

module.exports = _logger;
