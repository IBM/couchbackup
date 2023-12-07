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

/* global afterEach beforeEach describe it */
'use strict';

const assert = require('assert');
const nock = require('nock');
const fs = require('node:fs');
const http = require('node:http');
const { pipeline } = require('node:stream/promises');
const request = require('../includes/request.js');
const spoolchanges = require('../includes/spoolchanges.js');
const { MappingStream } = require('../includes/transforms.js');
const { convertResponseError } = require('../includes/error.js');

const host = 'localhost';
// To avoid clashes between multiple runs use a given port (converted to a number) if configured
const port = +process.env.COUCHBACKUP_MOCK_SERVER_PORT || 7777;
const url = `http://${host}:${port}`;
const dbName = 'fakenockdb';
const longTestTimeout = 3000;

const db = request.client(`${url}/${dbName}`, { parallelism: 1 });

const seqSuffix = Buffer.alloc(124, 'abc123').toString('base64');

function changes(bufferSize, tolerance) {
  // Make a pipeline of the spool changes source streams
  return pipeline(...spoolchanges(db, '/dev/null', bufferSize, tolerance),
  // add a mapping to string and send to /dev/null as we don't care about the output
    new MappingStream(JSON.stringify), fs.createWriteStream('/dev/null'))
    // Historically spool changes itself could return an error, but
    // now it returns streams to be made a pipeline elsewhere.
    // As such a conversion takes place in the pipeline level catch, we reproduce
    // that here by calling the convertResponseError function.
    .catch((e) => { throw convertResponseError(e); });
}

describe('Check spool changes', function() {
  describe('#unit error cases', function() {
    it('should terminate on request error', async function() {
      nock(url)
        .post(`/${dbName}/_changes`)
        .query(true)
        .times(3)
        .replyWithError({ code: 'ECONNRESET', message: 'socket hang up' });

      // Note this is setting changes follower tolerance to 0
      // so that the error is not suppressed beyond 3 configured retries
      // in the underlying SDK call, follower will not retry
      return changes(500, 0).catch((err) => {
        assert.strictEqual(err.name, 'SpoolChangesError');
        assert.strictEqual(err.message, `Failed changes request - socket hang up: post ${url}/${dbName}/_changes`);
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
        assert.strictEqual(err.message, `500 Internal Server Error: post ${url}/${dbName}/_changes - Error: foo, Reason: bar`);
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
      // (4 batches of 100000 to be precise).
      // This test might take up to 10 seconds
        this.timeout(10 * 1000);

        // Use full changes for this test
        batchSize = 100000;
        totalChanges = 400000;
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
        // Use sparse changes for this test and a batch size of 1
        batchSize = 1;
        totalChanges = 2500;
        fullResponse = false;
        setupTestSize();
        return changes(500).then(() => {
          assert.equal(remainingMockCalls, 0, 'There should be the correct number of mock calls.');
        });
      });
    });

    describe('Longer spool changes checks', function() {
      it('#slow should keep collecting changes (25M)', async function() {
      // This test might take up to 5 minutes
        this.timeout(5 * 60 * 1000);
        // Note changes spooling uses a constant batch size, we are setting
        // a test value here and setting the bufferSize to match when changes
        // is called
        batchSize = 100000;
        totalChanges = 25000000;
        fullResponse = false;
        setupTestSize();
        // Use sparse changes for this test
        return changes(batchSize).then(() => {
          assert.equal(remainingMockCalls, 0, 'There should be the correct number of mock calls.');
        });
      });

      it('#slower should keep collecting changes (500M)', async function() {
      // This test might take up to 90 minutes
        this.timeout(90 * 60 * 1000);
        // Note changes spooling uses a constant batch size, we are setting
        // a test value here and setting the bufferSize to match when changes
        // is called
        batchSize = 1000000;
        totalChanges = 500000000;
        // Use full changes for this test to exercise load
        fullResponse = true;
        setupTestSize();
        return changes(batchSize).then(() => {
          assert.equal(remainingMockCalls, 0, 'There should be the correct number of mock calls.');
        });
      });
    });
  });
});
