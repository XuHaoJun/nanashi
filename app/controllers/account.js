var _ = require('lodash');
var logger = require('../../config/logger');
var models = require('../models');

exports.drawCard = function(req, res) {
  var accountId = req.user.accountId;
  var cardPrice = 1;
  // TODO
  // transacting it!
  models.Account
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
        new models.Account({id: accountId})
          .save({money: finalMoney}, {patch: true})
      );
    }).then(function(_account) {
      return models.BaseCard.query().count();
    }).then(function(column) {
      var baseCardId = _.random(1, parseInt(column[0].count));
      return (
        models.BaseCard
          .where({id: baseCardId})
          .fetch()
      );
    }).then(function(baseCard) {
      return (models.Card
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
        models.Card.where({id: card.get('id')})
          .fetch({withRelated: 'baseCard'})
      );
    }).then(function(card) {
      res.json(card.toJSON());
    }).catch(function(err) {
      res.status(400).json({error: 'account draw card fail.'});
    });
};

exports.register = function(req, res) {
  models.Account
    .register(req.body)
    .then(function(account) {
      var id = account.get('id');
      req.session.passport = {user: id};
      req.session.save();
      res.json(id);
    }).catch(function(err) {
      res.status(400).json({error: 'account register fail.'});
    });
};

exports.get = function(req, res) {
  var accountId = req.user.accountId;
  models.Account.getAll(accountId)
    .then(function(account) {
      account = account.toJSON();
      delete(account.password);
      res.json(account);
    }).catch(models.Account.NotFoundError, function() {
      // sholud never not found account, beacuse is Autogenerated!
      res.status(401).json({error: 'account not found.'});
    }).catch(function(err) {
      res.status(400).json({error: 'something wrong.'});
    });
};

exports.cardDecompose = function(req, res) {
  var cardId = req.body.id;
  var accountId = req.user.accountId;
  models.Account
    .decomposeCard({accountId: accountId, cardId: cardId})
    .then(function(getCry) {
      res.json(getCry);
    }).catch(logger.info);
};

exports.cardLevelUp = function(req, res) {
  var cardId = req.body.id;
  var accountId = req.user.accountId;
  if (!cardId) {
    res.status(400).json({error: 'wrong form.'});
    return;
  }
  // TODO
  // transation and move to model
  var cardLevel = null;
  models.Card
    .where({id: cardId})
    .fetch()
    .then(function(card) {
      var level = card.get('level');
      cardLevel = level;
      if (level >= 50) {
        throw new Error('card level must <= 50.');
      }
      return (
        models.Account.where({id: accountId}).fetch()
      );
    }).then(function(account) {
      var cry = account.get('cry');
      var newCry = cry - (cardLevel * 10 + 25);
      if (newCry < 0) {
        throw new Error('cry is not enough.');
      }
      return models.Account.forge({id: accountId}).save({cry: newCry});
    }).then(function(account) {
      res.json(true);
      return models.Card.forge({id: cardId}).save({level: cardLevel + 1});
    }).catch(function(err) {
      logger.info(err);
      res.status(400).json({error: 'something wrong.'});
    });
};

exports.cardPartyLeave = function(req, res) {
  var cardPartyId = req.body.cardPartyId;
  var accountId = req.user.accountId;
  if (!cardPartyId) {
    res.status(400).json({error: 'wrong form.'});
    return;
  }
  // TODO
  // transation and move to model
  models.CardParty.forge({id: cardPartyId})
    .destroy()
    .then(function() {
      res.json(true);
    }).catch(function(err) {
      res.status(400).json({error: 'something wrong.'});
    });
};

exports.cardPartyJoin = function(req, res) {
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
  models.Card
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
        models.CardParty
          .where({card_id: cardId,
                  card_party_info_id: cardPartyInfoId})
          .fetch()
      );
    }).then(function(cardParty) {
      if (cardParty === null) {
        return (
          models.CardParty.forge(
            {card_party_info_id: cardPartyInfoId,
             slot_index: slotIndex,
             card_id: cardId})
            .save()
        );
      } else {
        return (
          models.CardParty
            .forge({id: cardParty.get('id')})
            .save({slot_index: slotIndex})
        );
      }
    }).then(function(cardParty) {
      res.json(cardParty.get('id'));
    }).catch(function(err) {
      res.status(400).json({error: 'something wrong.'});
    });
};

exports.login = function(req, res) {
  res.json(req.user.get('id'));
};

exports.logout = function(req, res) {
  req.logout();
  req.session.destroy();
  res.json(true);
};

var _attributeTypes = ['hp', 'spd', 'atk', 'def'];
var _effortTypes = ['hp_effort', 'spd_effort', 'atk_effort', 'def_effort'];
exports.cardEffortUpdate = function(req, res) {
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
  models.Card
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
      models.Card.forge({id: cardId}).save(final);
    }).catch(function(err) {
      logger.info(err);
      res.status(400).json({error: 'something wrong.'});
    });
}
