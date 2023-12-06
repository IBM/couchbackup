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
const restorePipeline = require('../includes/restore.js');
const { DelegateWritable } = require('../includes/transforms.js');
const longTestTimeout = 3000;

describe('#unit Check database restore writer', function() {
  const dbUrl = 'http://localhost:5984/animaldb';
  const db = request.client(dbUrl, { parallelism: 1 });

  beforeEach('Reset nocks', function() {
    nock.cleanAll();
  });

  function getRestorePipeline(fileName = './test/fixtures/animaldb_expected.json') {
    let runningTotal = 0;
    let lastTotal;
    return restorePipeline(
      db,
      { bufferSize: 500, parallelism: 1 },
      fs.createReadStream(fileName),
      new DelegateWritable('null', fs.createWriteStream('/dev/null'), null, () => { return ''; }, (restoreResult) => {
        runningTotal += restoreResult.documents;
        lastTotal = restoreResult.total;
      }) // don't care about output
    ).then(() => {
      assert.strictEqual(runningTotal, lastTotal);
      assert.ok(nock.isDone());
      return lastTotal;
    });
  }

  it('should complete successfully', async function() {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(200, []); // success

    return getRestorePipeline().then((total) => {
      assert.strictEqual(total, 15);
    });
  });

  it('should terminate on a fatal error', async function() {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(401, { error: 'Unauthorized' }); // fatal error

    return assert.rejects(
      getRestorePipeline(),
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

    return getRestorePipeline().then((total) => {
      assert.strictEqual(total, 15);
    });
  }).timeout(longTestTimeout);

  it('should fail after 3 transient errors', async function() {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(429, { error: 'Too Many Requests' }) // transient error
      .post('/_bulk_docs')
      .reply(500, { error: 'Internal Server Error' }) // transient error
      .post('/_bulk_docs')
      .reply(503, { error: 'Service Unavailable' }); // Final transient error

    return assert.rejects(
      getRestorePipeline(),
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

    return getRestorePipeline('./test/fixtures/animaldb_old_shallow.json')
      .then((total) => {
        assert.strictEqual(total, 11);
      });
  });

  it('should get a batch error for non-empty array response with new_edits false', async function() {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(200, [{ id: 'foo', error: 'foo', reason: 'bar' }]);

    return assert.rejects(
      getRestorePipeline(),
      (err) => {
        assert.strictEqual(err.name, 'Error');
        assert.strictEqual(err.message, 'Error writing batch 0 with new_edits:false and 1 items');
        assert.ok(nock.isDone());
        return true;
      }
    );
  });
});
