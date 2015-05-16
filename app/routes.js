var express = require('express');
var controllers = require('./controllers');
var passport = controllers.passport;
var isAuthenticated = controllers.isAuthenticated;
var configs = require('../config');

exports.addToExpress = function(app) {
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

  apiRouter.get('/account', isAuthenticated, controllers.account.get);

  apiRouter.post('/account/drawCard', isAuthenticated, controllers.account.drawCard);

  apiRouter.post('/account/register', controllers.account.register);

  apiRouter.post('/account/cardDecompose', isAuthenticated, controllers.account.cardDecompose);

  apiRouter.post('/account/cardLevelUp', isAuthenticated, controllers.account.cardLevelUp);

  apiRouter.post('/account/cardPartyLeave', isAuthenticated, controllers.account.cardPartyLeave);

  apiRouter.post('/account/cardPartyJoin', isAuthenticated, controllers.account.cardPartyJoin);

  apiRouter.post('/account/login', passport.authenticate('local'), controllers.account.login);

  apiRouter.post('/account/logout', isAuthenticated, controllers.account.logout);

  apiRouter.post('/account/cardEffortUpdate', isAuthenticated, controllers.account.cardEffortUpdate);

  app.use('/api', apiRouter);
};
