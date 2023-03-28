// Copyright © 2017, 2021 IBM Corp. All rights reserved.
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
const mockServerPort = +process.env.COUCHBACKUP_MOCK_SERVER_PORT || 7777;
const url = `http://localhost:${mockServerPort}`;
const nock = require('nock');
const httpProxy = require('http-proxy');
const Readable = require('stream').Readable;

// Create an infinite stream to read.
// It just keeps sending a backup line, useful for testing cases of
// termination while a stream has content remaining (the animaldb backup
// is too small for that).
class InfiniteBackupStream extends Readable {
  constructor(opt) {
    super(opt);
    this.contents = Buffer.from('[{"_id":"giraffe","_rev":"3-7665c3e66315ff40616cceef62886bd8","min_weight":830,"min_length":5,"max_weight":1600,"max_length":6,"wiki_page":"http://en.wikipedia.org/wiki/Giraffe","class":"mammal","diet":"herbivore","_revisions":{"start":3,"ids":["7665c3e66315ff40616cceef62886bd8","aaaf10d5a68cdf22d95a5482a0e95549","967a00dff5e02add41819138abb3284d"]}}]\n', 'utf8');
  }

  _read() {
    let proceed;
    do {
      proceed = this.push(this.contents);
    } while (proceed);
  }
}

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
  const p = u.p(opts, { expectedBackupError: { name: errorName, code: errorCode } });

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
  const q = u.p(opts, { expectedRestoreError: { name: errorName, code: errorCode } });
  u.testRestoreFromFile(q, './test/fixtures/animaldb_expected.json', 'fakenockdb', function(err) {
    if (err) {
      done(err);
    } else {
      assertNock(done);
    }
  });
}

