var _ = require('lodash');
var is = require('is_js');
var killable = require('killable');
var logger = require('morgan');
var compress = require('compression');
var express = require('express');
var expressSession = require('express-session');
var bodyParser = require('body-parser');

var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var configs = require('./config');

var knex = require('knex')(configs.db);
var bookshelf = require('bookshelf')(knex);

var onlineAccountIds = [];

app.set('port', process.env.PORT || 3000);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(compress());

app.use(logger('dev'));

var session = expressSession(configs.session);
io.use(function(socket, next) {
  session(socket.request, socket.request.res, next);
});

app.use(session);

app.use('/', express.static(__dirname + '/client/dist'));

var apiRouter = express.Router();

var BaseCard = bookshelf.Model.extend({
  tableName: 'base_card',
  cards: function() {
    return this.hasMany(Card, 'base_card_id');
  }
});

var Card = bookshelf.Model.extend({
  tableName: 'card',
  account: function() {
    return this.belongsTo(Account, 'account_id');
  },
  baseCard: function() {
    return this.belongsTo(BaseCard, 'base_card_id');
  }
});

var CardGroup = bookshelf.Model.extend({
  tableName: 'card_group',
  account: function() {
    return this.belongsTo(Account, 'account_id');
  }
});

var Account = bookshelf.Model.extend({
  tableName: 'account',
  deck: function() {
    return this.hasMany(Card);
  }
});

apiRouter.get('/account/:id', function(req, res) {
  var id = parseInt(req.params.id);
  if (is.nan(id)) {
    res.json(null);
    return;
  }
  Account
    .where({id: id})
    .fetch({withRelated: ['deck', 'deck.baseCard']})
    .then(function(account) {
      delete(account.password);
      res.json(account);
    }).catch(function (err) {
      console.log(err);
      res.json(null);
    });
});

apiRouter.post('/account/register', function(req, res) {
  // TODO
  // should validate and move save code check to model!
  Account
    .query({where: {username: req.body.username},
            orWhere: {email: req.body.email}})
    .fetch()
    .then(function(account) {
      if (account != null) {
        console.log('already in db cant not add new account!');
        res.json(null);
        return;
      }
      new Account(req.body).save()
        .then(function(account) {
          account = account.toJSON();
          delete(account.password);
          req.session.accountId = account.id;
          res.json(account);
        }).catch(function(err) {
          console.log('err', err);
          res.json(null);
        });
    }).catch(function(err) {
      res.json(null);
    });
});

apiRouter.post('/account/loginBySession', function(req, res) {
  var accountId = req.session.accountId;
  if (!is.existy(accountId)) {
    res.json(null);
    return;
  }
  Account
    .where({id: accountId})
    .fetch({withRelated: ['deck', 'deck.baseCard']})
    .then(function(account) {
      if (!is.existy(account)) {
        res.json(null);
        return;
      }
      console.log('account.deck().toJSON()', account.deck().toJSON());
      account = account.toJSON();
      delete(account.password);
      req.session.accountId = account.id;
      console.log('account:', account);
      res.json(account);
    }).catch(function (err) {
      console.log(err);
      res.json(null);
    });
});

apiRouter.post('/account/logout', function(req, res) {
  req.session.destroy();
  res.json(true);
});

apiRouter.post('/account/login', function(req, res) {
  // TODO check length
  var username = req.body.username;
  var password = req.body.password;
  Account
    .where({username: username, password: password})
    .fetch({withRelated: ['deck', 'deck.baseCard']})
    .then(function(account) {
      if (!is.existy(account)) {
        res.json(null);
        return;
      }
      account = account.toJSON();
      delete(account.password);
      req.session.accountId = account.id;
      console.log('account:', account);
      res.json(account);
    }).catch(function (err) {
      console.log(err);
      res.json(null);
    });
});

app.use('/api', apiRouter);

io.on('connection', function(socket){
  var accountId = socket.request.session.accountId;
  console.log(accountId);
  if (is.existy(accountId) && onlineAccountIds.indexOf(accountId) == -1) {
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
      onlineAccountIds = onlineAccountIds.slice(i, 0);
    }
    console.log('disconnect', onlineAccountIds);
  });
  socket.on('chat', function(msg) {
    console.log(msg);
    var accountId = socket.request.session.accountId;
    knex('account')
      .where('id', accountId)
      .select('username')
      .exec(function(err, data) {
        var username = data[0].username;
        console.log(username);
        io.to('onlineAccounts').emit('chat', username + ': ' + msg);
      });
  });
  socket.on('logout', function() {
    // right way disconect.
    var accountId = socket.request.session.accountId;
    if (!is.existy(accountId)) {
      return;
    }
    var i = onlineAccountIds.indexOf(accountId);
    if (i != -1) {
      onlineAccountIds = onlineAccountIds.slice(i, 0);
    }
    socket.disconect();
  });
  console.log('onlineAccountIds', onlineAccountIds);
});

var server = http.listen(app.get('port'), function(){
  console.log('listening on *:'+app.get('port'));
});
killable(server);

// Handle Ctrl-c
process.on('SIGINT', function() {
  server.kill(function() {
    // TODO
    // find right way to kill pg pool connections!
    process.exit(0);
  });
});

module.exports = {
  server: server,
  io: io,
  knex: knex,
  bookshelf: bookshelf,
  onlineAccountIds: onlineAccountIds
};
