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

/* global describe it before after beforeEach */
'use strict';

const assert = require('assert');
const fs = require('fs');
const u = require('./citestutils.js');
const url = 'http://localhost:7777';
const nock = require('nock');
const httpProxy = require('http-proxy');

function assertNock(done) {
  try {
    assert.ok(nock.isDone());
    done();
  } catch (err) {
    console.error('pending mocks: %j', nock.pendingMocks());
    done(err);
  }
}

function backupHttpError(opts, errorName, errorCode, done) {
  const p = u.p(opts, {expectedBackupError: {name: errorName, code: errorCode}});

  // Create a file and attempt a backup to it
  const output = fs.createWriteStream('/dev/null');
  output.on('open', function() {
    u.testBackup(p, 'fakenockdb', output, function(err) {
      if (err) {
        done(err);
      } else {
        assertNock(done);
      }
    });
  });
}

function restoreHttpError(opts, errorName, errorCode, done) {
  const q = u.p(opts, {expectedRestoreError: {name: errorName, code: errorCode}});
  u.testRestoreFromFile(q, './test/fixtures/animaldb_expected.json', 'fakenockdb', function(err) {
    if (err) {
      done(err);
    } else {
      assertNock(done);
    }
  });
}

[{useApi: true}, {useApi: false}].forEach(function(params) {
  describe(u.scenario('#unit Fatal errors', params), function() {
    var processEnvCopy;
    var proxy;

    before('Set process data for test', function() {
      // Copy env and argv so we can reset them after the tests
      processEnvCopy = JSON.parse(JSON.stringify(process.env));

      // Set up a proxy to point to our nock server because the nock override
      // isn't visible to the spawned CLI process
      if (!params.useApi) {
        proxy = httpProxy.createProxyServer({target: url}).listen(8888, 'localhost');
      }

      // setup environment variables
      process.env.COUCH_URL = (params.useApi) ? url : 'http://localhost:8888';
    });

    after('Reset process data', function() {
      process.env = processEnvCopy;
      if (!params.useApi) {
        proxy.close();
      }
    });

    beforeEach('Reset nocks', function() {
      nock.cleanAll();
    });

    describe('for backup', function() {
      it('should terminate on BulkGetError', function(done) {
        // Simulate _bulk_get not available
        nock(url).get('/fakenockdb/_bulk_get').reply(404, {error: 'not_found', reason: 'missing'});
        backupHttpError(params, 'BulkGetError', 50, done);
      });

      it('should terminate on Unauthorized _bulk_get check', function(done) {
        // Simulate a 401
        nock(url).get('/fakenockdb/_bulk_get').reply(401, {error: 'unauthorized', reason: '_reader access is required for this request'});
        backupHttpError(params, 'Unauthorized', 11, done);
      });

      it('terminate on Forbidden no _reader', function(done) {
        // Simulate a 403
        nock(url).get('/fakenockdb/_bulk_get').reply(403, {error: 'forbidden', reason: '_reader access is required for this request'});
        backupHttpError(params, 'Forbidden', 12, done);
      });

      it('should terminate on _bulk_get HTTPFatalError', function(done) {
        // Provide a mock complete changes log to allow a resume to skip ahead
        const p = u.p(params, {opts: {resume: true, log: './test/fixtures/test.log'}});
        // Allow the _bulk_get check to pass
        const n = nock(url).get('/fakenockdb/_bulk_get').reply(405, 'method not_allowed');
        // Simulate a fatal HTTP error when trying to fetch docs (note 2 outstanding batches)
        n.post('/fakenockdb/_bulk_get').query(true).times(2).reply(400, {error: 'bad_request', reason: 'testing bad response'});
        backupHttpError(p, 'HTTPFatalError', 40, done);
      });

      it('should terminate on NoLogFileName', function(done) {
        // Don't supply a log file name with resume
        const p = u.p(params, {opts: {resume: true}});
        backupHttpError(p, 'NoLogFileName', 20, done);
      });

      it('should terminate on LogDoesNotExist', function(done) {
        // Use a non-existent log file
        const p = u.p(params, {opts: {resume: true, log: './test/fixtures/doesnotexist.log'}});
        backupHttpError(p, 'LogDoesNotExist', 21, done);
      });

      it('should terminate on IncompleteChangesInLogFile', function(done) {
        // Use an incomplete changes log file
        const p = u.p(params, {opts: {resume: true, log: './test/fixtures/incomplete_changes.log'}});
        // Mock allow the _bulk_get check to pass
        nock(url).get('/fakenockdb/_bulk_get').reply(405, 'method not_allowed');
        // Should fail when it reads the incomplete changes
        backupHttpError(p, 'IncompleteChangesInLogFile', 22, done);
      });

      it('should terminate on _changes HTTPFatalError', function(done) {
        // Allow the _bulk_get check to pass
        const n = nock(url).get('/fakenockdb/_bulk_get').reply(405, 'method not_allowed');
        // Simulate a fatal HTTP error when trying to fetch docs (note 2 outstanding batches)
        n.get('/fakenockdb/_changes').query(true).reply(400, {error: 'bad_request', reason: 'testing bad response'});
        backupHttpError(params, 'HTTPFatalError', 40, done);
      });

      it('should terminate on SpoolChangesError', function(done) {
        // Allow the _bulk_get check to pass
        const n = nock(url).get('/fakenockdb/_bulk_get').reply(405, 'method not_allowed');
        // Simulate a changes without a last_seq
        n.get('/fakenockdb/_changes').query(true).reply(200,
          {results: [{seq: '2-g1AAAAEbeJzLYWBgYMlgTmFQSElKzi9KdUhJstTLTS3KLElMT9VLzskvTUnMK9HLSy3JAapkSmRIsv___39WBnMiUy5QgN3MzDIxOdEMWb85dv0gSxThigyN8diS5AAkk-pBFiUyoOkzxKMvjwVIMjQAKaDW_Zh6TQnqPQDRC7I3CwDPDV1k',
            id: 'badger',
            changes: [{rev: '4-51aa94e4b0ef37271082033bba52b850'}]
          }]});
        backupHttpError(params, 'SpoolChangesError', 30, done);
      });
    });

    describe('for restore', function() {
      it('should terminate on Unauthorized db existence check', function(done) {
        // Simulate a 401
        nock(url).head('/fakenockdb').reply(401, {error: 'unauthorized', reason: '_reader access is required for this request'});
        restoreHttpError(params, 'Unauthorized', 11, done);
      });

      it('should terminate on Forbidden no _writer', function(done) {
        // Simulate the DB exists (i.e. you can read it)
        const n = nock(url).head('/fakenockdb').reply(200, {ok: true});
        // Simulate a 403 trying to write
        n.post('/fakenockdb/_bulk_docs').reply(403, {error: 'forbidden', reason: '_writer access is required for this request'});
        restoreHttpError(params, 'Forbidden', 12, done);
      });

      it('should terminate on RestoreDatabaseNotFound', function(done) {
        // Simulate the DB does not exist
        nock(url).head('/fakenockdb').reply(404, {error: 'not_found', reason: 'Database does not exist.'});
        restoreHttpError(params, 'RestoreDatabaseNotFound', 10, done);
      });

      it('should terminate on _bulk_docs HTTPFatalError', function(done) {
        // Simulate the DB exists
        const n = nock(url).head('/fakenockdb').reply(200, {ok: true});
        // Simulate a 400 trying to write
        n.post('/fakenockdb/_bulk_docs').reply(400, {error: 'bad_request', reason: 'testing bad response'});
        restoreHttpError(params, 'HTTPFatalError', 40, done);
      });
    });
  });
});
