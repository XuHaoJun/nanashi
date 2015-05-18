var bunyan = require('bunyan');
var Promise = require("bluebird");
var MongoClient = Promise.promisifyAll(require("mongodb"));

function MongodbRawStream() {
  this.buffer = [];
  this.db = null;
  this.collection = null;
  MongoClient
    .connectAsync(require('./mongodb').url)
    .then(function(db) {
      this.db = db;
      this.collection = db.collection('gameLog');
      var length = this.buffer.length;
      if (length > 0) {
        for (var i =0; i<length; i++) {
          this.collection.insert(this.buffer.pop());
        }
      }
    }.bind(this)).catch(console.log);
}

MongodbRawStream.prototype.write = function (rec) {
  if (this.collection) {
    this.collection.insert(rec);
  } else {
    this.buffer.push(rec);
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
