var os = require("os");
var serverConfig = {
  develop: {
    appName: 'nanashi-test',
    forceRedirectToHttps: false,
    stickySession: {
      enable: false,
      num: 4,
      proxy: true,
      header: 'x-forwarded-for'
    },
    port: process.env.PORT || 3000,
    clientTemplate: '../nanashiClient/dist/index.mustache',
    staticDirectory: '../nanashiClient/dist',
    faviconPath: '../nanashiClient/dist/favicon.ico',
    prerenderServiceUrl: process.env.PRERENDER_SERVICE_URL || 'http://service.prerender.io/',
    googleAnalyticsTracking: process.env.GOOGLE_ANALYTICS_TRACKING || null
  },
  production: {
    appName: 'nanashi',
    forceRedirectToHttps: true,
    stickySession: {
      enable: false,
      num: process.env.WORKERS || process.env.WEB_CONCURRENCY || 2,
      proxy: true,
      header: 'x-forwarded-for'
    },
    port: process.env.PORT || 3000,
    clientTemplate: 'public/index.mustache',
    staticDirectory: 'public',
    faviconPath: 'public/favicon.ico',
    prerenderServiceUrl: process.env.PRERENDER_SERVICE_URL || 'http://service.prerender.io/',
    googleAnalyticsTracking: process.env.GOOGLE_ANALYTICS_TRACKING || null
  }
};

var _config = serverConfig.develop;
if (serverConfig.production !== undefined && process.env.NODE_ENV == 'production') {
  _config = serverConfig.production;
}

module.exports = _config;
