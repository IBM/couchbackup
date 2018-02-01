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

/* global describe it */
'use strict';

const assert = require('assert');
const nock = require('nock');
const request = require('../includes/request.js');
const changes = require('../includes/spoolchanges.js');

const url = 'http://localhost:7777';
const dbName = 'fakenockdb';

const db = request.client(`${url}/${dbName}`, {parallelism: 1});

describe('#unit Check spool changes', function() {
  it('should terminate on request error', function(done) {
    nock(url)
      .get(`/${dbName}/_changes`)
      .query(true)
      .times(3)
      .replyWithError({code: 'ECONNRESET', message: 'socket hang up'});

    changes(db, '/dev/null', 500, null, function(err) {
      assert.equal(err.name, 'SpoolChangesError');
      assert.equal(err.message, 'Failed changes request - socket hang up');
      done();
    });
  });

  it('should terminate on bad HTTP status code repsonse', function(done) {
    nock(url)
      .get(`/${dbName}/_changes`)
      .query(true)
      .times(3)
      .reply(500, {error: 'foo', reason: 'bar'});

    changes(db, '/dev/null', 500, null, function(err) {
      assert.equal(err.name, 'HTTPFatalError');
      assert.equal(err.message, `500 : GET ${url}/${dbName}/_changes?seq_interval=10000`);
      done();
    });
  });
});
