// Copyright © 2017, 2022 IBM Corp. All rights reserved.
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
const backup = require('../includes/shallowbackup.js');
const request = require('../includes/request.js');
const fs = require('fs');
const nock = require('nock');

// Function to create a DB object and call the shallow backup function
// This is normally done by app.js
function shallowBackup(dbUrl, opts) {
  const db = request.client(dbUrl, opts);
  // Disable compression to make body assertions easier
  db.service.setEnableGzipCompression(false);
  return backup(db, opts);
}

// Note all these tests include a body parameter of include_docs and a query
// string of include_docs because of a quirk of nano that when using the fetch
// method always adds the include_docs query string.
describe('#unit Perform backup using shallow backup', function() {
  const dbUrl = 'http://localhost:5984/animaldb';
  // Query string keys are stringified by Nano
  const badgerKey = 'badger\0';
  const kookaburraKey = 'kookaburra\0';
  const snipeKey = 'snipe\0';

  beforeEach('Reset nocks', function() {
    nock.cleanAll();
  });

  it('should perform a shallow backup', function(done) {
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

    shallowBackup(dbUrl, { bufferSize: 3, parallelism: 1 })
      .on('error', function(err) {
        assert.fail(err);
      })
      .on('received', function(data) {
        if (data.batch === 3) {
          assert.strictEqual(data.length, 2); // smaller last batch
        } else {
          assert.strictEqual(data.length, 3);
        }
      })
      .on('finished', function(data) {
        assert.strictEqual(data.total, 11);
        assert.ok(couch.isDone());
        done();
      });
  });

  it('should perform a shallow backup with transient error', function(done) {
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

    shallowBackup(dbUrl, { bufferSize: 3, parallelism: 1 })
      .on('error', function(err) {
        assert.strictEqual(err.name, 'HTTPError');
      })
      .on('received', function(data) {
        if (data.batch === 3) {
          assert.strictEqual(data.length, 2); // smaller last batch
        } else {
          assert.strictEqual(data.length, 3);
        }
      })
      .on('finished', function(data) {
        assert.strictEqual(data.total, 11);
        assert.ok(couch.isDone());
        done();
      });
  });

  it('should fail to perform a shallow backup on fatal error', function(done) {
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

    let errCount = 0;

    shallowBackup(dbUrl, { bufferSize: 3, parallelism: 1 })
      .on('error', function(err) {
        errCount++;
        assert.strictEqual(err.name, 'Unauthorized');
      })
      .on('received', function(data) {
        assert.strictEqual(data.length, 3);
      })
      .on('finished', function(data) {
        assert.strictEqual(data.total, 6);
        assert.ok(couch.isDone());
        assert.strictEqual(errCount, 1);
        done();
      });
  });
});
