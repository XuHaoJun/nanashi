var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
var models = require('../models');
var configs = require('../../config');
var logger = configs.logger;

passport.use(new LocalStrategy(
  function(username, password, done) {
    models.Account.loginByLocal(username, password)
      .then(function(account) {
        logger.info({accountId: account.get('id')}, 'login');
        done(null, account);
      }).catch(function(err) {
        logger.info(err);
        done(null, false);
      });
  }
));

if (configs.oauth2.facebook) {
  passport.use(new FacebookStrategy(configs.oauth2.facebook, function(accessToken, refreshToken, profile, done) {
    models.Account
      .loginByOauth('facebook', profile.id)
      .then(function(account) {
        done(null, account);
      }).catch(models.Account.NotFoundError, function() {
        var form = {username: 'facebook:' + profile.id,
                    password: profile.id,
                    email: profile.emails[0].value,
                    account_provider_name: 'facebook'};
        models.Account.register(form)
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
  models.Account
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

module.exports = {
  passport: passport,
  account: require('./account'),
  isAuthenticated: isAuthenticated
};
