var Promise = require("bluebird");
var MongoClient = Promise.promisifyAll(require("mongodb"));

function MongodbRawWriteStream(url, collectionName) {
  this.buffer = [];
  this.db = null;
  this.collection = null;
  MongoClient
    .connectAsync(url)
    .then(function(db) {
      this.db = db;
      this.collection = db.collection(collectionName);
      var length = this.buffer.length;
      if (length > 0) {
        for (var i =0; i<length; i++) {
          this.collection.insert(this.buffer.pop());
        }
      }
    }.bind(this)).catch(console.log);
}

MongodbRawWriteStream.prototype.write = function (rec) {
  if (this.collection) {
    this.collection.insert(rec);
  } else {
    this.buffer.push(rec);
  }
};

module.exports = MongodbRawWriteStream;
