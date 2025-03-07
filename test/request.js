// Copyright © 2017, 2025 IBM Corp. All rights reserved.
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
const nock = require('nock');
const { newClient } = require('../includes/request.js');
const { convertError } = require('../includes/error.js');

const url = 'http://localhost:7777/testdb';
const dbClient = newClient(url, { parallelism: 1 });
const timeoutDbClient = newClient(url, { parallelism: 1, requestTimeout: 500 });
const longTestTimeout = 3000;

beforeEach('Clean nock', function() {
  nock.cleanAll();
});

describe('#unit Check request headers', function() {
  it('should have a couchbackup user-agent', async function() {
    const couch = nock(url)
      .matchHeader('user-agent', /couchbackup-cloudant\/\d+\.\d+\.\d+(?:-SNAPSHOT)? \(Node.js v\d+\.\d+\.\d+\)/)
      .head('/good')
      .reply(200);

    return dbClient.service.headDocument({ db: dbClient.dbName, docId: 'good' }).then(() => {
      assert.ok(couch.isDone());
    });
  });
});

describe('#unit Check request response error callback', function() {
  it('should not callback with error for 200 response', async function() {
    const couch = nock(url)
      .get('/good')
      .reply(200, { ok: true });

    return dbClient.service.getDocument({ db: dbClient.dbName, docId: 'good' }).then(response => {
      assert.ok(response.result);
      assert.ok(couch.isDone());
    });
  });

  it('should callback with error after 3 500 responses', async function() {
    const couch = nock(url)
      .get('/bad')
      .times(3)
      .reply(500, function(uri, requestBody) {
        this.req.response.statusMessage = 'Internal Server Error';
        return { error: 'foo', reason: 'bar' };
      });

    return assert.rejects(
      dbClient.service.getDocument({ db: dbClient.dbName, docId: 'bad' }),
      (err) => {
        err = convertError(err);
        assert.strictEqual(err.name, 'HTTPFatalError');
        assert.strictEqual(err.message, `500 get ${url}/bad - Error: foo: bar`);
        assert.ok(couch.isDone());
        return true;
      });
  }).timeout(longTestTimeout);

  it('should callback with error after 3 POST 503 responses', async function() {
    const couch = nock(url)
      .post('/_bulk_get')
      .query(true)
      .times(3)
      .reply(503, function(uri, requestBody) {
        this.req.response.statusMessage = 'Service Unavailable';
        return { error: 'service_unavailable', reason: 'Service unavailable' };
      });

    return assert.rejects(
      dbClient.service.postBulkGet({ db: dbClient.dbName, revs: true, docs: [] }),
      (err) => {
        err = convertError(err);
        assert.strictEqual(err.name, 'HTTPFatalError');
        assert.strictEqual(err.message, `503 post ${url}/_bulk_get - Error: service_unavailable: Service unavailable`);
        assert.ok(couch.isDone());
        return true;
      });
  }).timeout(longTestTimeout);

  it('should callback with error after 3 429 responses', async function() {
    const couch = nock(url)
      .get('/bad')
      .times(3)
      .reply(429, function(uri, requestBody) {
        this.req.response.statusMessage = 'Too Many Requests';
        return { error: 'foo', reason: 'bar' };
      });

    return assert.rejects(
      dbClient.service.getDocument({ db: dbClient.dbName, docId: 'bad' }),
      (err) => {
        err = convertError(err);
        assert.strictEqual(err.name, 'HTTPFatalError');
        assert.strictEqual(err.message, `429 get ${url}/bad - Error: foo: bar`);
        assert.ok(couch.isDone());
        return true;
      });
  }).timeout(longTestTimeout);

  it('should callback with fatal error for 404 response', async function() {
    const couch = nock(url)
      .get('/bad')
      .reply(404, function(uri, requestBody) {
        this.req.response.statusMessage = 'Not Found';
        return { error: 'foo', reason: 'bar' };
      });

    return assert.rejects(
      dbClient.service.getDocument({ db: dbClient.dbName, docId: 'bad' }),
      (err) => {
        err = convertError(err);
        assert.strictEqual(err.name, 'HTTPFatalError');
        assert.strictEqual(err.message, `404 get ${url}/bad - Error: foo: bar`);
        assert.ok(couch.isDone());
        return true;
      });
  });

  it('should callback with same error for no status code error response', async function() {
    const couch = nock(url)
      .get('/bad')
      .times(3)
      .replyWithError('testing badness');

    return assert.rejects(
      dbClient.service.getDocument({ db: dbClient.dbName, docId: 'bad' }),
      (err) => {
        const err2 = convertError(err);
        assert.strictEqual(err, err2);
        assert.ok(couch.isDone());
        return true;
      });
  }).timeout(longTestTimeout);

  it('should retry request if HTTP request gets timed out', async function() {
    const couch = nock(url)
      .post('/_bulk_get')
      .query(true)
      .delay(1000)
      .reply(200, { results: { docs: [{ id: '1', ok: { _id: '1' } }] } })
      .post('/_bulk_get')
      .query(true)
      .reply(200, { results: { docs: [{ id: '1', ok: { _id: '1' } }, { id: '2', ok: { _id: '2' } }] } });

    return timeoutDbClient.service.postBulkGet({ db: dbClient.dbName, revs: true, docs: [] }).then((response) => {
      assert.ok(response);
      assert.ok(response.result);
      assert.ok(response.result.results);
      assert.ok(response.result.results.docs);
      assert.strictEqual(response.result.results.docs.length, 2);
      assert.ok(couch.isDone());
    });
  });

  it('should callback with error code ESOCKETTIMEDOUT if 3 HTTP requests gets timed out', async function() {
    // Increase the timeout for this test to allow for the delays
    this.timeout(3000);
    const couch = nock(url)
      .post('/_bulk_get')
      .query(true)
      .delay(1000)
      .times(3)
      .reply(200, { ok: true });

    return assert.rejects(
      timeoutDbClient.service.postBulkGet({ db: dbClient.dbName, revs: true, docs: [] }),
      (err) => {
        err = convertError(err);
        // Note axios returns ECONNABORTED rather than ESOCKETTIMEDOUT
        // See https://github.com/axios/axios/issues/2710 via https://github.com/axios/axios/issues/1543`
        assert.strictEqual(err.statusText, 'ECONNABORTED');
        assert.strictEqual(err.message, `timeout of 500ms exceeded: post ${url}/_bulk_get ECONNABORTED`);
        assert.ok(couch.isDone());
        return true;
      });
  });

  describe('#unit Check credentials', async function() {
    it('should properly decode username and password', async function() {
      const username = 'user%123';
      const password = 'colon:at@321';
      const url = `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@localhost:7777/testdb`;
      const sessionUrl = 'http://localhost:7777';
      const couch = nock(sessionUrl)
        .post('/_session', { username, password })
        .reply(200, { ok: true }, { 'Set-Cookie': 'AuthSession=ABC123DEF4356;' })
        .get('/')
        .reply(200);
      const db = newClient(url, { parallelism: 1 });
      return db.service.getServerInformation().then(response => {
        assert.ok(response);
        assert.ok(couch.isDone());
      });
    });
  });

  describe('#unit Check database names', async function() {
    it('should handle special characters', async function() {
      const serverUrl = 'http://localhost:7777';
      const actualDbName = 'a_$()+/-';
      const encodedDbName = encodeURIComponent(actualDbName);
      // Note this is not the user provided URL
      // It is mocking the internal (encoded) one provided by cliutils.databaseUrl
      const url = `${serverUrl}/${encodedDbName}`;
      const couch = nock(serverUrl)
        .get(`/${encodedDbName}`)
        .reply(200, { ok: true });
      const db = newClient(url, { parallelism: 1 });
      assert.strictEqual(db.dbName, actualDbName,
        `The stored DB name was ${db.dbName} but should match the expected ${actualDbName}`);
      return db.service.getDatabaseInformation({
        db: db.dbName
      }).then(response => {
        assert.ok(response);
        assert.ok(couch.isDone());
      });
    });
  });
});
