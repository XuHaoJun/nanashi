function createApp(_workerShutdownPromise, options) {
  options = options ? options : {};
  var logger = require('./config/logger');
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

  redisClient.incr('numWorkers')
    .then(function(numWorkers) {
      if (numWorkers == 1) {
        redisClient
          .multi()
          .del('onlineAccountUsernames')
          .del('onlineAccountIds')
          .exec();
      }
    });

  app.set('port', configs.server.port);

  if (configs.server.forceRedirectToHttps) {
    app.use(function (req, res, next) {
      res.setHeader('Strict-Transport-Security', 'max-age=8640000; includeSubDomains');
      if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] === "http") {
        return res.redirect(301, 'https://' + req.host + req.url);
      } else {
        return next();
      }
    });
  }

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use(compress());

  app.use(require('express-request-id')());

  app.use(require('./config/expressLogger'));

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

  io.use(function(socket, next) {
    require('express-request-id')({setHeader: false})(socket.request, socket.request.res, next);;
  });

  io.use(function(socket, next) {
    var req = socket.request;
    req.log = require('./config/socketIOLogger');
    req.log.info(
      {
        'remote-address': socket.handshake.address,
        method: req.method,
        req_id: req.id,
        url: req.url,
        headers: req.headers
      },
      'socket.io:httpRequest');
    next();
  });

  app.enable('trust proxy');

  app.use(session);

  app.use(controllers.passport.initialize());
  app.use(controllers.passport.session());

  require('./app/routes').addToExpress(app);

  function handleAuthed(io, socket, accountId) {
    logger.info({req_id: socket.request.id,
                 accountId: accountId},
                'socket.io:loign');
    controllers.chat.pullChatMessages(io, socket, accountId);
    socket.join('onlineAccounts');
    socket.on('chat',
              controllers.chat.sendMessage.bind(this, io, socket, accountId));
    socket.on('battle:requestNPC',
              controllers.battle.requestNPC.bind(this, io, socket, accountId));
    socket.on('battle:requestPC',
              controllers.battle.requestPC.bind(this, io, socket, accountId));
    socket.on('battle:useSkillsByPC',
              controllers.battle.useSkillsByPC.bind(this, io, socket, accountId));
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
        logger.info({req_id: socket.request.id,
                     accountId: accountId}, 'socket.io:disconected');
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

  function quit(resolve) {
    redisClient.quit(function(err, result) {
      logger.info('redis:quit');
      knex.destroy(function() {
        logger.info('knex:quit');
        resolve();
      });
    });
  }

  function shutdown(resolve) {
    redisClient
      .incrby('numWorkers', -1)
      .then(function(numWorkers) {
        if (numWorkers !== 0) {
          quit(resolve);
          return;
        }
        redisClient
          .multi()
          .del('onlineAccountUsernames')
          .del('onlineAccountIds')
          .exec(function() {
            quit(resolve);
          });
      });
  }

  function shutdownPromise() {
    return new Promise(function(resolve) {
      process.on('SIGINT', shutdown.bind(this, resolve));
      process.on('SIGTERM', shutdown.bind(this, resolve));
    });
  }

  _workerShutdownPromise.push(shutdownPromise());

  return http;
}

var config = require('./config').server;
var killable = require('killable');
var logger = require('./config/logger');
var Promise  = require('bluebird');
var _workerShutdownPromise = [];

function handleStartServer() {
  logger.info(config, 'server:start');
}

if (config.cluster.disable === false) {
  (function() {
    var cluster = require('cluster');
    var workers = config.cluster.workers;
    var sticky = require('sticky-session');
    var createAppFunc = createApp.bind(this, _workerShutdownPromise);
    var server = sticky(workers, createAppFunc).listen(config.port, handleStartServer);
    killable(server);
    function handleShutdown() {
      if (cluster.isMaster) {
        server.kill(function() {
          logger.info('server:shutdown');
          Promise.all(_workerShutdownPromise, function() {
            process.exit(0);
          });
        });
      }
    }
    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  }());
} else {
  (function() {
    var server = createApp(_workerShutdownPromise).listen(config.port, handleStartServer);
    killable(server);
    function handleShutdown() {
      server.kill(function() {
        logger.info('server:shutdown');
        Promise.all(_workerShutdownPromise, function() {
          process.exit(0);
        });
      });
    }
    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  }());
}
