// Copyright © 2017, 2024 IBM Corp. All rights reserved.
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

/* global afterEach beforeEach describe it */

const assert = require('assert');
const nock = require('nock');
const http = require('node:http');
const { newClient } = require('../includes/request.js');
const spoolchanges = require('../includes/spoolchanges.js');
const { convertError } = require('../includes/error.js');

const host = 'localhost';
// To avoid clashes between multiple runs use a given port (converted to a number) if configured
const port = +process.env.COUCHBACKUP_MOCK_SERVER_PORT || 7777;
const url = `http://${host}:${port}`;
const dbName = 'fakenockdb';
const longTestTimeout = 3000;

const dbClient = newClient(`${url}/${dbName}`, { parallelism: 1 });

const seqSuffix = Buffer.alloc(124, 'abc123').toString('base64');

function changes(bufferSize, tolerance) {
  // Make a pipeline of the spool changes source streams
  return spoolchanges(dbClient, '/dev/null', () => {}, bufferSize, tolerance)
    // Historically spool changes itself could return an error, but
    // now it returns a pipeline promise.
    // Error conversion takes place in the top level functions
    // so to facilitate unit testing we just do the same conversion here.
    .catch((e) => { throw convertError(e); });
}

describe('Check spool changes', function() {
  describe('#unit error cases', function() {
    it('should terminate on request error', async function() {
      const e = new Error('socket hang up');
      e.code = 'ECONNRESET';
      nock(url)
        .post(`/${dbName}/_changes`)
        .query(true)
        .times(3)
        .replyWithError(e);

      // Note this is setting changes follower tolerance to 0
      // so that the error is not suppressed beyond 3 configured retries
      // in the underlying SDK call, follower will not retry
      return changes(500, 0).catch((err) => {
        assert.strictEqual(err.name, 'Error');
        assert.strictEqual(err.message, `socket hang up: post ${url}/${dbName}/_changes ECONNRESET`);
        assert.ok(nock.isDone());
      });
    }).timeout(longTestTimeout);

    it('should terminate on bad HTTP status code response', async function() {
      nock(url)
        .post(`/${dbName}/_changes`)
        .query(true)
        .times(3)
        .reply(500, function(uri, requestBody) {
          this.req.response.statusMessage = 'Internal Server Error';
          return { error: 'foo', reason: 'bar' };
        });

      // Note this is setting changes follower tolerance to 0
      // so that the error is not suppressed beyond 3 configured retries
      // in the underlying SDK call, follower will not retry
      return changes(500, 0).catch((err) => {
        assert.strictEqual(err.name, 'HTTPFatalError');
        assert.strictEqual(err.message, `500 post ${url}/${dbName}/_changes - Error: foo: bar`);
        assert.ok(nock.isDone());
      });
    }).timeout(longTestTimeout);
  });

  describe('success cases', function() {
    let server;
    let batchSize;
    let totalChanges;
    let fullResponse = false;
    let sparseResultsArray;
    let remainingMockCalls;
    let pending;

    beforeEach('Start server', function(done) {
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(getReply());
      });
      server.listen(port, host, done);
    });

    afterEach('Stop server', function(done) {
      server.closeAllConnections();
      server.close(done);
    });

    function setupTestSize() {
      remainingMockCalls = totalChanges / batchSize + (totalChanges % batchSize > 0 ? 1 : 0);
      pending = totalChanges;
      sparseResultsArray = (!fullResponse)
        ? Array(batchSize).fill({
          seq: null,
          id: 'doc',
          changes: [{ rev: '1-abcdef0123456789abcdef0123456789' }]
        })
        : [];
    }

    function makeChangeItem(seq, index) {
      return {
        seq: `${seq + index}-${seqSuffix}`,
        id: `doc${seq + index}`,
        changes: [{ rev: '1-abcdef0123456789abcdef0123456789' }]
      };
    }

    function getResults(batchSize, seq) {
      return Array.from(Array(batchSize).fill(seq), makeChangeItem);
    }

    function getReply() {
      remainingMockCalls--;
      pending -= batchSize;
      const lastSeq = (totalChanges - pending);
      const seq = lastSeq - batchSize;
      return JSON.stringify({
        results: fullResponse ? getResults(batchSize, seq) : sparseResultsArray,
        pending,
        last_seq: `${lastSeq}-abc`
      });
    }

    describe('#unit shorter spool changes checks', function() {
      it('should keep collecting changes', async function() {
      // This test validates that spooling will correctly
      // continue across multiple requests
      // (4 batches of 10000 to be precise).
      // This test might take up to 10 seconds
        this.timeout(10 * 1000);

        // Use full changes for this test
        batchSize = 10000;
        totalChanges = 40000;
        fullResponse = true;
        setupTestSize();
        return changes(500).then(() => {
          assert.equal(remainingMockCalls, 0, 'There should be the correct number of mock calls.');
        });
      });

      it('should keep collecting sparse changes', async function() {
      // This test checks that making thousands of requests doesn't
      // make anything bad happen.
      // This test might take up to 25 seconds
        this.timeout(25 * 1000);
        // Use sparse changes for this test and a response batch size of 1
        // This means that each mock changes request will return only 1 change.
        batchSize = 1;
        totalChanges = 2500;
        fullResponse = false;
        setupTestSize();
        // We collect the changes in the standard batches of 500.
        return changes(500).then(() => {
          assert.equal(remainingMockCalls, 0, 'There should be the correct number of mock calls.');
        });
      });
    });

    describe('Longer spool changes checks', function() {
      it('#slow should keep collecting changes (25M)', async function() {
      // This test might take up to 5 minutes
        this.timeout(5 * 60 * 1000);
        // Note changes spooling uses a constant batch size of 10k.
        // We set the same batch size for generated responses here.
        batchSize = 10000;
        totalChanges = 25000000;
        fullResponse = false;
        setupTestSize();
        // Use sparse changes for this test and collect in batches
        // matching the response size of 10k.
        return changes(batchSize).then(() => {
          assert.equal(remainingMockCalls, 0, 'There should be the correct number of mock calls.');
        });
      });

      it('#slower should keep collecting changes (500M)', async function() {
      // This test might take up to 90 minutes
        this.timeout(90 * 60 * 1000);
        // Note changes spooling uses a constant batch size of 10k.
        // We set a matching batch size here.
        batchSize = 10000;
        totalChanges = 500000000;
        // Use full changes for this test to exercise load
        fullResponse = true;
        setupTestSize();
        // We collect the changes in batches
        // matching the response size of 10k.
        return changes(batchSize).then(() => {
          assert.equal(remainingMockCalls, 0, 'There should be the correct number of mock calls.');
        });
      });
    });
  });
});
