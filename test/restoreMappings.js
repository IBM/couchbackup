// Copyright © 2023 IBM Corp. All rights reserved.
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

const assert = require('node:assert');
const { Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { Liner } = require('../includes/liner.js');
const { newClient } = require('../includes/request.js');
const { Restore } = require('../includes/restoreMappings.js');
const { MappingStream } = require('../includes/transforms.js');
const { convertError } = require('../includes/error.js');

describe('#unit restore mappings', function() {
  const testDocs = [
    [{ _id: 'id0-1', _rev: '1-1abc' }, { _id: 'id0-2', _rev: '1-2def' }, { _id: 'id0-3', _rev: '1-3ghi' }],
    [{ _id: 'id1-1', _rev: '1-1abc' }, { _id: 'id1-2', _rev: '1-2def' }, { _id: 'id1-3', _rev: '1-3ghi' }],
    [{ _id: 'id2-1', _rev: '1-1abc' }, { _id: 'id2-2', _rev: '1-2def' }, { _id: 'id2-3', _rev: '1-3ghi' }]
  ];

  const testBatches = [
    { batch: 0, docs: testDocs[0] }, { batch: 1, docs: testDocs[1] }, { batch: 2, docs: testDocs[2] }
  ];

  function outputAsWritable(output) {
    return new Writable({
      objectMode: true,
      write: (chunk, encoding, callback) => {
        output.push(chunk);
        callback();
      }
    });
  }

  describe('backupLineToDocsArray', function() {
    // Use a liner to make the line objects with line numbers
    const liner = new Liner();

    // The class under test
    const restore = new Restore(null);

    function makeTestLine(testArray) {
      return liner.wrapLine(JSON.stringify(testArray));
    }

    it('should map a backup line to a docs array', async function() {
      const line = makeTestLine(testDocs[0]);
      const result = restore.backupLineToDocsArray(line);
      assert.ok(result, 'there should be a result');
      assert.deepStrictEqual(result, testDocs[0]);
    });

    it('should map lines to arrays via MappingStream', async function() {
      const output = [];
      await pipeline(testDocs.map(makeTestLine), new MappingStream(restore.backupLineToDocsArray), outputAsWritable(output));
      assert.deepStrictEqual(output, testDocs);
    });

    it('should not error for a corrupted line', async function() {
      // truncate the line for invalid JSON
      const line = liner.wrapLine(JSON.stringify(testDocs[0]).slice(0, -15));
      const result = restore.backupLineToDocsArray(line);
      // For an ignored line we expect an empty array
      assert.deepStrictEqual(result, []);
    });

    it('should handle a blank line', async function() {
      const result = restore.backupLineToDocsArray({ lineNumber: 1234, line: '' });
      // For a blank line we expect an empty array
      assert.deepStrictEqual(result, []);
    });

    it('should error for a non-array', async function() {
      const line = liner.wrapLine(JSON.stringify({ foo: 'bar' }));
      // restore.backupLineToDocsArray(line);
      assert.throws(() => { restore.backupLineToDocsArray(line); },
        { name: 'BackupFileJsonError', message: 'Error on line 0 of backup file - not an array' });
    });
  });

  describe('docsToRestoreBatch', function() {
    it('should map a docs array to a restore batch', async function() {
      const batch = new Restore(null).docsToRestoreBatch(testDocs[0]);
      assert.deepStrictEqual(batch, testBatches[0]);
    });

    it('should map multiple arrays to multiple batches', async function() {
      const restore = new Restore(null);
      for (const i of [0, 1, 2]) {
        const batch = restore.docsToRestoreBatch(testDocs[i]);
        assert.deepStrictEqual(batch, testBatches[i]);
      }
    });

    it('should map multiple batches via MappingStream', async function() {
      const output = [];
      await pipeline(testDocs, new MappingStream(new Restore(null).docsToRestoreBatch), outputAsWritable(output));
      assert.deepStrictEqual(output, testBatches);
    });
  });

  describe('pendingToRestored', function() {
    const nock = require('nock');
    const url = 'http://localhost:7777';
    const dbName = 'fakenockdb';
    const dbClient = newClient(`${url}/${dbName}`, { parallelism: 1 });

    function mockResponse(times, optional = false) {
      nock(url)
        .post(`/${dbName}/_bulk_docs`)
        .times(times)
        .optionally(optional)
        .reply(200, (uri, requestBody) => {
          // mock a _bulk_get response
          return [];
        });
    }

    beforeEach('setup', function() {
      // Setup one mock response
      mockResponse(1);
    });

    afterEach('setup nock', function() {
      nock.cleanAll();
    });

    it('should restore a docs array', async function() {
      // pendingToRestored modifies objects in place, so take a copy otherwise we might impact other tests
      const source = { ...testBatches[0] };
      return new Restore(dbClient).pendingToRestored(source).then((result) => {
        assert.deepStrictEqual(result, { batch: 0, documents: 3 });
        assert.ok(nock.isDone(), 'The mocks should all be called.');
      });
    });

    it('should restore a docs array via MappingStream', async function() {
      // pendingToRestored modifies objects in place, so take a copy otherwise we might impact other tests
      const source = testBatches.map((batch) => { return { ...batch }; });
      // add two more responses
      mockResponse(2);
      const expectedOutput = [{ batch: 0, documents: 3 }, { batch: 1, documents: 3 }, { batch: 2, documents: 3 }];
      const output = [];
      await pipeline(source, new MappingStream(new Restore(dbClient).pendingToRestored), outputAsWritable(output));
      assert.deepStrictEqual(output, expectedOutput);
      assert.ok(nock.isDone(), 'The mocks should all be called.');
    });

    it('should error for a restore HTTP error', async function() {
      // add an error response
      nock(url)
        .post(`/${dbName}/_bulk_docs`)
        .times(1)
        .reply(400, (uri, requestBody) => {
          // mock an error response
          return { error: 'bad request', reason: 'mocking error' };
        });
      // add an optional additional success response
      mockResponse(1, true);

      // pendingToRestored modifies objects in place, so take a copy otherwise we might impact other tests
      const source = testBatches.map((batch) => { return { ...batch }; });
      return assert.rejects(
        pipeline(source, new MappingStream(new Restore(dbClient).pendingToRestored), outputAsWritable([]))
          .catch((e) => { throw convertError(e); }), // perform an error conversion as would happen at the top level
        { name: 'HTTPFatalError' }
      ).then(() => { assert.ok(nock.isDone(), 'The mocks should all be called.'); });
    });
  });
});
