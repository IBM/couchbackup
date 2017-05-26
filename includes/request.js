'use strict';

const pkg = require('../package.json');
const http = require('http');
const https = require('https');
const request = require('request');

const userAgent = 'couchbackup-cloudant/' + pkg.version + ' (Node.js ' +
      process.version + ')';

module.exports = {
  client: function(url, parallelism) {
    var protocol = (url.match(/^https/)) ? https : http;
    const keepAliveAgent = new protocol.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: parallelism
    });
    return request.defaults({
      agent: keepAliveAgent,
      headers: {'User-Agent': userAgent},
      json: true,
      gzip: true});
  }
};
