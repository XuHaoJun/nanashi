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

var CardParty = bookshelf.Model.extend({
  tableName: 'card_party',
  card: function() {
    return this.belongsTo(Card, 'card_id');
  }
});

var CardPartyInfo = bookshelf.Model.extend({
  tableName: 'card_party_info',
  account: function() {
    return this.belongsTo(Account, 'account_id');
  },
  cardParty: function() {
    return this.hasMany(CardParty, 'id');
  }
});

var AccountSaveRules = {
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
    this.on('saving', this.validateSave);
  },
  validateSave: function() {
    return checkit(AccountSaveRules).run(this.attributes);
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
    return new this(query)
      .fetch({require: true,
              withRelated: AccountAllRelation});
  }),
  loginBySession: Promise.method(function(accountId) {
    return new this({id: accountId})
      .fetch({require: true,
              withRelated: AccountAllRelation});
  })
});

apiRouter.get('/account/:id', function(req, res) {
  var id = parseInt(req.params.id);
  if (is.nan(id)) {
    res.json(null);
    return;
  }
  Account
    .where({id: id})
    .fetch({withRelated: AccountAllRelation})
    .then(function(account) {
      res.json(account.omit('password'));
    }).catch(function (err) {
      res.status(400).json({error: 'account get fail.'});
    });
});

apiRouter.post('/account/register', function(req, res) {
  new Account(req.body).save()
    .then(function(account) {
      res.json(account.omit('password'));
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
      res.json(account.omit('password'));
    }).catch(Account.NotFoundError, function() {
      res.status(400).json({error: 'account not found.'});
    }).catch(function(err) {
      console.error(err);
    });
});

apiRouter.post('/account/logout', function(req, res) {
  req.session.destroy();
  res.json(true);
});

apiRouter.post('/account/login', function(req, res) {
  var username = req.body.username;
  var password = req.body.password;
  Account.login(username, password)
    .then(function(account) {
      req.session.accountId = account.get('id');
      res.json(account.omit('password'));
    }).catch(Account.NotFoundError, function() {
      res.status(400).json({error: username + ' not found'});
    }).catch(function(err) {
      res.status(400).json({error: username + ' not found'});
    });
});

app.use('/api', apiRouter);

io.on('connection', function(socket){
  var accountId = socket.request.session.accountId;
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
  });
  socket.on('chat', function(msg) {
    var accountId = socket.request.session.accountId;
    knex('account')
      .where('id', accountId)
      .select('username')
      .exec(function(err, data) {
        var username = data[0].username;
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
