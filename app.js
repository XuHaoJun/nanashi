var Immutable = require('immutable');
var Promise  = require('bluebird');
var _ = require('lodash');
var is = require('is_js');
var checkit = require('checkit');
var killable = require('killable');
var logger = require('morgan');
var compress = require('compression');
var express = require('express');
var expressSession = require('express-session');
var bodyParser = require('body-parser');
var redis = require("redis");

var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var configs = require('./config');

var redisClient = redis.createClient(configs.redis.getPort(),
                                     configs.redis.getHostname(),
                                     configs.redis.getOptions().toJSON());
redisClient =  Promise.promisifyAll(redisClient);

redisClient.on('error', console.log);

redisClient.delAsync('onlineAccountIds').catch(console.log);
redisClient.delAsync('onlineAccountUsernames').catch(console.log);

var knex = require('knex')(configs.db);
var bookshelf = require('bookshelf')(knex);

var onlineAccountIds = [];
var onlineBattlingAccountIds = [];

var battleNPCs = {};

var npcCardPartyInfos = {
  1: {
    cardPartyInfo:
    {
      name: '神級喵喵隊',
      cardParty:
      [
        {name: 'hyperWiwi', hp: 1, atk: 1, def: 1, spd: 1, skill1_id: 1},
        {name: 'superKiki', hp: 1, atk: 1, def: 1, spd: 1, skill1_id: 1},
        {name: 'lowerDodo', hp: 1, atk: 1, def: 1, spd: 1, skill1_id: 1}
      ]
    }
  }
};

npcCardPartyInfos = Immutable.fromJS(npcCardPartyInfos);

app.set('port', process.env.PORT || 3000);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(compress());

app.use(logger('dev'));

var session = expressSession(configs.session);

io.use(function(socket, next) {
  session(socket.request, socket.request.res, next);
});

app.set('trust proxy', 1);

app.use(session);

app.use('/', express.static(__dirname + '/client/dist'));

var apiRouter = express.Router();

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
  account: function() {
    return this.belongsTo(Account, 'account_id');
  },
  baseCard: function() {
    return this.belongsTo(BaseCard, 'base_card_id');
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
  }
}, {
  login: Promise.method(function(username, password) {
    var query = {username: username, password: password};
    return this.where(query)
      .fetch({require: true, withRelated: AccountAllRelation});
  }),
  loginBySession: Promise.method(function(accountId) {
    var query = {id: accountId};
    return this.where(query)
      .fetch({require: true, withRelated: AccountAllRelation});
  })
});

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

apiRouter.post('/account/drawCard', function(req, res) {
  var accountId = req.session.accountId;
  if (!is.existy(accountId)) {
    res.status(400).json({error: 'session id not found.'});
    return;
  }
  var cardPrice = 1;
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
    .forge(req.body)
    .save()
    .then(function(account) {
      return CardPartyInfo.forge({'account_id': account.get('id')}).save();
    }).then(function(cardPartyInfo) {
      return (
        Account
          .where({id: cardPartyInfo.get('account_id')})
          .fetch({withRelated: AccountAllRelation})
      );
    }).then(function(account) {
      account = account.toJSON();
      delete(account.password);
      req.session.accountId = account.id;
      req.session.save();
      res.json(account);
    }).catch(function(err) {
      res.status(400).json({error: 'account register fail.'});
    });
});

apiRouter.post('/account/loginBySession', function(req, res) {
  var accountId = req.session.accountId;
  if (!is.existy(accountId)) {
    res.status(400).json({error: 'session id not found.'});
    return;
  }
  Account.loginBySession(accountId)
    .then(function(account) {
      account = account.toJSON();
      delete(account.password);
      res.json(account);
    }).catch(Account.NotFoundError, function() {
      res.status(400).json({error: 'account not found.'});
    }).catch(function(err) {
      res.status(400).json({error: 'unknown found.'});
    });
});

