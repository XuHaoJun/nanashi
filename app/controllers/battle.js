var msgpack = require('msgpack5')();
var _ = require('lodash');
var models = require('../models');
var redisClient = models.redisClient;
var logger = require('../../config/logger');

exports.requestNPC = function(io, socket, accountId, payload) {
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
        }).catch(console.log);
    });
};

exports.useSkillsByPC = function(io, socket, accountId, payload) {
  logger.info({accountId: accountId, payload: payload}, 'battle:userSkillsByPC');
  redisClient
    .hgetBuffer('account:'+payload.battleType, accountId)
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
      var i, j;
      var effectsQueue = [];
      var target;
      var effect;
      var card;
      var skillId;
      var diedCard;
      for (i = 0; i<length; i++) {
        card = mergedCardParty[i];
        if (card.hp <= 0) {
          continue;
        }
        if (card.round_player === 'NPC') {
          targetCardParty = accountCardParty;
          target = _.sample(_.take(targetCardParty, 3));
          target.hp -= 1;
          skillId = 1;
          if (target.hp === 0) {
            targetCardParty.splice(target.round_card_slot_index, 1);
            battle.diedCards.push(target);
            for (j=0; j<targetCardParty.length; j++) {
              targetCardParty[j].round_card_slot_index = j;
            }
            if (targetCardParty.length === 0) {
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
            for (j=0; j<targetCardParty.length; j++) {
              targetCardParty[j].round_card_slot_index = j;
            }
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
              redisClient.hdel('account:'+payload.battleType, accountId);
              // TODO
              // log battle complete info.
              // logger.info({
              //   battleType: 'battlePC2NPC1v1',
              //   complete: {
              //     winer: {
              //       round_player: card.round_player,
              //       id:
              //     },
              //     loser: npc
              //   }
              // }, 'battlePC2NPC1v1:complete');
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
        .hset('account:battlePC2NPC1v1', accountId, packedBattle)
        .then(function() {
          socket.emit('battle', {
            action: 'handleEffectsQueue',
            battleType: 'battlePC2NPC1v1',
            effectsQueue: effectsQueue
          });
        });
    });
};
