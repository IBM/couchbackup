// Copyright © 2017, 2021 IBM Corp. All rights reserved.
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

    db.service.getDocument({ db: db.db, docId: 'good' }).then(response => {
      assert.ok(response.result);
      assert.ok(couch.isDone());
      done();
    }).catch(err => {
      err = error.convertResponseError(err);
      done(err);
    });
  });

  it('should callback with error after 3 500 responses', function(done) {
    var couch = nock(url)
      .get('/bad')
      .times(3)
      .reply(500, { error: 'foo', reason: 'bar' });

    db.service.getDocument({ db: db.db, docId: 'bad' }).then(response => {
      done(new Error('Successful response when error expected.'));
    }).catch(err => {
      err = error.convertResponseError(err);
      assert.strictEqual(err.name, 'HTTPFatalError');
      assert.strictEqual(err.message, `500 Internal Server Error: get ${url}/bad - Error: foo, Reason: bar`);
      assert.ok(couch.isDone());
      done();
    }).catch(err => {
      // Handle assertion errors
      done(err);
    });
  });

  it('should callback with error after 3 POST 503 responses', function(done) {
    var couch = nock(url)
      .post('/_bulk_get')
      .query(true)
      .times(3)
      .reply(503, function(uri, requestBody) {
        this.req.response.statusMessage = 'Service Unavailable';
        return { error: 'service_unavailable', reason: 'Service unavailable' };
      });

    db.service.postBulkGet({ db: db.db, revs: true, docs: [] }).then(response => {
      done(new Error('Successful response when error expected.'));
    }).catch(err => {
      err = error.convertResponseError(err);
      assert.strictEqual(err.name, 'HTTPFatalError');
      assert.strictEqual(err.message, `503 Service Unavailable: post ${url}/_bulk_get - Error: service_unavailable, Reason: Service unavailable`);
      assert.ok(couch.isDone());
      done();
    }).catch(err => {
      // Handle assertion errors
      done(err);
    });
  });

  it('should callback with error after 3 429 responses', function(done) {
    var couch = nock(url)
      .get('/bad')
      .times(3)
      .reply(429, function(uri, requestBody) {
        this.req.response.statusMessage = 'Too Many Requests';
        return { error: 'foo', reason: 'bar' };
      });

    db.service.getDocument({ db: db.db, docId: 'bad' }).then(response => {
      done(new Error('Successful response when error expected.'));
    }).catch(err => {
      err = error.convertResponseError(err);
      assert.strictEqual(err.name, 'HTTPFatalError');
      assert.strictEqual(err.message, `429 Too Many Requests: get ${url}/bad - Error: foo, Reason: bar`);
      assert.ok(couch.isDone());
      done();
    }).catch(err => {
      // Handle assertion errors
      done(err);
    });
  });

  it('should callback with fatal error for 404 response', function(done) {
    var couch = nock(url)
      .get('/bad')
      .reply(404, function(uri, requestBody) {
        this.req.response.statusMessage = 'Not Found';
        return { error: 'foo', reason: 'bar' };
      });

    db.service.getDocument({ db: db.db, docId: 'bad' }).then(response => {
      done(new Error('Successful response when error expected.'));
    }).catch(err => {
      err = error.convertResponseError(err);
      assert.strictEqual(err.name, 'HTTPFatalError');
      assert.strictEqual(err.message, `404 Not Found: get ${url}/bad - Error: foo, Reason: bar`);
      assert.ok(couch.isDone());
      done();
    }).catch(err => {
      // Handle assertion errors
      done(err);
    });
  });

  it('should callback with same error for no status code error response', function(done) {
    var couch = nock(url)
      .get('/bad')
      .times(3)
      .replyWithError('testing badness');

    db.service.getDocument({ db: db.db, docId: 'bad' }).then(response => {
      done(new Error('Successful response when error expected.'));
    }).catch(err => {
      const err2 = error.convertResponseError(err);
      assert.strictEqual(err, err2);
      assert.ok(couch.isDone());
      done();
    }).catch(err => {
      // Handle assertion errors
      done(err);
    });
  });

  it('should retry request if HTTP request gets timed out', function(done) {
    var couch = nock(url)
      .post('/_bulk_get')
      .query(true)
      .delay(1000)
      .reply(200, { results: { docs: [{ id: '1', ok: { _id: '1' } }] } })
      .post('/_bulk_get')
      .query(true)
      .reply(200, { results: { docs: [{ id: '1', ok: { _id: '1' } }, { id: '2', ok: { _id: '2' } }] } });

    timeoutDb.service.postBulkGet({ db: db.db, revs: true, docs: [] }).then(response => {
      assert.ok(response);
      assert.ok(response.result);
      assert.ok(response.result.results);
      assert.ok(response.result.results.docs);
      assert.strictEqual(response.result.results.docs.length, 2);
      assert.ok(couch.isDone());
      done();
    }).catch(err => {
      done(err);
    });
  });

  it('should callback with error code ESOCKETTIMEDOUT if 3 HTTP requests gets timed out', function(done) {
    var couch = nock(url)
      .post('/_bulk_get')
      .query(true)
      .delay(1000)
      .times(3)
      .reply(200, { ok: true });

    timeoutDb.service.postBulkGet({ db: db.db, revs: true, docs: [] }).then(response => {
      done(new Error('Successful response when error expected.'));
    }).catch(err => {
      err = error.convertResponseError(err);
      assert.strictEqual(err.statusText, 'ECONNABORTED');
      assert.strictEqual(err.message, `timeout of 500ms exceeded: post ${url}/_bulk_get ECONNABORTED`);
      assert.ok(couch.isDone());
      done();
    }).catch(err => {
      // Handle assertion errors
      done(err);
    });
  });
});
