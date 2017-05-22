'use strict';

const pkg = require('../package.json');
const request = require('request');

const userAgent = 'couchbackup-cloudant/' + pkg.version + ' (Node.js ' +
      process.version + ')';

module.exports = request.defaults({headers: {'User-Agent': userAgent}});
