var logger = require('../../config/logger');
var models = require('../models');
var redisClient = models.redisClient;

exports.pullChatMessages = function(io, socket, accountId) {
  return (
    redisClient
      .lrange('chatMessages', 0, -1)
      .then(function(messages) {
        var finalMessages = messages.reverse();
        if (messages.length > 0) {
          socket.emit('chat', finalMessages);
        }
        return finalMessages;
      })
  );
};

exports.sendMessage = function(io, socket, accountId, msg) {
  return (
    redisClient
      .hget('onlineAccountUsernames', accountId)
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
      }).catch(logger.info)
  );
};
