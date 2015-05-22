var logger = require('./config/logger');

function createApp(options) {
  options = options ? options : {};
  var BufferList = require('bl');
  var configs = require('./config');
  var Promise  = require('bluebird');
  var fs = require("fs");
  Promise.promisifyAll(fs);
  var _ = require('lodash');
  var is = require('is_js');
  var compress = require('compression');
  var express = require('express');
  var expressSession = require('express-session');
  var RedisStore = require('connect-redis')(expressSession);
  var bodyParser = require('body-parser');
  var models = require('./app/models');
  var controllers = require('./app/controllers');
  var knex = models.knex;
  var bookshelf = models.bookshelf;
  var node_redis = require("redis");

  var app = express();
  var http = require('http').Server(app);
  var sioRedis = require('socket.io-redis');
  var io = require('socket.io')(http);

  var pubClientOptions = configs.redis.getOptions().toJSON();
  var subClientOptions = configs.redis.getOptions().toJSON();
  subClientOptions.detect_buffers = true;
  io.adapter(sioRedis({
    pubClient: node_redis.createClient(configs.redis.getPort(),
                                       configs.redis.getHostname(),
                                       pubClientOptions),
    subClient: node_redis.createClient(configs.redis.getPort(),
                                       configs.redis.getHostname(),
                                       subClientOptions)
  }));

  var redisClient = require('./app/models').redisClient;

  fs.readFileAsync(__dirname+'/redis-scripts/checkAndSet.lua', 'utf8')
    .then(function(script) {
      redisClient.defineCommand('checkAndSet', {
        numberOfKeys: 1,
        lua: script.toString('utf8')
      });
    }).catch(logger.info);

  // TODO
  // should check online node clusters
  redisClient.incr('numProcess')
    .then(function(numProcess) {
      if (numProcess == 1) {
        redisClient
          .multi()
          .del('onlineAccountUsernames')
          .del('onlineAccountIds')
          .exec();
      }
    });

  app.set('port', configs.server.port);

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use(compress());

  app.use(require('express-request-id')());


  function MongodbRawStream() {
    var MongoClient = Promise.promisifyAll(require("mongodb"));
    MongoClient
      .connectAsync(require('./config/mongodb').url)
      .then(function(db) {
        this.db = db;
        this.collection = db.collection('httpLog');
      }.bind(this)).catch(console.log);
  }

  MongodbRawStream.prototype.write = function (rec) {
    // TODO
    // put rec to buffer until mongodb stream open and pull recs.
    if (this.collection) {
      this.collection.insert(rec);
    }
  };

  app.use(require('express-bunyan-logger')({
    name: configs.server.appName,
    genReqId: function(req) {
      return req.id;
    },
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
  }));

  var session;
  if (configs.session.store.client == 'redis') {
    configs.session.store = new RedisStore({client: redisClient});
    session = expressSession(configs.session);
  } else {
    session = expressSession(configs.session);
  }

  io.use(function(socket, next) {
    session(socket.request, socket.request.res, next);
  });

  app.set('trust proxy', 1);

  app.use(session);

  app.use(controllers.passport.initialize());
  app.use(controllers.passport.session());

  require('./app/routes').addToExpress(app);

  function handleAuthed(io, socket, accountId) {
    logger.info({accountId: accountId}, 'socket.io:loign');
    controllers.chat.pullChatMessages(io, socket, accountId);
    socket.join('onlineAccounts');
    socket.on('chat', controllers.chat.sendMessage.bind(this, io, socket, accountId));
    socket.on('battle:requestNPC', controllers.battle.requestNPC.bind(this, io, socket, accountId));
    socket.on('battle:useSkillsByPC', controllers.battle.useSkillsByPC.bind(this, io, socket, accountId));
  }

  io.on('connection', function(socket){
    if (socket.request.session.passport) {
      var accountId = socket.request.session.passport.user;
      if (!is.existy(accountId)) {
        socket.disconnect();
        return;
      }
    } else {
      socket.disconnect();
      return;
    }
    socket.on('disconnect', function() {
      if (is.existy(accountId)) {
        logger.info({accountId: accountId}, 'socket.io:disconected');
        redisClient
          .multi()
          .setbit('onlineAccountIds', accountId, 0)
          .hdel('onlineAccountUsernames', accountId)
          .exec();
      }
    });
    redisClient.checkAndSet('onlineAccountIds', accountId)
      .then(function(result) {
        var exists = (result === null);
        if (exists) {
          socket.emit('_error', {error: 'duplicate connection.'});
          socket.disconnect();
          return;
        }
        models.Account
          .getUsername(accountId)
          .then(function(username) {
            return redisClient.hset('onlineAccountUsernames', accountId, username);
          }).catch(logger.info);
        handleAuthed(io, socket, accountId);
      }).catch(logger.info);
  });

  function quit() {
    redisClient.quit(function(err, result) {
      logger.info('redis:quit');
      knex.destroy(function() {
        logger.info('knex:quit');
      });
    });
  }

  function handleShutdown() {
    redisClient
      .incrby('numProcess', -1)
      .then(function(numProcess) {
        if (numProcess !== 0) {
          quit();
          return;
        }
        redisClient
          .multi()
          .del('onlineAccountUsernames')
          .del('onlineAccountIds')
          .exec(function() {
            quit();
          });
      });
  }
  process.on('SIGINT', handleShutdown);
  process.on('SIGTERM', handleShutdown);
  return http;
}

var cluster = require('cluster');
var config = require('./config').server;
var killable = require('killable');

function handleStartServer() {
  logger.info(config, 'server:start');
}

if (config.cluster.disable === false) {
  (function() {
    var workers = config.cluster.workers;
    var sticky = require('sticky-session');
    var server = sticky(workers, createApp).listen(config.port, handleStartServer);
    killable(server);
    function handleShutdown() {
      if (cluster.isMaster) {
        server.kill(function() {
          logger.info('server:shutdown');
          setTimeout(function() {
            process.exit(0);
          }, 350);
        });
      }
    }
    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  }());
} else {
  (function() {
    var server = createApp().listen(config.port, handleStartServer);
    killable(server);
    function handleShutdown() {
      server.kill(function() {
        logger.info('server:shutdown');
        setTimeout(function() {
          process.exit(0);
        }, 350);
      });
    }
    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  }());
}
