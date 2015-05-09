var _config = {
  facebook: {
    clientID: 'YourFacebookClientID',
    clientSecret: 'YourFacebookClientSecret',
    callbackURL: "http://localhost:3000/auth/facebook/callback",
    profileFields: ['id', 'displayName', 'emails'],
    enableProof: false
  }
};

module.exports = _config;
