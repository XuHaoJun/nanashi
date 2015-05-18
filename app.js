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
  var msgpack = require('msgpack5')();
  var models = require('./app/models');
  var knex = models.knex;
  var bookshelf = models.bookshelf;
  var Redis = require('ioredis');
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

  var redisClient = new Redis(configs.redis.getURL());
  redisClient =  Promise.promisifyAll(redisClient);

  redisClient.on('error', logger.info);

  fs.readFileAsync(__dirname+'/redis-scripts/checkAndSet.lua', 'utf8')
    .then(function(script) {
      redisClient.defineCommand('checkAndSet', {
        numberOfKeys: 1,
        lua: script.toString('utf8')
      });
    }).catch(logger.info);

  // TODO
  // should check online node clusters
  redisClient.incrAsync('numProcess')
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

  app.use(require('./app/controllers').passport.initialize());
  app.use(require('./app/controllers').passport.session());

  require('./app/routes').addToExpress(app);

  function handleAuthed(accountId, socket) {
    redisClient
      .lrangeAsync('chatMessages', 0, -1)
      .then(function(messages) {
        if (messages.length > 0) {
          socket.emit('chat', messages.reverse());
        }
      });
    socket.join('onlineAccounts');
    logger.info({accountId: accountId}, 'socket.io:loign');
    socket.on('chat', function(msg) {
      redisClient
        .hgetAsync('onlineAccountUsernames', accountId)
        .then(function(username) {
          var sendMessage = function(username) {
            var finalMsg = username + ': ' + msg;
            redisClient.lpush('chatMessages', finalMsg);
            redisClient.ltrim('chatMessages', 0, 99);
            io.to('onlineAccounts').emit('chat', finalMsg);
            logger.info({accountId: accountId, finalMessage: finalMsg}, 'chat');
          };
          if (username === null) {
            models.Account
              .getUsername(accountId)
              .then(function(username) {
                redisClient.hset('onlineAccountUsernames', accountId, username);
                sendMessage(username);
              })
              .catch(logger.info);
          } else {
            sendMessage(username);
          }
        }).catch(logger.info);
    });
    socket.on('battle', function(payload) {
      switch(payload.action) {
      case 'requestNPC':
        // check payload's form
        logger.info({accountId: accountId, payload: payload}, 'battle:requestNPC');
        redisClient
          .hgetBuffer('account:battlePC2NPC1v1', accountId, function(err, battle) {
            var found = (battle !== null);
            if (found) {
              battle = msgpack.decode(battle);
              delete battle.mergedCardParty;
              socket.emit('battle',
                          {action: 'initialize',
                           battlePC2NPC1v1: battle
                          });
              return;
            }
            function toAccountBattleCardPartyInfo(cardPartyInfo) {
              var bcpi = {
                name: cardPartyInfo.name
              };
              var cardParty = _.sortBy(cardPartyInfo.cardParty, function(cp) {
                return cp.slot_index;
              });
              for(var i = 0; i<cardParty.length; i++) {
                var cp = cardParty[i];
                cp.cardPartyInfoIndex = 0;
                cp.round_card_slot_index = i;
                cp.round_player = 'PC';
                cp.max_hp = (cp.card.hp_effort * 3) + cp.card.baseCard.hp;
                cp.hp = cp.max_hp;
                cp.spd = (cp.card.spd_effort * 3) + cp.card.baseCard.spd;
                cp.atk = (cp.card.atk_effort * 3) + cp.card.baseCard.atk;
                cp.def = (cp.card.def_effort * 3) + cp.card.baseCard.def;
                cp.base_card_id = cp.card.base_card_id;
                cp.account_id = cp.card.account_id;
                cp.level = cp.card.level;
                cp.name = cp.card.baseCard.name;
                cp.skill1 = cp.card.skill1;
                cp.skill2 = cp.card.skill2;
                cp.skill3 = cp.card.skill3;
                cp.skill4 = cp.card.skill4;
                delete cp.card;
              }
              bcpi.cardParty = cardParty;
              return bcpi;
            }
            models.Account
              .where('id', accountId)
              .fetch({
                withRelated: ['cardPartyInfo', 'cardPartyInfo.cardParty',
                              'cardPartyInfo.cardParty.card',
                              'cardPartyInfo.cardParty.card.baseCard']})
              .then(function(account) {
                var battlePC2NPC1v1 = {
                  num_round: 0,
                  npc_id: payload.npcId,
                  account_id: accountId,
                  diedCards: []
                };
                var cardPartyInfo = account.related('cardPartyInfo').toJSON();
                var accountBattleCardPartyInfo = toAccountBattleCardPartyInfo(cardPartyInfo[0]);
                var npcBattleCardPartyInfo = models.NPCs.get(payload.npcId).get('battleCardPartyInfo').toJSON();
                battlePC2NPC1v1.accountBattleCardPartyInfo = accountBattleCardPartyInfo;
                battlePC2NPC1v1.npcBattleCardPartyInfo = npcBattleCardPartyInfo;
                socket.emit('battle',
                            {action: 'initialize',
                             battlePC2NPC1v1: battlePC2NPC1v1
                            });
                var mergedCardParty = _.take(accountBattleCardPartyInfo.cardParty, 3)
                      .concat(_.take(npcBattleCardPartyInfo.cardParty, 3));
                mergedCardParty = _.sortBy(_.shuffle(mergedCardParty), 'spd').reverse();
                battlePC2NPC1v1.mergedCardParty = mergedCardParty;
                var packedBattle = msgpack.encode(battlePC2NPC1v1);
                redisClient.hset('account:battlePC2NPC1v1', accountId, packedBattle);
              }).catch(logger.info);
          });
        break;
      case 'requestPC':
        // payload.accountId
        break;
      case 'useSkillsByPC':
        logger.info({accountId: accountId, payload: payload}, 'battle:userSkillsByPC');
        redisClient
          .hgetBufferAsync(new Buffer('account:'+payload.battleType), accountId)
          .then(function(battle) {
            var found = (battle !== null);
            if (!found) {
              // should throw error
              return;
            }
            battle = msgpack.decode(battle);
            var npcCardParty = battle.npcBattleCardPartyInfo.cardParty;
            var accountCardParty = battle.accountBattleCardPartyInfo.cardParty;
            var targetCardParty;
            var useSkills = payload.prepareUseSkills;
            var useSkill;
            var mergedCardParty = battle.mergedCardParty;
            var length = mergedCardParty.length;
            var i;
            var effectsQueue = [];
            var target;
            var effect;
            var card;
            var skillId;
            var diedCard;
            for (i = 0; i<length; i++) {
              card = mergedCardParty[i];
              if (card.round_player === 'NPC' && card.hp > 0) {
                targetCardParty = accountCardParty;
                target = _.sample(_.take(targetCardParty, 3));
                target.hp -= 1;
                skillId = 1;
                if (target.hp === 0) {
                  targetCardParty.splice(target.round_card_slot_index, 1);
                  battle.diedCards.push(target);
                  targetCardParty.forEach(function(card, index) {
                    card.round_card_slot_index = index;
                  });
                  if (targetCardParty.length === 0) {
                    socket.emit('battle', {
                      action: 'handleComplete',
                      battleType: 'battlePC2NPC1v1',
                      complete: {
                        winer: 'NPC',
                        loser: 'PC'
                      }
                    });
                    return;
                  }
                }
                effect = {
                  skillId:skillId,
                  user: {
                    round_player: card.round_player,
                    round_card_slot_index: card.round_card_slot_index
                  },
                  effects: [
                    {
                      hp: {
                        $dec: {
                          value: 1,
                          target: {round_player: target.round_player,
                                   round_card_slot_index: target.round_card_slot_index}
                        }
                      }
                    }
                  ]
                };
                effectsQueue.push(effect);
              } else if(card.round_player === 'PC' && card.hp > 0) {
                useSkill = _.find(useSkills, function(us) {
                  return us.round_card_slot_index == card.round_card_slot_index;
                });
                skillId = useSkill.skillId;
                targetCardParty = (useSkill.target.round_player === 'NPC' ? npcCardParty : accountCardParty);
                target = targetCardParty[useSkill.target.round_card_slot_index];
                if (!target) {
                  target = targetCardParty[0];
                }
                target.hp -= 1;
                if (target.hp === 0) {
                  targetCardParty.splice(target.round_card_slot_index, 1);
                  target.round_card_slot_index = -1;
                  battle.diedCards.push(target);
                  targetCardParty.forEach(function(card, index) {
                    card.round_card_slot_index = index;
                  });
                  // check win
                  if (targetCardParty.length === 0) {
                    socket.emit('battle', {
                      action: 'handleComplete',
                      battleType: 'battlePC2NPC1v1',
                      complete: {
                        winer: 'PC',
                        loser: 'NPC'
                      }
                    });
                    return;
                  }
                }
                effect = {
                  skillId:skillId,
                  user: {
                    round_player: card.round_player,
                    round_card_slot_index: card.round_card_slot_index
                  },
                  effects: [
                    {
                      hp: {
                        $dec: {
                          value: 1,
                          target: {round_player: target.round_player,
                                   round_card_slot_index: target.round_card_slot_index}
                        }
                      }
                    }
                  ]
                };
                effectsQueue.push(effect);
              }
            }
            battle.num_round += 1;
            var newMergedCardParty = _.take(accountCardParty, 3)
                  .concat(_.take(npcCardParty, 3));
            newMergedCardParty = _.sortBy(_.shuffle(mergedCardParty), 'spd').reverse();
            battle.mergedCardParty = newMergedCardParty;
            var packedBattle = msgpack.encode(battle);
            redisClient
              .hsetAsync('account:battlePC2NPC1v1', accountId, packedBattle)
              .then(function() {
                socket.emit('battle', {
                  action: 'handleEffectsQueue',
                  battleType: 'battlePC2NPC1v1',
                  effectsQueue: effectsQueue
                });
              });
          });
        break;
      default:
        // never run this.
        // may disconnect it!
        break;
      }
    });
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
        handleAuthed(accountId, socket);
        models.Account
          .getUsername(accountId)
          .then(function(username) {
            return redisClient.hsetAsync('onlineAccountUsernames', accountId, username);
          }).catch(logger.info);
      }).catch(function(err) {
        console.log(err);
      });
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
      .incrbyAsync('numProcess', -1)
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
