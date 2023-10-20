// Copyright © 2017, 2023 IBM Corp. All rights reserved.
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

/* global describe it beforeEach */
'use strict';

const assert = require('assert');
const fs = require('fs');
const nock = require('nock');
const request = require('../includes/request.js');
const writer = require('../includes/writer.js');
const noopEmitter = new (require('events')).EventEmitter();
const liner = require('../includes/liner.js');
const { once } = require('node:events');
const { pipeline } = require('node:stream/promises');
const longTestTimeout = 3000;

describe('#unit Check database restore writer', function() {
  const dbUrl = 'http://localhost:5984/animaldb';
  const db = request.client(dbUrl, { parallelism: 1 });

  beforeEach('Reset nocks', function() {
    nock.cleanAll();
  });

  it('should complete successfully', async function() {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(200, []); // success

    const w = writer(db, 500, 1, noopEmitter);
    return Promise.all([pipeline(fs.createReadStream('./test/fixtures/animaldb_expected.json'), liner(), w),
      once(w, 'finished').then((data) => {
        assert.strictEqual(data[0].total, 15);
        assert.ok(nock.isDone());
      })]);
  });

  it('should terminate on a fatal error', async function() {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(401, { error: 'Unauthorized' }); // fatal error

    const w = writer(db, 500, 1, noopEmitter);
    return assert.rejects(
      pipeline(fs.createReadStream('./test/fixtures/animaldb_expected.json'), liner(), w),
      (err) => {
        assert.strictEqual(err.name, 'Unauthorized');
        assert.strictEqual(err.message, 'Access is denied due to invalid credentials.');
        assert.ok(nock.isDone());
        return true;
      }
    );
  });

  it('should retry on transient errors', async function() {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(429, { error: 'Too Many Requests' }) // transient error
      .post('/_bulk_docs')
      .reply(500, { error: 'Internal Server Error' }) // transient error
      .post('/_bulk_docs')
      .reply(200, { ok: true }); // third time lucky success

    const w = writer(db, 500, 1, noopEmitter);
    return Promise.all([pipeline(fs.createReadStream('./test/fixtures/animaldb_expected.json'), liner(), w),
      once(w, 'finished').then((data) => {
        assert.strictEqual(data[0].total, 15);
        assert.ok(nock.isDone());
      })]);
  }).timeout(longTestTimeout);

  it('should fail after 3 transient errors', async function() {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(429, { error: 'Too Many Requests' }) // transient error
      .post('/_bulk_docs')
      .reply(500, { error: 'Internal Server Error' }) // transient error
      .post('/_bulk_docs')
      .reply(503, { error: 'Service Unavailable' }); // Final transient error

    const w = writer(db, 500, 1, noopEmitter);
    return assert.rejects(
      pipeline(fs.createReadStream('./test/fixtures/animaldb_expected.json'), liner(), w),
      (err) => {
        assert.strictEqual(err.name, 'HTTPFatalError');
        assert.strictEqual(err.message, `503 : post ${dbUrl}/_bulk_docs - Error: Service Unavailable`);
        assert.ok(nock.isDone());
        return true;
      }
    );
  }).timeout(longTestTimeout);

  it('should restore shallow backups without rev info successfully', async function() {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(200, [{ ok: true, id: 'foo', rev: '1-abc' }]); // success

    const w = writer(db, 500, 1, noopEmitter);
    return Promise.all([pipeline(fs.createReadStream('./test/fixtures/animaldb_old_shallow.json'), liner(), w),
      once(w, 'finished').then((data) => {
        assert.strictEqual(data[0].total, 11);
        assert.ok(nock.isDone());
      })]);
  });

  it('should get a batch error for non-empty array response with new_edits false', async function() {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(200, [{ id: 'foo', error: 'foo', reason: 'bar' }]);

    const w = writer(db, 500, 1, noopEmitter);
    return assert.rejects(
      pipeline(fs.createReadStream('./test/fixtures/animaldb_expected.json'), liner(), w),
      (err) => {
        assert.strictEqual(err.name, 'Error');
        assert.strictEqual(err.message, 'Error writing batch with new_edits:false and 1 items');
        assert.ok(nock.isDone());
        return true;
      }
    );
  });
});
