var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
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

function handlePassportOauth2(providerName, profileId, email, done) {
  models.Account
    .loginByOauth(providerName, profileId)
    .then(function(account) {
      done(null, account);
    }).catch(models.Account.NotFoundError, function() {
      var form = {username: providerName + ':' + profileId,
                  password: profileId,
                  email: email,
                  account_provider_name: providerName};
      models.Account.register(form)
        .then(function(account) {
          done(null, account);
        }).catch(function(err) {
          done(err, null);
        });
    }).catch(function(err) {
      done(err, null);
    });
}

if (configs.oauth2.facebook) {
  var FacebookStrategy = require('passport-facebook').Strategy;
  function handlePassportFacebook(accessToken, refreshToken, profile, done) {
    handlePassportOauth2('facebook', profile.id, profile.emails[0].value, done);
  }
  passport.use(new FacebookStrategy(configs.oauth2.facebook, handlePassportFacebook));
}

if (configs.oauth2.google) {
  var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
  function handlePassportGoogle(token, tokenSecret, profile, done) {
    handlePassportOauth2('google', profile.id, profile.emails[0].value, done);
  }
  passport.use(new GoogleStrategy(configs.oauth2.google, handlePassportGoogle));
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
  chat: require('./chat'),
  battle: require('./battle'),
  isAuthenticated: isAuthenticated
};
