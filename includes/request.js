// Copyright © 2017 IBM Corp. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
'use strict';

const pkg = require('../package.json');
const http = require('http');
const https = require('https');
const request = require('request');
const error = require('./error.js');

const userAgent = 'couchbackup-cloudant/' + pkg.version + ' (Node.js ' +
      process.version + ')';

var checkResponse = function(resp, errName) {
  errName = errName || 'HTTPError';
  if (resp.statusCode >= 400) {
    var errMsg = `${resp.statusCode} ${resp.statusMessage || ''}: ${resp.request.method} ${resp.request.uri.href}`;
    if (resp.body && resp.body.error && resp.body.reason) {
      errMsg += ` - Error: ${resp.body.error}, Reason: ${resp.body.reason}`;
    }
    return new error.BackupError(errName, errMsg);
  }
};

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
  },
  checkResponseAndCallbackError: function(resp, callback) {
    callback(checkResponse(resp));
  },
  checkResponseAndCallbackFatalError: function(resp, callback) {
    callback(checkResponse(resp, 'HTTPFatalError'));
  }
};
