var msgpack = require('msgpack5')();
var _ = require('lodash');
var models = require('../models');
var redisClient = models.redisClient;
var logger = require('../../config/logger');

exports.NPCs = function(req, res) {
  logger.info({accountId: req.user.accountId,
               req_id: req.id},
              'battle:NPCs');
  var result = models.NPCs.map(function(npc, npcId) {
    return {id: npc.get('id'), name: npc.get('name')};
  });
  res.json(result);
};

exports.noCompletes = function(req, res) {
  logger.info({accountId: req.user.accountId,
               req_id: req.id},
              'battle:noCompletes');
  redisClient
    .hgetBuffer('account:battlePC2NPC1v1', req.user.accountId)
    .then(function(battle) {
      var found = (battle !== null);
      if (found) {
        battle = msgpack.decode(battle);
        // TODO
        // may be delete enemy info.
        var npcPayload = {battleType: 'battlePC2NPC1v1',
                          npcName: models.NPCs.get(battle.npcId).get('name'),
                          npcId: battle.npcId};
        res.json([npcPayload]);
        return;
      }
      res.json([]);
    });
};

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
  }
  bcpi.cardParty = cardParty;
  return bcpi;
}

exports.requestNPC = function(io, socket, accountId, payload) {
  // check payload's form
  logger.info({req_id: socket.request.id,
               accountId: accountId, payload: payload},
              'battle:requestNPC');
  redisClient
    .hgetBuffer('account:battlePC2NPC1v1', accountId, function(err, battle) {
      var found = (battle !== null);
      if (found) {
        battle = msgpack.decode(battle);
        socket.emit('battle',
                    {action: 'initialize',
                     battlePC2NPC1v1: battle
                    });
        return;
      }
      models.Account
        .where('id', accountId)
        .fetch({
          withRelated: ['cardPartyInfo', 'cardPartyInfo.cardParty',
                        'cardPartyInfo.cardParty.card',
                        'cardPartyInfo.cardParty.card.baseCard']})
        .then(function(account) {
          var battlePC2NPC1v1 = {
            numRound: 0,
            npcId: payload.npcId,
            accountId: accountId
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
          var packedBattle = msgpack.encode(battlePC2NPC1v1);
          redisClient.hset('account:battlePC2NPC1v1', accountId, packedBattle);
        }).catch(console.log);
    });
};

function processBattlePC2NPC1v1(accountId, battle, payload, io, socket) {
  var npcCardParty = battle.npcBattleCardPartyInfo.cardParty;
  var accountCardParty = battle.accountBattleCardPartyInfo.cardParty;
  var targetCardParty;
  var useSkills = payload.prepareUseSkills;
  var useSkill;
  var mergedCardParty = _.take(accountCardParty, 3).concat(_.take(npcCardParty, 3));
  mergedCardParty = _.sortBy(_.shuffle(mergedCardParty), 'spd').reverse();
  var length = mergedCardParty.length;
  var i, j;
  var effectsQueue = [];
  var target;
  var effect;
  var card;
  var skillId = 0;
  var allDied = true;
  for (i = 0; i<length; i++) {
    card = mergedCardParty[i];
    if (card.hp <= 0) {
      continue;
    }
    if (card.round_player === 'NPC') {
      targetCardParty = accountCardParty;
      target = _.sample(_.take(targetCardParty, 3));
      skillId = 1;
      if (target.hp > 0) {
        target.hp -= 1;
      }
      if (target.hp === 0) {
        for (j=0; j<targetCardParty.length; j++) {
          if (targetCardParty[j].hp > 0) {
            targetCardParty[j].round_card_slot_index = j;
          }
        }
        allDied = true;
        for (j=0; j<targetCardParty.length; j++) {
          if (targetCardParty[j].hp > 0) {
            allDied = false;
            break;
          }
        }
        if (allDied) {
          socket.emit('battle', {
            action: 'handleComplete',
            battleType: 'battlePC2NPC1v1',
            complete: {
              winer: 'NPC',
              loser: 'PC'
            }
          });
          redisClient.hdel('account:'+payload.battleType, accountId);
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
    } else if(card.round_player === 'PC') {
      useSkills = payload.prepareUseSkills;
      useSkill = _.find(useSkills, function(us) {
        return us.round_card_slot_index == card.round_card_slot_index;
      });
      skillId = useSkill.skillId;
      targetCardParty = (useSkill.target.round_player === 'NPC' ? npcCardParty : accountCardParty);
      target = targetCardParty[useSkill.target.round_card_slot_index];
      if (!target) {
        target = targetCardParty[0];
      }
      if (target.hp > 0) {
        target.hp -= 1;
      }
      if (target.hp === 0) {
        target.round_card_slot_index = -1;
        for (j=0; j<targetCardParty.length; j++) {
          if (targetCardParty[j].hp > 0) {
            targetCardParty[j].round_card_slot_index = j;
          }
        }
        allDied = true;
        for (j=0; j<targetCardParty.length; j++) {
          if (targetCardParty[j].hp > 0) {
            allDied = false;
            break;
          }
        }
        if (allDied) {
          socket.emit('battle', {
            action: 'handleComplete',
            battleType: 'battlePC2NPC1v1',
            complete: {
              winer: 'PC',
              loser: 'NPC'
            }
          });
          redisClient.hdel('account:'+payload.battleType, accountId);
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
  battle.numRound += 1;
  var packedBattle = msgpack.encode(battle);
  redisClient
    .hset('account:battlePC2NPC1v1', accountId, packedBattle)
    .then(function() {
      socket.emit('battle', {
        action: 'handleEffectsQueue',
        battleType: 'battlePC2NPC1v1',
        effectsQueue: effectsQueue
      });
    });
}

exports.useSkillsByPC = function(io, socket, accountId, payload) {
  logger.info({req_id: socket.request.id,
               accountId: accountId,
               payload: payload}, 'battle:userSkillsByPC');
  redisClient
    .hgetBuffer('account:'+payload.battleType, accountId)
    .then(function(battle) {
      var found = (battle !== null);
      if (!found) {
        var resBody = {
          action: 'initialize'
        };
        resBody[payload.battleType] = null;
        socket.emit('battle', resBody);
        return;
      }
      battle = msgpack.decode(battle);
      if (payload.battleType === 'battlePC2NPC1v1') {
        processBattlePC2NPC1v1(accountId, battle, payload, io, socket);
      }
    });
};

exports.requestPC = function(io, socket, accountId, payload) {
};
