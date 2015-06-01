var models = require('../models');


exports.show = function(req, res) {
  models
    .BaseCard
    .where(true)
    .fetchAll()
    .then(function(baseCards) {
      res.json(baseCards.toJSON());
    }).catch(function(err) {
      res.status(400).json({error: 'not found'});
    });
};