apiRouter.post('/account/card/levelUp', function(req, res) {
  var cardId = req.body.id;
  var accountId = req.session.accountId;
  if (!cardId) {
    res.status(400).json({error: 'wrong form.'});
    return;
  } else if (!accountId) {
    res.status(400).json({error: 'need login.'});
    return;
  }
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

apiRouter.post('/account/cardParty/leave', function(req, res) {
  var cardPartyId = req.body.cardPartyId;
  var accountId = req.session.accountId;
  if (!cardPartyId) {
    res.status(400).json({error: 'wrong form.'});
    return;
  } else if (!accountId) {
    res.status(400).json({error: 'need login.'});
    return;
  }
  CardParty.forge({id: cardPartyId})
    .destroy()
    .then(function() {
      res.json(true);
    }).catch(function(err) {
      res.status(400).json({error: 'something wrong.'});
    });
});

apiRouter.post('/account/cardParty/join', function(req, res) {
  var cardId = req.body.cardId;
  var slotIndex = req.body.slotIndex;
  var cardPartyInfoId = req.body.cardPartyInfoId;
  var accountId = req.session.accountId;
  if (!cardId || !slotIndex || !cardPartyInfoId) {
    res.status(400).json({error: 'wrong form.'});
    return;
  } else if (!accountId) {
    res.status(400).json({error: 'need login.'});
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

apiRouter.post('/account/login', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;
  Account.login(username, password)
    .then(function(account) {
      account = account.toJSON();
      delete(account.password);
      req.session.accountId = account.id;
      req.session.save();
      res.json(account);
    }).catch(Account.NotFoundError, function() {
      res.status(400).json({error: username + ' not found'});
    }).catch(function(err) {
      res.status(400).json({error: username + ' not found'});
    });
});

apiRouter.post('/account/logout', function(req, res) {
  delete(req.session.accountId);
  req.session.destroy();
  res.json(true);
});

var _attributeTypes = ['hp', 'spd', 'atk', 'def'];
var _effortTypes = ['hp_effort', 'spd_effort', 'atk_effort', 'def_effort'];

apiRouter.post('/account/card/effortUpdate', function(req, res) {
  var accountId = req.session.accountId;
  if (!accountId) {
    res.status(400).json({error: 'need login.'});
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

io.on('connection', function(socket){
  var accountId = socket.request.session.accountId;
  if (is.existy(accountId) && onlineAccountIds.indexOf(accountId) == -1) {
    socket.request.session.save();
    redisClient.sadd('onlineAccountIds', accountId);
    redisClient
      .lrangeAsync('chatMessages', 0, -1)
      .then(function(messages) {
        if(messages.length > 0 ) {
          socket.emit('chat', messages.reverse());
        }
      }).catch(console.log);
    onlineAccountIds.push(accountId);
    socket.join('onlineAccounts');
  } else {
    socket.disconnect();
    return;
  }
  socket.on('disconnect', function() {
    var accountId = socket.request.session.accountId;
    if (!is.existy(accountId)) {
      return;
    }
    var i = onlineAccountIds.indexOf(accountId);
    if (i != -1) {
      redisClient.srem('onlineAccountIds', accountId);
      onlineAccountIds = onlineAccountIds.slice(i, 0);
    }
  });
  socket.on('chat', function(msg) {
    var accountId = socket.request.session.accountId;
    redisClient
      .hgetAsync('onlineAccountUsernames', accountId)
      .then(function(username) {
        if (username == null) {
          Account
            .query()
            .where({id: accountId})
            .select('username')
            .then(function(data) {
              var username = data[0].username;
              redisClient
                .hsetAsync('onlineAccountUsernames', accountId, username)
                .catch(console.log);
              var finalMsg = username + ': ' + msg;
              redisClient.lpush('chatMessages', finalMsg);
              redisClient.ltrim('chatMessages', 0, 99);
              io.to('onlineAccounts').emit('chat', finalMsg);
            })
            .catch(function(err) {
              console.log(err);
            });
          return;
        }
        var finalMsg = username + ': ' + msg;
        redisClient.rpush('chatMessages', finalMsg);
        redisClient.ltrim('chatMessages', 0, 99);
        io.to('onlineAccounts').emit('chat', finalMsg);
      }).catch(console.log);
  });
  socket.on('battle', function(battle) {
    var accountId = socket.request.session.accountId;
    if (!is.existy(accountId) || onlineAccountIds.indexOf(accountId) == -1) {
      socket.emit('battle', {error: 'something wrong.'});
      return;
    }
    switch(battle.type) {
    case 'requestNPC':
      console.log('requestNPC', battle);
      if (onlineBattlingAccountIds.indexOf(accountId)) {
        socket.emit('battle', {error: 'you have one battle working.'});
        return;
      }
      var finalBattle = {
        id: battleNPCs.length,
        state: 'battling',
        winer: null,
        npcId: 1,
        npcarCardPartyInfo: npcCardPartyInfos[1],
        accountId: accountId
      };
      battleNPCs[battleNPCs.length](battle);
      onlineBattlingAccountIds.push(accountId);
      var payload = {battleId: battle.id,
                     npcCardPartyInfo: npcCardPartyInfos[1]
                    };
      socket.emit('battle', payload);
    case 'requestPC':
      console.log('requestPC', battle);
      // battle.accountId
      break;
    case 'useSkill':
      // console.log('requestNPC', battle);
      // battle.targetType 'PC', 'NPC'
      // battle.id
      // battle.skillId
      // battle.targetId account's card id or npc card id
      if (battle.targetType == 'NPC') {
        var _battle = battleNPCs[battle.id];
        if (!battle) {
          socket.emit('battle', {error: 'battle not found.'});
          return;
        }
      } else if (battle.targetType == 'PC') {
      }
      break;
    default:
      // never run this.
      // may disconnect it!
      break;
    }
  });
  socket.on('logout', function() {
    // right way disconect.
    var accountId = socket.request.session.accountId;
    if (!is.existy(accountId)) {
      return;
    }
    var i = onlineAccountIds.indexOf(accountId);
    if (i != -1) {
      redisClient.srem('onlineAccountIds', accountId);
      onlineAccountIds = onlineAccountIds.slice(i, 0);
    }
    i = onlineBattlingAccountIds(accountId);
    if (i != -1) {
      onlineBattlingAccountIds = onlineBattlingAccountIds.slice(i, 0);
    }
    socket.disconect();
  });
});

var server = http.listen(app.get('port'), function(){
  console.log('listening on *:'+app.get('port'));
});
killable(server);

// Handle Ctrl-c
// TODO
// Promise it!.
process.on('SIGINT', function() {
  server.kill(function() {
    knex.destroy(function() {
      Promise.all([
        redisClient.delAsync('onlineAccountUsernames'),
        redisClient.delAsync('onlineAccountIds')
      ]).then(function() {
        redisClient.quit();
        process.exit(0);
      }).catch(function(error) {
        console.log(error);
        process.exit(0);
      });
    });
  });
});

module.exports = {
  server: server,
  io: io,
  knex: knex,
  bookshelf: bookshelf,
  onlineAccountIds: onlineAccountIds
};
