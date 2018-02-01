// Copyright © 2017, 2018 IBM Corp. All rights reserved.
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
const fs = require('fs');
const nock = require('nock');

// Note all these tests include a body parameter of include_docs and a query
// string of include_docs because of a quirk of nano that when using the fetch
// method always adds the include_docs query string.
describe('#unit Perform backup using shallow backup', function() {
  const dbUrl = 'http://localhost:5984/animaldb';
  // Query string keys are stringified by Nano
  const badgerKey = JSON.stringify('badger\0');
  const kookaburraKey = JSON.stringify('kookaburra\0');
  const snipeKey = JSON.stringify('snipe\0');

  beforeEach('Reset nocks', function() {
    nock.cleanAll();
  });

  it('should perform a shallow backup', function(done) {
    var couch = nock(dbUrl)
      // batch 1
      .post('/_all_docs')
      .query({limit: 3, include_docs: true})
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_1.json', 'utf8')))
      // batch 2
      .post('/_all_docs')
      .query({limit: 3, startkey: badgerKey, include_docs: true})
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_2.json', 'utf8')))
      // batch 3
      .post('/_all_docs')
      .query({limit: 3, startkey: kookaburraKey, include_docs: true})
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_3.json', 'utf8')))
      // batch 4
      .post('/_all_docs')
      .query({limit: 3, startkey: snipeKey, include_docs: true})
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_4.json', 'utf8')));

    backup(dbUrl, {bufferSize: 3, parallelism: 1})
      .on('error', function(err) {
        assert.fail(err);
      })
      .on('received', function(data) {
        if (data.batch === 3) {
          assert.equal(data.length, 2); // smaller last batch
        } else {
          assert.equal(data.length, 3);
        }
      })
      .on('finished', function(data) {
        assert.equal(data.total, 11);
        assert.ok(couch.isDone());
        done();
      });
  });

  it('should perform a shallow backup with transient error', function(done) {
    var couch = nock(dbUrl)
      // batch 1
      .post('/_all_docs')
      .query({limit: 3, include_docs: true})
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_1.json', 'utf8')))
      // batch 2
      .post('/_all_docs')
      .query({limit: 3, startkey: badgerKey, include_docs: true})
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_2.json', 'utf8')))
      // batch 3 - transient error
      .post('/_all_docs')
      .query({limit: 3, startkey: kookaburraKey, include_docs: true})
      .reply(500, {error: 'Internal Server Error'})
      // batch 3 - retry
      .post('/_all_docs')
      .query({limit: 3, startkey: kookaburraKey, include_docs: true})
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_3.json', 'utf8')))
      // batch 4
      .post('/_all_docs')
      .query({limit: 3, startkey: snipeKey, include_docs: true})
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_4.json', 'utf8')));

    backup(dbUrl, {bufferSize: 3, parallelism: 1})
      .on('error', function(err) {
        assert.equal(err.name, 'HTTPError');
      })
      .on('received', function(data) {
        if (data.batch === 3) {
          assert.equal(data.length, 2); // smaller last batch
        } else {
          assert.equal(data.length, 3);
        }
      })
      .on('finished', function(data) {
        assert.equal(data.total, 11);
        assert.ok(couch.isDone());
        done();
      });
  });

  it('should fail to perform a shallow backup on fatal error', function(done) {
    var couch = nock(dbUrl)
      // batch 1
      .post('/_all_docs').query({limit: 3, include_docs: true})
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_1.json', 'utf8')))
      // batch 2
      .post('/_all_docs').query({limit: 3, startkey: badgerKey, include_docs: true})
      .reply(200, JSON.parse(fs.readFileSync('./test/fixtures/animaldb_all_docs_2.json', 'utf8')))
      // batch 3 - fatal error
      .post('/_all_docs').query({limit: 3, startkey: kookaburraKey, include_docs: true})
      .reply(401, {error: 'Unauthorized'});

    var errCount = 0;

    backup(dbUrl, {bufferSize: 3, parallelism: 1})
      .on('error', function(err) {
        errCount++;
        assert.equal(err.name, 'Unauthorized');
      })
      .on('received', function(data) {
        assert.equal(data.length, 3);
      })
      .on('finished', function(data) {
        assert.equal(data.total, 6);
        assert.ok(couch.isDone());
        assert.equal(errCount, 1);
        done();
      });
  });
});