[{ useApi: true }, { useApi: false }].forEach(function(params) {
  describe(u.scenario('#unit Fatal errors', params), function() {
    let processEnvCopy;
    let proxy;

    before('Set process data for test', function() {
      // Copy env and argv so we can reset them after the tests
      processEnvCopy = JSON.parse(JSON.stringify(process.env));

      // Set up a proxy to point to our nock server because the nock override
      // isn't visible to the spawned CLI process
      if (!params.useApi) {
        proxy = httpProxy.createProxyServer({ target: url }).listen(mockServerPort + 1000, 'localhost');
      }

      // setup environment variables
      process.env.COUCH_URL = (params.useApi) ? url : `http://localhost:${mockServerPort + 1000}`;
    });

    after('Reset process data', function(done) {
      process.env = processEnvCopy;
      if (!params.useApi) {
        proxy.close(done);
      } else {
        done();
      }
    });

    beforeEach('Reset nocks', function() {
      nock.cleanAll();
    });

    describe('for backup', function() {
      it('should terminate when DB does not exist', function(done) {
        // Simulate existence check
        nock(url).head('/fakenockdb').reply(404, { error: 'not_found', reason: 'missing' });
        backupHttpError(params, 'DatabaseNotFound', 10, done);
      });

      it('should terminate on BulkGetError', function(done) {
        // Simulate existence check
        const n = nock(url).head('/fakenockdb').reply(200);
        // Simulate _bulk_get not available
        n.post('/fakenockdb/_bulk_get').reply(404, { error: 'not_found', reason: 'missing' });
        backupHttpError(params, 'BulkGetError', 50, done);
      });

      it('should terminate on Unauthorized existence check', function(done) {
        // Simulate a 401
        nock(url).head('/fakenockdb').reply(401, { error: 'unauthorized', reason: '_reader access is required for this request' });
        backupHttpError(params, 'Unauthorized', 11, done);
      });

      it('should terminate on Forbidden no _reader', function(done) {
        // Simulate a 403
        nock(url).head('/fakenockdb').reply(403, { error: 'forbidden', reason: '_reader access is required for this request' });
        backupHttpError(params, 'Forbidden', 12, done);
      });

      it('should terminate on _bulk_get HTTPFatalError', function(done) {
        // Provide a mock complete changes log to allow a resume to skip ahead
        const p = u.p(params, { opts: { resume: true, log: './test/fixtures/test.log' } });
        // Allow the existence and _bulk_get checks to pass
        const n = nock(url).head('/fakenockdb').reply(200);
        n.post('/fakenockdb/_bulk_get').reply(200, '{"results": []}');
        // Simulate a fatal HTTP error when trying to fetch docs
        // Note: 2 outstanding batches, so 2 responses, 1 mock is optional because we can't guarantee timing
        n.post('/fakenockdb/_bulk_get').query(true).reply(400, { error: 'bad_request', reason: 'testing bad response' });
        n.post('/fakenockdb/_bulk_get').query(true).optionally().reply(400, { error: 'bad_request', reason: 'testing bad response' });
        backupHttpError(p, 'HTTPFatalError', 40, done);
      });

      it('should terminate on NoLogFileName', function(done) {
        // Don't supply a log file name with resume
        const p = u.p(params, { opts: { resume: true } });
        backupHttpError(p, 'NoLogFileName', 20, done);
      });

      it('should terminate on LogDoesNotExist', function(done) {
        // Use a non-existent log file
        const p = u.p(params, { opts: { resume: true, log: './test/fixtures/doesnotexist.log' } });
        backupHttpError(p, 'LogDoesNotExist', 21, done);
      });

      it('should terminate on IncompleteChangesInLogFile', function(done) {
        // Use an incomplete changes log file
        const p = u.p(params, { opts: { resume: true, log: './test/fixtures/incomplete_changes.log' } });
        // Allow the existence and _bulk_get checks to pass
        const n = nock(url).head('/fakenockdb').reply(200);
        n.post('/fakenockdb/_bulk_get').reply(200, '{"results": []}');
        // Should fail when it reads the incomplete changes
        backupHttpError(p, 'IncompleteChangesInLogFile', 22, done);
      });

      it('should terminate on _changes HTTPFatalError', function(done) {
        // Allow the existence and _bulk_get checks to pass
        const n = nock(url).head('/fakenockdb').reply(200);
        n.post('/fakenockdb/_bulk_get').reply(200, '{"results": []}');
        // Simulate a fatal HTTP error when trying to fetch docs (note 2 outstanding batches)
        n.post('/fakenockdb/_changes').query(true).reply(400, { error: 'bad_request', reason: 'testing bad response' });
        backupHttpError(params, 'HTTPFatalError', 40, done);
      });

      it('should terminate on SpoolChangesError', function(done) {
        // Allow the existence and _bulk_get checks to pass
        const n = nock(url).head('/fakenockdb').reply(200);
        n.post('/fakenockdb/_bulk_get').reply(200, '{"results": []}');
        // Simulate a changes without a last_seq
        n.post('/fakenockdb/_changes').query(true).reply(200,
          {
            results: [{
              seq: '2-g1AAAAEbeJzLYWBgYMlgTmFQSElKzi9KdUhJstTLTS3KLElMT9VLzskvTUnMK9HLSy3JAapkSmRIsv___39WBnMiUy5QgN3MzDIxOdEMWb85dv0gSxThigyN8diS5AAkk-pBFiUyoOkzxKMvjwVIMjQAKaDW_Zh6TQnqPQDRC7I3CwDPDV1k',
              id: 'badger',
              changes: [{ rev: '4-51aa94e4b0ef37271082033bba52b850' }]
            }]
          });
        backupHttpError(params, 'SpoolChangesError', 30, done);
      });
    });

    describe('for restore', function() {
      it('should terminate on Unauthorized db existence check', function(done) {
        // Simulate a 401
        nock(url).get('/fakenockdb').reply(401, { error: 'unauthorized', reason: '_reader access is required for this request' });
        restoreHttpError(params, 'Unauthorized', 11, done);
      });

      it('should terminate on Forbidden no _writer', function(done) {
        // Simulate the DB exists (i.e. you can read it)
        const n = nock(url).get('/fakenockdb').reply(200, { doc_count: 0, doc_del_count: 0 });
        // Simulate a 403 trying to write
        n.post('/fakenockdb/_bulk_docs').reply(403, { error: 'forbidden', reason: '_writer access is required for this request' });
        restoreHttpError(params, 'Forbidden', 12, done);
      });

      it('should terminate on RestoreDatabaseNotFound', function(done) {
        // Simulate the DB does not exist
        nock(url).get('/fakenockdb').reply(404, { error: 'not_found', reason: 'Database does not exist.' });
        restoreHttpError(params, 'DatabaseNotFound', 10, done);
      });

      it('should terminate on notEmptyDBErr when database is not empty', function(done) {
        // Simulate the DB that does exist and not empty
        nock(url).get('/fakenockdb').reply(200, { doc_count: 10, doc_del_count: 0 });
        restoreHttpError(params, 'DatabaseNotEmpty', 13, done);
      });

      it('should terminate on notEmptyDBErr when database is not new', function(done) {
        // Simulate the DB that does exist and not new
        nock(url).get('/fakenockdb').reply(200, { doc_count: 0, doc_del_count: 10 });
        restoreHttpError(params, 'DatabaseNotEmpty', 13, done);
      });

      it('should terminate on _bulk_docs HTTPFatalError', function(done) {
        // Simulate the DB exists
        const n = nock(url).get('/fakenockdb').reply(200, { doc_count: 0, doc_del_count: 0 });
        // Use a parallelism of one and mock one response
        const p = u.p(params, { opts: { parallelism: 1 } });
        // Simulate a 400 trying to write
        n.post('/fakenockdb/_bulk_docs').reply(400, { error: 'bad_request', reason: 'testing bad response' });
        restoreHttpError(p, 'HTTPFatalError', 40, done);
      });

      it('should terminate on _bulk_docs HTTPFatalError from system database', function(done) {
        // Simulate that target database exists and is _not_ empty.
        // This should pass validator as we exclude system databases from the check.
        const n = nock(url).get('/_replicator').reply(200, { doc_count: 1, doc_del_count: 0 });
        // Simulate a 400 trying to write
        n.post('/_replicator/_bulk_docs').reply(400, { error: 'bad_request', reason: 'testing bad response' });
        // Use a parallelism of one and mock one response
        const q = u.p(params, { opts: { parallelism: 1 }, expectedRestoreError: { name: 'HTTPFatalError', code: 40 } });
        u.testRestore(q, new InfiniteBackupStream(), '_replicator', function(err) {
          if (err) {
            done(err);
          } else {
            assertNock(done);
          }
        });
      });

      it('should terminate on _bulk_docs HTTPFatalError large stream', function(done) {
        // Simulate the DB exists
        const n = nock(url).get('/fakenockdb').reply(200, { doc_count: 0, doc_del_count: 0 });
        // Simulate a 400 trying to write
        // Provide a body function to handle the stream, but allow any body
        n.post('/fakenockdb/_bulk_docs', function(body) { return true; }).reply(400, { error: 'bad_request', reason: 'testing bad response' });
        // Use only parallelism 1 so we don't have to mock up loads of responses
        const q = u.p(params, { opts: { parallelism: 1 }, expectedRestoreError: { name: 'HTTPFatalError', code: 40 } });
        u.testRestore(q, new InfiniteBackupStream(), 'fakenockdb', function(err) {
          if (err) {
            done(err);
          } else {
            assertNock(done);
          }
        });
      });

      it('should terminate on multiple _bulk_docs HTTPFatalError', function(done) {
        // Simulate the DB exists
        const n = nock(url).get('/fakenockdb').reply(200, { doc_count: 0, doc_del_count: 0 });
        // Simulate a 400 trying to write docs, 5 times because of default parallelism
        // Provide a body function to handle the stream, but allow any body
        // Four of the mocks are optional because of parallelism 5 we can't guarantee that the exit will happen
        // after all 5 requests, but we must get at least one of them
        n.post('/fakenockdb/_bulk_docs', function(body) { return true; }).reply(400, { error: 'bad_request', reason: 'testing bad response' });
        n.post('/fakenockdb/_bulk_docs', function(body) { return true; }).times(4).optionally().reply(400, { error: 'bad_request', reason: 'testing bad response' });
        const q = u.p(params, { opts: { bufferSize: 1 }, expectedRestoreError: { name: 'HTTPFatalError', code: 40 } });
        restoreHttpError(q, 'HTTPFatalError', 40, done);
      });
    });
  });
});
