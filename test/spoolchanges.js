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

/* global describe it */
'use strict';

const assert = require('assert');
const nock = require('nock');
const request = require('../includes/request.js');
const changes = require('../includes/spoolchanges.js');

const url = 'http://localhost:7777';
const dbName = 'fakenockdb';
const longTestTimeout = 3000;

const db = request.client(`${url}/${dbName}`, { parallelism: 1 });

const seqSuffix = Buffer.alloc(124, 'abc123').toString('base64');
function provideChanges(batchSize, totalChanges, fullResponse = false) {
  let pending = totalChanges;
  const sparseResultsArray = Array(batchSize).fill({
    seq: null,
    id: 'doc',
    changes: [{ rev: '1-abcdef0123456789abcdef0123456789' }]
  });
  nock(url)
    .post(`/${dbName}/_changes`)
    .query(true)
    .times(totalChanges / batchSize + (totalChanges % batchSize > 0 ? 1 : 0))
    .reply(200, (uri, requestBody) => {
      pending -= batchSize;
      const lastSeq = (totalChanges - pending);
      const seq = lastSeq - batchSize;
      return {
        results: fullResponse
          ? Array.from(Array(batchSize), (_, i) => {
            return {
              seq: `${seq + i}-${seqSuffix}`,
              id: `doc${seq + i}`,
              changes: [{ rev: '1-abcdef0123456789abcdef0123456789' }]
            };
          })
          : sparseResultsArray,
        pending: pending,
        last_seq: `${lastSeq}-abc`
      };
    });
}

describe('#unit Check spool changes', function() {
  it('should terminate on request error', function(done) {
    nock(url)
      .post(`/${dbName}/_changes`)
      .query(true)
      .times(3)
      .replyWithError({ code: 'ECONNRESET', message: 'socket hang up' });

    changes(db, '/dev/null', 500, null, function(err) {
      assert.strictEqual(err.name, 'SpoolChangesError');
      assert.strictEqual(err.message, `Failed changes request - socket hang up: post ${url}/${dbName}/_changes`);
      assert.ok(nock.isDone());
      done();
    });
  }).timeout(longTestTimeout);

  it('should terminate on bad HTTP status code response', function(done) {
    nock(url)
      .post(`/${dbName}/_changes`)
      .query(true)
      .times(3)
      .reply(500, function(uri, requestBody) {
        this.req.response.statusMessage = 'Internal Server Error';
        return { error: 'foo', reason: 'bar' };
      });

    changes(db, '/dev/null', 500, null, function(err) {
      assert.strictEqual(err.name, 'HTTPFatalError');
      assert.strictEqual(err.message, `500 Internal Server Error: post ${url}/${dbName}/_changes - Error: foo, Reason: bar`);
      assert.ok(nock.isDone());
      done();
    });
  }).timeout(longTestTimeout);

  it('should keep collecting changes', function(done) {
    // This test validates that spooling will correctly
    // continue across multiple requests
    // (4 batches of 100000 to be precise).
    // This test might take up to 10 seconds
    this.timeout(10 * 1000);

    // Use full changes for this test
    provideChanges(100000, 400000, true);
    changes(db, '/dev/null', 500, null, function(err) {
      assert.ok(!err);
      assert.ok(nock.isDone());
      done();
    });
  });

  it('should keep collecting sparse changes', function(done) {
    // This test checks that making thousands of requests doesn't
    // make anything bad happen.
    // This test might take up to 25 seconds
    this.timeout(25 * 1000);
    // Use sparse changes for this test and a batch size of 1
    provideChanges(1, 2500);
    changes(db, '/dev/null', 500, null, function(err) {
      assert.ok(!err);
      assert.ok(nock.isDone());
      done();
    });
  });
});

describe('Longer spool changes checks', function() {
  it('#slow should keep collecting changes (25M)', function(done) {
    // This test might take up to 5 minutes
    this.timeout(5 * 60 * 1000);
    // Note changes spooling uses a constant batch size, we are setting
    // a test value here and setting the buffer to match
    const batch = 100000;
    // Use sparse changes for this test
    provideChanges(batch, 25000000);
    changes(db, '/dev/null', batch, null, function(err) {
      assert.ok(!err);
      assert.ok(nock.isDone());
      done();
    });
  });

  it('#slower should keep collecting changes (500M)', function(done) {
    // This test might take up to 90 minutes
    this.timeout(90 * 60 * 1000);
    // Note changes spooling uses a constant batch size, we are setting
    // a test value here and setting the buffer to match
    const batch = 1000000;
    // Use full changes for this test to exercise load
    provideChanges(batch, 500000000, true);
    changes(db, '/dev/null', batch, null, function(err) {
      assert.ok(!err);
      assert.ok(nock.isDone());
      done();
    });
  });
});
