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

/* global describe it beforeEach */

const assert = require('assert');
const backup = require('../includes/backup.js');
const { convertError } = require('../includes/error.js');
const { newClient } = require('../includes/request.js');
const fs = require('fs');
const nock = require('nock');
const events = require('events');

// Note all these tests include a body parameter of include_docs and a query
// string of include_docs because of a quirk of nano that when using the fetch
// method always adds the include_docs query string.
describe('#unit Perform backup using shallow backup', function() {
  const dbUrl = 'http://localhost:5984/animaldb';
  // Query string keys are stringified by Nano
  const badgerKey = 'badger\0';
  const kookaburraKey = 'kookaburra\0';
  const snipeKey = 'snipe\0';
  let counter;
  let totals;
  let ee;

  // Function to create a DB object and call the shallow backup function
  // This is normally done by app.js
  function shallowBackup(opts) {
    const db = newClient(dbUrl, opts);
    // Disable compression to make body assertions easier
    db.service.setEnableGzipCompression(false);
    opts.mode = 'shallow';
    return backup(db, opts, fs.createWriteStream('/dev/null'), ee);
  }

  beforeEach('Reset nocks and event emitter', function() {
    counter = 0;
    totals = [];
    ee = new events.EventEmitter().on('written', (batchSummary) => {
      counter++;
      totals.push(batchSummary.total);
    });
    nock.cleanAll();
  });

  it('should perform a shallow backup', async function() {
    const couch = nock(dbUrl)
      // batch 1
      .post('/_all_docs', { limit: 3, include_docs: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_1.json', 'utf8')))
      // batch 2
      .post('/_all_docs', { limit: 3, start_key: badgerKey, include_docs: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_2.json', 'utf8')))
      // batch 3
      .post('/_all_docs', { limit: 3, start_key: kookaburraKey, include_docs: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_3.json', 'utf8')))
      // batch 4
      .post('/_all_docs', { limit: 3, start_key: snipeKey, include_docs: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_4.json', 'utf8')));
    return shallowBackup({ bufferSize: 3, parallelism: 1 })
      .then((summary) => {
        // Assert the promise total
        assert.strictEqual(summary.total, 11);
        // Assert the correct number of written events
        assert.strictEqual(counter, 4);
        // Assert correct batch increments
        assert.deepStrictEqual(totals, [3, 6, 9, 11]);
        // Assert nocks complete
        assert.ok(couch.isDone());
      });
  });

  it('should perform a shallow backup with transient error', async function() {
    const couch = nock(dbUrl)
      // batch 1
      .post('/_all_docs', { limit: 3, include_docs: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_1.json', 'utf8')))
      // batch 2
      .post('/_all_docs', { limit: 3, start_key: badgerKey, include_docs: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_2.json', 'utf8')))
      // batch 3 - transient error
      .post('/_all_docs', { limit: 3, start_key: kookaburraKey, include_docs: true })
      .reply(500, { error: 'Internal Server Error' })
      // batch 3 - retry
      .post('/_all_docs', { limit: 3, start_key: kookaburraKey, include_docs: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_3.json', 'utf8')))
      // batch 4
      .post('/_all_docs', { limit: 3, start_key: snipeKey, include_docs: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_4.json', 'utf8')));

    return shallowBackup({ bufferSize: 3, parallelism: 1 })
      .then((summary) => {
        // Assert the promise total
        assert.strictEqual(summary.total, 11);
        // Assert the correct number of written events
        assert.strictEqual(counter, 4);
        // Assert correct batch increments
        assert.deepStrictEqual(totals, [3, 6, 9, 11]);
        // Assert nocks complete
        assert.ok(couch.isDone());
      });
  });

  it('should fail to perform a shallow backup on fatal error', async function() {
    const couch = nock(dbUrl)
      // batch 1
      .post('/_all_docs', { limit: 3, include_docs: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_1.json', 'utf8')))
      // batch 2
      .post('/_all_docs', { limit: 3, start_key: badgerKey, include_docs: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_2.json', 'utf8')))
      // batch 3 - fatal error
      .post('/_all_docs', { limit: 3, start_key: kookaburraKey, include_docs: true })
      .reply(401, { error: 'Unauthorized' });

    return assert.rejects(
      shallowBackup({ bufferSize: 3, parallelism: 1 })
      // Error conversion is handled in app.js, add here for ease of testing
        .catch(err => { throw convertError(err); }),
      { name: 'Unauthorized' })
      .then(() => {
        // Assert the correct number of written events
        assert.strictEqual(counter, 2);
        // Assert correct batch increments
        assert.deepStrictEqual(totals, [3, 6]);
        assert.ok(couch.isDone);
      });
  });

  it('should perform a shallow backup with attachments option', async function() {
    const couch = nock(dbUrl)
      // batch 1
      .post('/_all_docs', { limit: 3, include_docs: true, attachments: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_1.json', 'utf8')))
      // batch 2
      .post('/_all_docs', { limit: 3, start_key: badgerKey, include_docs: true, attachments: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_2.json', 'utf8')))
      // batch 3
      .post('/_all_docs', { limit: 3, start_key: kookaburraKey, include_docs: true, attachments: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_3.json', 'utf8')))
      // batch 4
      .post('/_all_docs', { limit: 3, start_key: snipeKey, include_docs: true, attachments: true })
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_4.json', 'utf8')));
    return shallowBackup({ bufferSize: 3, parallelism: 1, attachments: true })
      .then((summary) => {
        // Assert the promise total
        assert.strictEqual(summary.total, 11);
        // Assert the correct number of written events
        assert.strictEqual(counter, 4);
        // Assert correct batch increments
        assert.deepStrictEqual(totals, [3, 6, 9, 11]);
        // Assert nocks complete
        assert.ok(couch.isDone());
      });
  });
});
