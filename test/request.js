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

var assert = require('assert');
var nock = require('nock');
var request = require('../includes/request.js');
var error = require('../includes/error.js');

const url = 'http://localhost:7777/testdb';
const db = request.client(url, { parallelism: 1 });
const timeoutDb = request.client(url, { parallelism: 1, requestTimeout: 500 });

describe('#unit Check request response error callback', function() {
  beforeEach('Clean nock', function() {
    nock.cleanAll();
  });

  it('should not callback with error for 200 response', function(done) {
    var couch = nock(url)
      .get('/good')
      .reply(200, { ok: true });

    db.get('good', function(err) {
      err = error.convertResponseError(err);
      assert.strictEqual(err, undefined);
      assert.ok(couch.isDone());
      done();
    });
  });

  it('should callback with error after 3 500 responses', function(done) {
    var couch = nock(url)
      .get('/bad')
      .times(3)
      .reply(500, { error: 'foo', reason: 'bar' });

    db.get('bad', function(err) {
      err = error.convertResponseError(err);
      assert.strictEqual(err.name, 'HTTPFatalError');
      assert.strictEqual(err.message, `500 : GET ${url}/bad - Error: foo, Reason: bar`);
      assert.ok(couch.isDone());
      done();
    });
  });

  it('should callback with error after 3 POST 503 responses', function(done) {
    var couch = nock(url)
      .post('/bad')
      .query(true)
      .times(3)
      .reply(503, { error: 'service_unavailable', reason: 'Service unavailable' });

    db.server.request(
      { method: 'POST', db: db.config.db, path: 'bad', qs: { revs: true }, body: {} },
      function(err, body) {
        assert.ok(err);
        err = error.convertResponseError(err);
        assert.strictEqual(err.name, 'HTTPFatalError');
        assert.strictEqual(err.message, `503 : POST ${url}/bad - Error: service_unavailable, Reason: Service unavailable`);
        assert.ok(couch.isDone());
        done();
      });
  });

  it('should callback with error after 3 429 responses', function(done) {
    var couch = nock(url)
      .get('/bad')
      .times(3)
      .reply(429, { error: 'foo', reason: 'bar' });

    db.get('bad', function(err) {
      err = error.convertResponseError(err);
      assert.strictEqual(err.name, 'HTTPFatalError');
      assert.strictEqual(err.message, `429 : GET ${url}/bad - Error: foo, Reason: bar`);
      assert.ok(couch.isDone());
      done();
    });
  });

  it('should callback with fatal error for 404 response', function(done) {
    var couch = nock(url)
      .get('/bad')
      .reply(404, { error: 'foo', reason: 'bar' });

    db.get('bad', function(err) {
      err = error.convertResponseError(err);
      assert.strictEqual(err.name, 'HTTPFatalError');
      assert.strictEqual(err.message, `404 : GET ${url}/bad - Error: foo, Reason: bar`);
      assert.ok(couch.isDone());
      done();
    });
  });

  it('should callback with same error for no status code error response', function(done) {
    var couch = nock(url)
      .get('/bad')
      .times(3)
      .replyWithError('testing badness');

    db.get('bad', function(err) {
      const err2 = error.convertResponseError(err);
      assert.strictEqual(err, err2);
      assert.ok(couch.isDone());
      done();
    });
  });

  it('should retry request if HTTP request gets timed out', function(done) {
    var couch = nock(url)
      .post('/good')
      .query(true)
      .delay(1000)
      .reply(200, { ok: true, replyNumber: 1 })
      .post('/good')
      .query(true)
      .reply(200, { ok: true, replyNumber: 2 });

    timeoutDb.server.request(
      { method: 'POST', db: timeoutDb.config.db, path: 'good', qs: { revs: true }, body: {} },
      function(err, body, h) {
        assert.ok(body);
        assert.strictEqual(body.replyNumber, 2);
        assert.ok(couch.isDone());
        done();
      });
  });

  it('should callback with error code ESOCKETTIMEDOUT if 3 HTTP requests gets timed out', function(done) {
    var couch = nock(url)
      .post('/good')
      .query(true)
      .delay(1000)
      .times(3)
      .reply(200, { ok: true });

    timeoutDb.server.request(
      { method: 'POST', db: timeoutDb.config.db, path: 'good', qs: { revs: true }, body: {} },
      function(err, body, h) {
        assert.ok(error);
        err = error.convertResponseError(err);
        assert.strictEqual(err.code, 'ESOCKETTIMEDOUT');
        assert.ok(couch.isDone());
        done();
      });
  });
});
