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

/* global after before describe it */
'use strict';

const assert = require('assert');
const fs = require('fs');
const getBatches = require('../includes/logfilegetbatches.js');
const logSummary = require('../includes/logfilesummary.js');
const makeUrl = require('../includes/cliutils.js').databaseUrl;
const spoolChanges = require('../includes/spoolchanges.js');
const toxy = require('toxy');
const url = require('url');

function setupProxy(poison) {
  var proxy = toxy({
    auth: url.parse(process.env.COUCH_BACKEND_URL).auth,
    changeOrigin: true
  });

  switch (poison) {
    case 'normal':
      proxy
        .forward(process.env.COUCH_BACKEND_URL)
        .all('/*');
      break;
    case 'bad-first-changes-req':
      var firstChangesReq = true;
      var corruptFirstChangesReq = function(req, res, next) {
        if (!req.url.endsWith('/_changes') || !firstChangesReq) {
          return next();
        }
        console.error('sending corrupt /_changes response');
        firstChangesReq = false;
        var headers = Object.assign({}, res.headers);
        var body = fs.readFileSync('largedb1g_changes_corrupted.json');
        headers['content-length'] = body.length;

        res.writeHead(200, headers);
        res.end(body, 'utf8');
      };
      proxy
        .poison(corruptFirstChangesReq)
        .forward(process.env.COUCH_BACKEND_URL)
        .all('/*');
      break;
    case 'unexpected-errors':
      var errReqCount = 0;
      var errFirstThreeChangesReq = function(req, res, next) {
        if (req.url.indexOf('/_changes') === -1 || errReqCount >= 3) {
          return next();
        } else {
          errReqCount += 1;
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end('{"error": "toxy injected error"}', 'utf8');
        }
      };
      proxy
        .poison(errFirstThreeChangesReq)
        .forward(process.env.COUCH_BACKEND_URL)
        .all('/*');
      break;
    default:
      throw Error('Unknown toxy poison ' + poison);
  }

  return proxy;
}

// test params
const dbUrl = makeUrl(process.env.COUCH_URL, 'largedb1g');
const log = '/tmp/couchbackup_test_spool_changes';
const bufferSize = 50;

var testChanges = function(done) {
  spoolChanges(dbUrl, log, bufferSize, function(err) {
    if (err) return done(err);
    logSummary(log, function(err, state) {
      if (err) return done(err);
      var batchIds = Object.keys(state.batches);
      assert.ok(state.changesComplete);
      assert.equal(batchIds.length, 2553); // expect 2,553 batches

      getBatches(log, batchIds.map(Number), function(err, batches) {
        if (err) {
          return done(err);
        } else {
          for (var batch in batches) {
            assert.equal(batches[batch].command, 't');
            assert.equal(batches[batch].batch, parseInt(batch));
            if (batch === '2552') {
              assert.equal(batches[batch].docs.length, 39); // last batch
            } else {
              assert.equal(batches[batch].docs.length, bufferSize);
            }
          }
          done();
        }
      });
    });
  });
};

const poisons = [
  'normal',
  'bad-first-changes-req',
  'unexpected-errors'
];

poisons.forEach(function(poison) {
  describe('SpoolChanges', function() {
    var proxy;

    before('start toxy server', function() {
      console.log('Using toxy poison ' + poison);
      proxy = setupProxy(poison);
      proxy.listen(url.parse(process.env.COUCH_URL).port);
    });

    after('stop toxy server', function() {
      proxy.close();
    });

    it(`should spool changes successfully with poison ${poison}`, function(done) {
      this.timeout(60 * 1000);
      testChanges(done);
    });
  });
});
