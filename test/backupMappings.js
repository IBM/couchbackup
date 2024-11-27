// Copyright © 2023, 2024 IBM Corp. All rights reserved.
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

const assert = require('node:assert');
const fs = require('node:fs');
const { Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { newClient } = require('../includes/request.js');
const { Liner } = require('../includes/liner.js');
const { FilterStream, MappingStream } = require('../includes/transforms.js');
const { Backup, LogMapper } = require('../includes/backupMappings.js');

function assertFileLine(fileLine, expectedContent) {
  assert.ok(fileLine, 'There should be a file line.');
  assert.equal(typeof fileLine, 'string', 'The file line should be a string.');
  assert.equal(fileLine, expectedContent, 'The file line should have the correct content.');
}

function assertBackupBatchObject(backupBatch, expectedCommand, expectedBatch, expectedDocs) {
  assert.ok(backupBatch, 'The mapped value should be truthy.');
  assert.strictEqual(typeof backupBatch, 'object');
  assert.strictEqual(backupBatch.command, expectedCommand);
  assert.strictEqual(backupBatch.batch, expectedBatch);
  assert.deepStrictEqual(backupBatch.docs, expectedDocs);
}

describe('#unit backup mappings', function() {
  const backupBatchTodo = { command: 't', batch: 0, docs: [{ id: 'doc1' }, { id: 'doc2' }] };
  const backupBatchDone = { command: 't', batch: 0, docs: [{ _id: 'doc1', hello: 'world' }, { _id: 'doc2', foo: 'bar' }] };

  describe('backupBatchToBackupFileLine', function() {
    it('should correctly map to a backup line', function() {
      const fileLine = new Backup(null, {}).backupBatchToBackupFileLine(backupBatchDone);
      assertFileLine(fileLine, `${JSON.stringify(backupBatchDone.docs)}\n`);
    });
  });

  describe('backupBatchToLogFileLine', function() {
    it('should correctly map to a log file line', function() {
      const fileLine = new Backup(null, {}).backupBatchToLogFileLine(backupBatchDone);
      assertFileLine(fileLine, ':d batch0\n');
    });
  });

  describe('log line mappers', function() {
    const liner = new Liner();
    const logMapper = new LogMapper();
    const makeTestForLogLine = (fn, logLine, expected) => {
      logLine = liner.wrapLine(logLine);
      return function() {
        const backupBatch = fn(logLine);
        if (fn.name === logMapper.logLineToMetadata.name) {
          // In the metadata only cases we expect no docs
          expected[2] = [];
        }
        assertBackupBatchObject(backupBatch, ...expected);
      };
    };

    [logMapper.logLineToBackupBatch, logMapper.logLineToMetadata].forEach((fn) => {
      describe(`${fn.name}`, function() {
        it('should correctly map a todo log file line (static)',
          makeTestForLogLine(fn,
            ':t batch42 [{"id": "doc420"}, {"id": "doc421"}]',
            ['t', 42, [{ id: 'doc420' }, { id: 'doc421' }]]
          )
        );
        it('should correctly map a todo log file line (dynamic)',
          makeTestForLogLine(fn,
            `:t batch${backupBatchTodo.batch} ${JSON.stringify(backupBatchTodo.docs)}`,
            ['t', 0, backupBatchTodo.docs]
          )
        );
        it('should correctly map a done log file line',
          makeTestForLogLine(fn,
            ':d batch357',
            ['d', 357, []]
          )
        );
        it('should correctly map a changes_complete log file line',
          makeTestForLogLine(fn,
            ':changes_complete',
            ['changes_complete', null, []]
          )
        );
        it('should correctly map a changes_complete log file line with trailing info',
          makeTestForLogLine(fn,
            ':changes_complete 2345-abcdef123456',
            ['changes_complete', null, []]
          )
        );
        it('should correctly map a changes_complete log file line with undefined',
          makeTestForLogLine(fn,
            ':changes_complete undefined',
            ['changes_complete', null, []]
          )
        );
        it('should handle corrupted content log file lines',
          // Note this is explcitly testing partial lines, when fn is invoked
          // it should not throw an exception. If it does the test will fail.
          makeTestForLogLine(fn,
            ':t batch42 [{"id": "doc', // note this specifically tests a partial line
            fn.name === logMapper.logLineToMetadata.name
              ? ['t', 42, []] // metadata case, metadata is valid content is ignored anyway
              : [null, null, []] // batch case, broken content means line ignored
          )
        );
        it('should handle corrupted metadata log file lines',
        // Note this is explcitly testing partial lines, when fn is invoked
        // it should not throw an exception. If it does the test will fail.
          makeTestForLogLine(fn,
            ':d batc', // note this specifically tests a partial line
            [null, null, []] // broken metadata, line ignored
          )
        );
      });
    });
  });

  describe('getPendingToFetchedMapper', function() {
    const nock = require('nock');
    const url = 'http://localhost:7777';
    const dbName = 'fakenockdb';
    const dbClient = newClient(`${url}/${dbName}`, { parallelism: 1 });

    [{ }, { attachments: true }].forEach((opts) => {
      beforeEach('setup nock', function() {
        nock(url)
          .post(`/${dbName}/_bulk_get`)
          .query({ ...{ revs: true }, ...opts })
          .times(1)
          .reply(200, (uri, requestBody) => {
            // mock a _bulk_get response
            return {
              results: [
                { docs: backupBatchDone.docs.map((doc) => { return { ok: doc }; }) }
              ]
            };
          });
      });

      afterEach('setup nock', function() {
        nock.cleanAll();
      });

      it('should correctly map a batch from todo to done' +
        `${opts.attachments ? ' with attachments' : ''}`, async function() {
        const fetcher = new Backup(dbClient, opts).pendingToFetched;
        return fetcher(backupBatchTodo).then((fetchedBatch) => {
          assertBackupBatchObject(fetchedBatch, 'd', 0, backupBatchDone.docs);
          assert.ok(nock.isDone, 'The mocks should be done');
        });
      });
    });
  });

  describe('end to end mapping', function() {
    it('should correctly map a log file to a backup', async function() {
      const nock = require('nock');
      const url = 'http://localhost:7777';
      const dbName = 'fakenockdb';
      const dbClient = newClient(`${url}/${dbName}`, { parallelism: 1 });

      const expected = [];

      // setup nock
      nock(url)
        .post(`/${dbName}/_bulk_get`)
        .query(true)
        .times(3)
        .reply(200, (uri, requestBody) => {
        // mock a _bulk_get response
          const batchDocs = requestBody.docs.map((doc) => {
            return { _id: doc.id, foo: `bar${doc.id}` };
          });
          // add to the expected lines
          expected.push(`${JSON.stringify(batchDocs)}\n`);
          return {
            results: [
              { docs: batchDocs.map((doc) => { return { ok: doc }; }) }
            ]
          };
        });

      const backup = new Backup(dbClient, {});
      const output = [];
      return pipeline(
        fs.createReadStream('./test/fixtures/test2.log'), // read the log
        new Liner(), // break it into lines
        new MappingStream(new LogMapper().logLineToBackupBatch), // map the lines to batches
        new FilterStream((batch) => { return batch.command === 't'; }), // filter to type t batches
        new MappingStream(backup.pendingToFetched), // fetch the batches
        new MappingStream(backup.backupBatchToBackupFileLine), // stringify for the backup file
        new Writable({
          objectMode: true,
          write: (line, encoding, callback) => {
            output.push(line);
            callback();
          }
        })
      ).then(() => {
        assert.deepStrictEqual(output, expected);
        assert.ok(nock.isDone, 'The mocks should be done');
      });
    });
  });
});
