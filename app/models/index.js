var Immutable = require('immutable');
var Promise  = require('bluebird');
var checkit = require('checkit');

var configs = require('../../config');
var knex = require('knex')(configs.db);
var bookshelf = require('bookshelf')(knex);

var Redis = require('ioredis');
var redisClient = new Redis(configs.redis.getURL());
redisClient.on('error', configs.logger.info);

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
  username: ['required', 'minLength:4', 'maxLength:64', function(val) {
    return knex('account').where('username', '=', val).then(function(resp) {
      if (resp.length > 0) throw new Error('The username is already in use.');
    });
  }],
  password: ['required', 'minLength:4', 'maxLength:64'],
  email: ['required', 'email', function(val) {
    return knex('account').where('email', '=', val).then(function(resp) {
      if (resp.length > 0) throw new Error('The email address is already in use.');
    });
  }],
  account_provider_name: {
    rule: 'contains',
    params: ['local', 'facebook', 'google']
  }
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
    form.email = form.email ? form.email.toLowerCase() : '';
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
          .fetch({withRelated: ['baseCard'], transacting: t, require: true})
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
                .fetch({transacting: t, require: true})
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
  loginByOauth: Promise.method(function(providerName, id) {
    var query = {username: providerName+':'+id};
    return this.where(query).fetch({require: true});
  }),
  loginByLocal: Promise.method(function(username, password) {
    // TODO
    // check facebok:xxxx
    var query = {username: username, password: password};
    return this.where(query).fetch({require: true});
  }),
  getAll: Promise.method(function(accountId) {
    var query = {id: accountId};
    return this.where(query)
      .fetch({require: true, withRelated: AccountAllRelation});
  }),
  getUsername: Promise.method(function(accountId) {
    return (
      this
        .query()
        .where({id: accountId})
        .select('username')
        .then(function(column) {
          return column[0].username;
        })
    );
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

var npcs = {
  1: {
    npcId: 1,
    name: '神奇喵喵',
    battleCardPartyInfo:
    {
      name: '神級喵喵隊',
      cardParty:
      [
        {round_card_slot_index: 0, npc_id: 1, round_player: 'NPC',
         cardPartyInfoIndex: 0,
         name: '宅弟-冠愉', hp: 2, max_hp: 2, atk: 1, def: 1, spd: 1,
         skill1: 1, skill2: 0, skill3: 0, skill4: 0},
        {round_card_slot_index: 1, npc_id: 1, round_player: 'NPC',
         cardPartyInfoIndex: 0,
         name: '排骨宅-建勳', hp: 3, max_hp: 3, atk: 1, def: 1, spd: 10,
         skill1: 1, skill2: 0, skill3: 0, skill4: 0},
        {round_card_slot_index: 2, npc_id: 1, round_player: 'NPC',
         cardPartyInfoIndex: 0,
         name: '肥宅-至剛', hp: 9, max_hp: 9, atk: 1, def: 1, spd: 999,
         skill1: 1, skill2: 0, skill3: 0, skill4: 0}
      ]
    }
  }
};

npcs = Immutable.fromJS(npcs);

module.exports = {
  knex: knex,
  bookshelf: bookshelf,
  Card: Card,
  BaseCard: BaseCard,
  Account: Account,
  CardParty: CardParty,
  CardPartyInfo: CardPartyInfo,
  BattlePC2NPC1v1: BattlePC2NPC1v1,
  redisClient: redisClient,
  NPCs: npcs
};
