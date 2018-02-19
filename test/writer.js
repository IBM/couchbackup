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
const fs = require('fs');
const nock = require('nock');
const request = require('../includes/request.js');
const writer = require('../includes/writer.js');

describe('#unit Check database restore writer', function() {
  const dbUrl = 'http://localhost:5984/animaldb';
  const db = request.client(dbUrl, {parallelism: 1});

  beforeEach('Reset nocks', function() {
    nock.cleanAll();
  });

  it('should complete successfully', function(done) {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(200, {ok: true}); // success

    fs.createReadStream('./test/fixtures/animaldb_expected.json')
      .pipe(writer(db, 500, 1, null))
      .on('error', function(err) {
        done(err);
      })
      .on('finished', function(data) {
        assert.equal(data.total, 15);
        assert.ok(nock.isDone());
        done();
      });
  });

  it('should terminate on a fatal error', function(done) {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(401, {error: 'Unauthorized'}); // fatal error

    fs.createReadStream('./test/fixtures/animaldb_expected.json')
      .pipe(writer(db, 500, 1, null))
      .on('error', function(err) {
        assert.equal(err.name, 'Unauthorized');
        assert.equal(err.message, `401 : POST ${dbUrl}/_bulk_docs`);
        assert.ok(nock.isDone());
        done();
      });
  });

  it('should retry on transient errors', function(done) {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(429, {error: 'Too Many Requests'}) // transient error
      .post('/_bulk_docs')
      .reply(500, {error: 'Internal Server Error'}) // transient error
      .post('/_bulk_docs')
      .reply(200, {ok: true}); // third time lucky success

    fs.createReadStream('./test/fixtures/animaldb_expected.json')
      .pipe(writer(db, 500, 1, null))
      .on('error', function(err) {
        done(err);
      })
      .on('finished', function(data) {
        assert.equal(data.total, 15);
        assert.ok(nock.isDone());
        done();
      });
  });

  it('should fail after 3 transient errors', function(done) {
    nock(dbUrl)
      .post('/_bulk_docs')
      .reply(429, {error: 'Too Many Requests'}) // transient error
      .post('/_bulk_docs')
      .reply(500, {error: 'Internal Server Error'}) // transient error
      .post('/_bulk_docs')
      .reply(503, {error: 'Service Unavailable'}); // Final transient error

    fs.createReadStream('./test/fixtures/animaldb_expected.json')
      .pipe(writer(db, 500, 1, null))
      .on('error', function(err) {
        assert.equal(err.name, 'HTTPFatalError');
        assert.equal(err.message, `503 : POST ${dbUrl}/_bulk_docs`);
        assert.ok(nock.isDone());
        done();
      });
  });
});
