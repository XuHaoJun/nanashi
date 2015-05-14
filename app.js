function createApp(options) {
  options = options ? options : {};
  var configs = require('./config');
  var Immutable = require('immutable');
  var Promise  = require('bluebird');
  var _ = require('lodash');
  var is = require('is_js');
  var checkit = require('checkit');
  var logger = require('morgan');
  var compress = require('compression');
  var express = require('express');
  var expressSession = require('express-session');
  var RedisStore = require('connect-redis')(expressSession);
  var bodyParser = require('body-parser');
  var passport = require('passport');
  var LocalStrategy = require('passport-local').Strategy;
  var FacebookStrategy = require('passport-facebook').Strategy;
  var Scripto = require('redis-scripto');
  var redis;
  if (configs.redis.getClient() == 'ioredis') {
    redis = require("ioredis");
  } else {
    redis = require("redis");
  }
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

  var redisClient = redis.createClient(configs.redis.getPort(),
                                       configs.redis.getHostname(),
                                       configs.redis.getOptions().toJSON());
  redisClient =  Promise.promisifyAll(redisClient);

  redisClient.on('error', console.log);

  var rscript = new Scripto(redisClient);
  rscript = Promise.promisifyAll(rscript);
  rscript.loadFromDir(__dirname+'/redis-scripts');

  redisClient
    .multi()
    .del('onlineAccountUsernames')
    .del('onlineAccountIds')
    .exec();

  var knex = require('knex')(configs.db);
  var bookshelf = require('bookshelf')(knex);

  // var onlineBattlingAccountIds = [];

  var battleNPCs = {};

  var npcs = {
    1: {
      name: '神奇喵喵',
      battleCardPartyInfo:
      {
        name: '神級喵喵隊',
        cardParty:
        [
          {round_card_slot_index: 0, num_round: 0, npc_id: 1, round_player: 'NPC',
           cardPartyInfoIndex: 0,
           name: '宅弟-冠愉', hp: 2, max_hp: 2, atk: 1, def: 1, spd: 999,
           skill1: 1, skill2: 0, skill3: 0, skill4: 0},
          {round_card_slot_index: 1, num_round: 0, npc_id: 1, round_player: 'NPC',
           cardPartyInfoIndex: 0,
           name: '排骨宅-建勳', hp: 3, max_hp: 3, atk: 1, def: 1, spd: 998,
           skill1: 1, skill2: 0, skill3: 0, skill4: 0},
          {round_card_slot_index: 2, num_round: 0, npc_id: 1, round_player: 'NPC',
           cardPartyInfoIndex: 0,
           name: '肥宅-至剛', hp: 9, max_hp: 9, atk: 1, def: 1, spd: 997,
           skill1: 1, skill2: 0, skill3: 0, skill4: 0}
        ]
      }
    }
  };

  npcs = Immutable.fromJS(npcs);

  var BaseCard = bookshelf.Model.extend({
    tableName: 'base_card',
    cards: function() {
      return this.hasMany(Card, 'base_card_id');
    }
  });

  var CardCreatingRules = {
    account_id: ['required', 'integer', 'min:1'],
    base_card_id: ['required', 'integer', 'min:1']
  };

  var Card = bookshelf.Model.extend({
    tableName: 'card',
    initialize: function() {
      this.on('creating', this.validateCreating);
    },
    validateCreating: function() {
      return checkit(CardCreatingRules).run(this.attributes);
    },
    cardParty: function() {
      return this.hasMany(CardParty, 'card_id');
    },
    account: function() {
      return this.belongsTo(Account, 'account_id');
    },
    baseCard: function() {
      return this.belongsTo(BaseCard, 'base_card_id');
    },
    battlePC2NPC1v1: function() {
      return this.hasOne(BattlePC2NPC1v1, 'round_card_id');
    }
  });

  var CardParty = bookshelf.Model.extend({
    tableName: 'card_party',
    card: function() {
      return this.belongsTo(Card, 'card_id');
    },
    cardPartyInfo: function() {
      return this.belongsTo(CardPartyInfo, 'card_party_info_id');
    }
  });

  var CardPartyInfo = bookshelf.Model.extend({
    tableName: 'card_party_info',
    account: function() {
      return this.belongsTo(Account, 'account_id');
    },
    cardParty: function() {
      return this.hasMany(CardParty, 'card_party_info_id');
    }
  });

  var AccountCreatingRules = {
    username: ['required', 'minLength:4', 'maxLength:24', function(val) {
      return knex('account').where('username', '=', val).then(function(resp) {
        if (resp.length > 0) throw new Error('The username is already in use.');
      });
    }],
    password: ['required', 'minLength:4', 'maxLength:24'],
    email: ['required', 'email', function(val) {
      return knex('account').where('email', '=', val).then(function(resp) {
        if (resp.length > 0) throw new Error('The email address is already in use.');
      });
    }]
  };

  var AccountAllRelation = ['deck',
                            'deck.baseCard',
                            'cardPartyInfo', 'cardPartyInfo.cardParty',
                            'cardPartyInfo.cardParty.card',
                            'cardPartyInfo.cardParty.card.baseCard'];

  var Account = bookshelf.Model.extend({
    tableName: 'account',
    initialize: function() {
      this.on('creating', this.validateCreating);
    },
    validateCreating: function() {
      return checkit(AccountCreatingRules).run(this.attributes);
    },
    deck: function() {
      return this.hasMany(Card);
    },
    cardPartyInfo: function() {
      return this.hasMany(CardPartyInfo, 'account_id');
    },
    battlePC2NPC1v1: function() {
      return this.hasOne(BattlePC2NPC1v1, 'account_id');
    }
  }, {
    register: Promise.method(function(form) {
      return (
        bookshelf.transaction(function(t) {
          return (
            this
              .forge(form)
              .save(null, {transacting: t})
              .then(function(account) {
                return (
                  CardPartyInfo
                    .forge({'account_id': account.get('id')})
                    .save(null, {transacting: t})
                );
              }).tap(function(account) {
                return account;
              })
          );
        }.bind(this))
      );
    }),
    decomposeCard: Promise.method(function(form) {
      var _cardCry = {
        '鐵': 25,
        '銅': 100,
        '銀': 400,
        '金': 1600
      };
      var cardId = form.cardId;
      var accountId = form.accountId;
      return bookshelf.transaction(function(t) {
        var getCry;
        return (
          Card
            .where({id: cardId, account_id: accountId})
            .fetch({withRelated: ['baseCard'], transacting: t})
            .then(function(card) {
              getCry = _cardCry[card.related('baseCard').get('rea')];
              return getCry;
            }).then(function(getCry) {
              return (
                Account
                  .where({id: accountId})
                  .fetch({transacting: t})
              );
            }).then(function(account) {
              return Account.forge({id: accountId}).save({cry: account.get('cry') + getCry},
                                                         {transacting: t});
            }).then(function(account) {
              return (
                CardParty
                  .where('card_id', cardId)
                  .fetch({transacting: t})
              );
            }).then(function(cardParty) {
              if (cardParty !== null) {
                return (
                  CardParty
                    .where('id', cardParty.get('id'))
                    .destroy({transacting: t})
                );
              }
              return null;
            }).then(function() {
              return Card.forge({id: cardId}).destroy({transacting: t});
            }).then(function() {
              return getCry;
            })
        );
      });
    }),
    login: Promise.method(function(username, password, options) {
      options = options ? options : {};
      var query = {username: username, password: password};
      if (options.noRelation) {
        return this.where(query).fetch({require: true});
      }
      return this.where(query)
        .fetch({require: true, withRelated: AccountAllRelation});
    }),
    getAll: Promise.method(function(accountId) {
      var query = {id: accountId};
      return this.where(query)
        .fetch({require: true, withRelated: AccountAllRelation});
    })
  });

  var BattlePC2NPC1v1 = bookshelf.Model.extend({
    tableName: 'battle_pc2npc_1v1',
    account: function() {
      return this.belongsTo(Account, 'account_id');
    },
    roundCard: function() {
      return this.belongsTo(Card, 'round_card_id');
    }
  });

  passport.use(new LocalStrategy(
    function(username, password, done) {
      // TODO
      // check facebok-xxxx
      Account
        .login(username, password, {noRelation: true})
        .then(function(account) {
          done(null, account);
        }).catch(function(err) {
          done(null, false);
        });
    }
  ));

  if (configs.oauth2.facebook) {
    passport.use(new FacebookStrategy(configs.oauth2.facebook, function(accessToken, refreshToken, profile, done) {
      Account
        .where({username: 'facebook-'+profile.id})
        .fetch({require: true})
        .then(function(account) {
          done(null, account);
        }).catch(Account.NotFoundError, function() {
          var form = {username: 'facebook-' + profile.id,
                      password: profile.id,
                      email: profile.emails[0].value,
                      account_provider_name: 'facebook'};
          Account.register(form)
            .then(function(account) {
              done(null, account);
            }).catch(function(err) {
              done(err, null);
            });
        }).catch(function(err) {
          done(err, null);
        });
    }));
  }

  passport.serializeUser(function(user, done) {
    done(null, user.get('id'));
  });

  passport.deserializeUser(function(id, done) {
    Account
      .query()
      .where({id: id})
      .select('id')
      .then(function() {
        done(null, {accountId: id});
      }).catch(function(err) {
        done(err, null);
      });
  });

  function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    return res.status(401).json({error: 'account not found.'});
  }

  app.set('port', configs.server.port);

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use(compress());

  app.use(logger('dev'));

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

  app.use(passport.initialize());
  app.use(passport.session());

  if (configs.server.staticDirectory) {
    app.use('/', express.static(configs.server.staticDirectory));
  }

  if (configs.oauth2.facebook) {
    app.get('/auth/facebook', passport.authenticate('facebook', { scope: [ 'email' ] }));

    app.get('/auth/facebook/callback', passport.authenticate('facebook'), function(req, res) {
      res.redirect('/');
    });
  }

  var apiRouter = express.Router();
  apiRouter.get('/account/:id', function(req, res) {
    var id = parseInt(req.params.id);
    if (is.nan(id)) {
      res.status(400).json({error: 'account get fail.'});
      return;
    }
    Account
      .where({id: id})
      .fetch({withRelated: AccountAllRelation})
      .then(function(account) {
        account = account.toJSON();
        delete(account.password);
        res.json(account);
      }).catch(function (err) {
        res.status(400).json({error: 'account get fail.'});
      });
  });

  apiRouter.post('/account/drawCard', isAuthenticated, function(req, res) {
    var accountId = req.user.accountId;
    var cardPrice = 1;
    // TODO
    // transacting it!
    Account
      .query()
      .where({id: accountId})
      .select('money')
      .then(function(account) {
        var money = account[0].money;
        var finalMoney = money - cardPrice;
        if (finalMoney < 0) {
          throw new Error('money no enougth for draw card.');
        }
        return finalMoney;
      }).then(function(finalMoney) {
        return (
          new Account({id: accountId})
            .save({money: finalMoney}, {patch: true})
        );
      }).then(function(_account) {
        return BaseCard.query().count();
      }).then(function(column) {
        var baseCardId = _.random(1, parseInt(column[0].count));
        return (
          BaseCard
            .where({id: baseCardId})
            .fetch()
        );
      }).then(function(baseCard) {
        return (Card
                .forge({account_id: accountId,
                        base_card_id: baseCard.get('id'),
                        skill1: baseCard.get('skill1'),
                        skill2: baseCard.get('skill2'),
                        skill3: baseCard.get('skill3'),
                        skill4: baseCard.get('skill4')
                       })
                .save());
      }).then(function(card) {
        return (
          Card.where({id: card.get('id')})
            .fetch({withRelated: 'baseCard'})
        );
      }).then(function(card) {
        res.json(card.toJSON());
      }).catch(function(err) {
        res.status(400).json({error: 'account draw card fail.'});
      });
  });

  apiRouter.post('/account/register', function(req, res) {
    Account
      .register(req.body)
      .then(function(account) {
        var id = account.get('id');
        req.session.passport = {user: id};
        req.session.save();
        res.json(id);
      }).catch(function(err) {
        res.status(400).json({error: 'account register fail.'});
      });
  });

  apiRouter.get('/account', isAuthenticated, function(req, res) {
    var accountId = req.user.accountId;
    Account.getAll(accountId)
      .then(function(account) {
        account = account.toJSON();
        delete(account.password);
        res.json(account);
      }).catch(Account.NotFoundError, function() {
        // sholud never not found account, beacuse is Autogenerated!
        res.status(401).json({error: 'account not found.'});
      }).catch(function(err) {
        res.status(400).json({error: 'something wrong.'});
      });
  });

  apiRouter.post('/account/card/decompose', isAuthenticated, function(req, res) {
    var cardId = req.body.id;
    var accountId = req.user.accountId;
    Account
      .decomposeCard({accountId: accountId, cardId: cardId})
      .then(function(getCry) {
        res.json(getCry);
      }).catch(console.log);
  });

  apiRouter.post('/account/card/levelUp', isAuthenticated, function(req, res) {
    var cardId = req.body.id;
    var accountId = req.user.accountId;
    if (!cardId) {
      res.status(400).json({error: 'wrong form.'});
      return;
    }
    // TODO
    // transation and move to model
    var cardLevel = null;
    Card
      .where({id: cardId})
      .fetch()
      .then(function(card) {
        var level = card.get('level');
        cardLevel = level;
        if (level >= 50) {
          throw new Error('card level must <= 50.');
        }
        return (
          Account.where({id: accountId}).fetch()
        );
      }).then(function(account) {
        var cry = account.get('cry');
        var newCry = cry - (cardLevel * 10 + 25);
        if (newCry < 0) {
          throw new Error('cry is not enough.');
        }
        return Account.forge({id: accountId}).save({cry: newCry});
      }).then(function(account) {
        res.json(true);
        return Card.forge({id: cardId}).save({level: cardLevel + 1});
      }).catch(function(err) {
        console.log(err);
        res.status(400).json({error: 'something wrong.'});
      });
  });

  apiRouter.post('/account/cardParty/leave', isAuthenticated, function(req, res) {
    var cardPartyId = req.body.cardPartyId;
    var accountId = req.user.accountId;
    if (!cardPartyId) {
      res.status(400).json({error: 'wrong form.'});
      return;
    }
    // TODO
    // transation and move to model
    CardParty.forge({id: cardPartyId})
      .destroy()
      .then(function() {
        res.json(true);
      }).catch(function(err) {
        res.status(400).json({error: 'something wrong.'});
      });
  });

  apiRouter.post('/account/cardParty/join', isAuthenticated, function(req, res) {
    var cardId = req.body.cardId;
    var slotIndex = req.body.slotIndex;
    var cardPartyInfoId = req.body.cardPartyInfoId;
    var accountId = req.user.accountId;
    if (!cardId || !slotIndex || !cardPartyInfoId) {
      res.status(400).json({error: 'wrong form.'});
      return;
    }
    // TODO
    // do more check and optimize!
    Card
      .query()
      .where({id: cardId, account_id: accountId})
      .count()
      .then(function(column) {
        var count = column[0].count;
        if (count <= 0) {
          throw new Error('not found card.');
        }
        return count;
      }).then(function() {
        return (
          CardParty
            .where({card_id: cardId,
                    card_party_info_id: cardPartyInfoId})
            .fetch()
        );
      }).then(function(cardParty) {
        if (cardParty === null) {
          return (
            CardParty.forge(
              {card_party_info_id: cardPartyInfoId,
               slot_index: slotIndex,
               card_id: cardId})
              .save()
          );
        } else {
          return (
            CardParty
              .forge({id: cardParty.get('id')})
              .save({slot_index: slotIndex})
          );
        }
      }).then(function(cardParty) {
        res.json(cardParty.get('id'));
      }).catch(function(err) {
        res.status(400).json({error: 'something wrong.'});
      });
  });

  apiRouter.post('/account/login', passport.authenticate('local'), function(req, res) {
    res.json(req.user.get('id'));
  });

  apiRouter.post('/account/logout', isAuthenticated, function(req, res) {
    req.logout();
    req.session.destroy();
    res.json(true);
  });

  var _attributeTypes = ['hp', 'spd', 'atk', 'def'];
  var _effortTypes = ['hp_effort', 'spd_effort', 'atk_effort', 'def_effort'];

  apiRouter.post('/account/card/effortUpdate', isAuthenticated, function(req, res) {
    var accountId = req.user.accountId;
    if (!accountId) {
      res.status(401).json({error: 'need login.'});
      return;
    }
    var cardId = req.body.id;
    var cardEffortUpdates = req.body.cardEffortUpdates;
    if (!cardId || !cardEffortUpdates) {
      res.status(400).json({error: 'wrong form.'});
      return;
    }
    var checkEffort = _.every(cardEffortUpdates, function(v, k) {
      return _effortTypes.indexOf(k) != -1 && v > 0;
    });
    if (!checkEffort) {
      res.status(400).json({error: 'wrong form.'});
      return;
    }
    // TODO
    // transation and move to model
    Card
      .where({id: cardId})
      .fetch()
      .then(function(card) {
        var level = card.get('level');
        var sumEffort = 0;
        _effortTypes.forEach(function(t) {
          sumEffort += card.get(t);
        });
        _.forEach(cardEffortUpdates, function(effortIncValue, effortType) {
          sumEffort += effortIncValue;
        });
        if (level - sumEffort < 0) {
          throw new Error('not enough effort for update');
        }
        var final = _.reduce(cardEffortUpdates, function(result, v, k) {
          result[k] = v + card.get(k);
          return result;
        }, {});
        res.json(true);
        Card.forge({id: cardId}).save(final);
      }).catch(function(err) {
        console.log(err);
        res.status(400).json({error: 'something wrong.'});
      });
  });

  app.use('/api', apiRouter);

  function handleAuthed(accountId, socket) {
    redisClient
      .lrangeAsync('chatMessages', 0, -1)
      .then(function(messages) {
        if (messages.length > 0) {
          socket.emit('chat', messages.reverse());
        }
      });
    socket.join('onlineAccounts');
    socket.on('chat', function(msg) {
      redisClient
        .hgetAsync('onlineAccountUsernames', accountId)
        .then(function(username) {
          var sendMessage = function(username) {
            var finalMsg = username + ': ' + msg;
            redisClient.lpush('chatMessages', finalMsg);
            redisClient.ltrim('chatMessages', 0, 99);
            io.to('onlineAccounts').emit('chat', finalMsg);
          };
          if (username === null) {
            Account
              .query()
              .where({id: accountId})
              .select('username')
              .then(function(data) {
                var username = data[0].username;
                redisClient.hset('onlineAccountUsernames', accountId, username);
                sendMessage(username);
              })
              .catch(function(err) {
                console.log(err);
              });
          } else {
            sendMessage(username);
          }
        }).catch(console.log);
    });
    socket.on('battle', function(payload) {
      switch(payload.action) {
      case 'requestNPC':
        console.log('requestNPC', payload);
        // check payload's form
        redisClient
          .hgetAsync('account:battlePC2NPC1v1', accountId)
          .then(function(battleId) {
            var found = (battleId !== null);
            if (found) {
              // TODO
              // found current payload by id and send
              // {
              //   id: payloadId
              //   type: 'pc2npc_1v1'
              //   updated_at
              //   created_at:
              //   num_round:
              //   round_card_id: 1
              //   round_player: 'npc' or 'pc'
              //   npc_id: 1
              //   account_id: accountId
              //   npc_payload_card_party_info:
              //   account_payload_card_party_info:
              // }
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
                cp.num_round = 0;
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
            Account
              .where('id', accountId)
              .fetch({
                withRelated: ['cardPartyInfo', 'cardPartyInfo.cardParty',
                              'cardPartyInfo.cardParty.card',
                              'cardPartyInfo.cardParty.card.baseCard']})
              .then(function(account) {
                var battlePC2NPC1v1 = {
                  num_round: 0,
                  npc_id: payload.npcId,
                  account_id: accountId
                };
                var cardPartyInfo = account.related('cardPartyInfo').toJSON();
                var accountBattleCardPartyInfo = toAccountBattleCardPartyInfo(cardPartyInfo[0]);
                var npcBattleCardPartyInfo = npcs.get(payload.npcId).get('battleCardPartyInfo').toJSON();
                battlePC2NPC1v1.accountBattleCardPartyInfo = accountBattleCardPartyInfo;
                battlePC2NPC1v1.npcBattleCardPartyInfo = npcBattleCardPartyInfo;
                var mergedCardParty = _.take(accountBattleCardPartyInfo.cardParty, 3)
                      .concat(_.take(npcBattleCardPartyInfo.cardParty, 3));
                mergedCardParty = _.sortBy(_.shuffle(mergedCardParty), 'spd').reverse();
                var mergedCardPartyOrder = _.map(mergedCardParty, function(card) {
                  return {
                    spd: card.spd,
                    round_player: card.round_player,
                    round_card_slot_index: card.round_card_slot_index,
                    num_round: card.num_round
                  };
                });
                socket.emit('battle',
                            {action: 'initialize',
                             battlePC2NPC1v1: battlePC2NPC1v1
                            });
                battlePC2NPC1v1.merged_card_party_order = mergedCardPartyOrder;
              }).catch(console.log);
          }).catch(console.log);
        break;
      case 'requestPC':
        console.log('requestPC', payload);
        // payload.accountId
        break;
      case 'useSkills':
        break;
      default:
        // never run this.
        // may disconnect it!
        break;
      }
    });
  }

  io.on('connection', function(socket){
    var accountId = socket.request.session.passport.user;
    if (!is.existy(accountId)) {
      socket.disconnect();
      return;
    }
    socket.on('disconnect', function() {
      console.log('disconnect', accountId);
      redisClient
        .multi()
        .setbit('onlineAccountIds', accountId, 0)
        .hdel('onlineAccountUsernames', accountId)
        .exec();
    });
    rscript.runAsync('checkAndSet', ['onlineAccountIds'], [accountId])
      .then(function(result) {
        var exists = (result === null);
        if (exists) {
          socket.emit('_error', {error: 'duplicate connection.'});
          socket.disconnect();
          return;
        }
        handleAuthed(accountId, socket);
        Account
          .query()
          .where({id: accountId})
          .select('username')
          .then(function(column) {
            var username = column[0].username;
            return redisClient.hsetAsync('onlineAccountUsernames', accountId, username);
          }).catch(console.log);
      }).catch(function(err) {
        console.log(err);
      });
  });

  function handleShutdown() {
    // TODO
    // not delete online data more one time.
    Promise.all([redisClient.delAsync('onlineAccountUsernames'),
                 redisClient.delAsync('onlineAccountIds')])
      .then(function() {
        redisClient.quit(function(err, result) {
          console.log('redis client quit');
          knex.destroy(function() {
            console.log('knex destroy');
          });
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
if (config.cluster.disable === false) {
  (function() {
    var workers = config.cluster.workers;
    var sticky = require('sticky-session');
    var server = sticky(workers, createApp).listen(config.port, function() {
      console.log('listening on *:'+config.port);
    });
    killable(server);
    function handleShutdown() {
      if (cluster.isMaster) {
        server.kill(function() {
          setTimeout(function() {
            process.exit(0);
          }, 500);
        });
      }
    }
    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  }());
} else {
  (function() {
    var server = createApp().listen(config.port, function() {
      console.log('listening on *:'+config.port);
    });
    killable(server);
    function handleShutdown() {
      server.kill(function() {
        setTimeout(function() {
          process.exit(0);
        }, 500);
      });
    }
    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  }());
}
