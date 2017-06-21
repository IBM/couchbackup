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

// Default function to return an error for HTTP status codes
// < 400 -> OK
// 4XX (except 429) -> Fatal
// 429 & >=500 -> Transient
function checkResponse(resp) {
  // Codes < 400 are considered OK
  if (resp.statusCode === 429 || resp.statusCode >= 500) {
    return new error.HTTPError(resp);
  } else if (resp.statusCode >= 400) {
    return new error.HTTPFatalError(resp);
  }
}

function checkResponseAndCallbackError(resp, callback, errorFactory) {
  if (!errorFactory) {
    errorFactory = checkResponse;
  }
  callback(errorFactory(resp));
}

function checkResponseAndCallbackFatalError(resp, callback) {
  checkResponseAndCallbackError(resp, callback, function(resp) {
    // When there are no retries any >=400 error needs to be fatal
    if (resp.statusCode >= 400) {
      return new error.HTTPFatalError(resp);
    }
  });
}

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
  checkResponseAndCallbackError: checkResponseAndCallbackError,
  checkResponseAndCallbackFatalError: checkResponseAndCallbackFatalError
};
