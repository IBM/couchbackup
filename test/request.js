// Copyright © 2017 IBM Corp. All rights reserved.
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

var assert = require('assert');
var nock = require('nock');
var request = require('../includes/request.js');

describe('#unit Check request response', function() {
  const url = 'http://localhost:5984';
  const client = request.client(url, 1);

  it('should not callback with error for 200 response', function(done) {
    var couch = nock(url)
        .get('/good')
        .reply(200, {ok: true});

    client({url: url + '/good', method: 'GET'}, function(err, res, data) {
      request.checkResponseAndCallbackError(res, function(err) {
        assert.equal(err, null);
        assert.ok(couch.isDone());
        done();
      });
    });
  });

  it('should not callback with fatal error for 200 response', function(done) {
    var couch = nock(url)
        .get('/good')
        .reply(200, {ok: true});

    client({url: url + '/good', method: 'GET'}, function(err, res, data) {
      request.checkResponseAndCallbackFatalError(res, function(err) {
        assert.equal(err, null);
        assert.ok(couch.isDone());
        done();
      });
    });
  });

  it('should callback with error for 500 response', function(done) {
    var couch = nock(url)
        .get('/bad')
        .reply(500, {error: 'foo', reason: 'bar'});

    client({url: url + '/bad', method: 'GET'}, function(err, res, data) {
      request.checkResponseAndCallbackError(res, function(err) {
        assert.equal(err.name, 'HTTPError');
        assert.equal(err.message, `500 : GET ${url}/bad - Error: foo, Reason: bar`);
        assert.ok(couch.isDone());
        done();
      });
    });
  });

  it('should callback with fatal error for 500 response', function(done) {
    var couch = nock(url)
        .get('/bad')
        .reply(500, {error: 'foo', reason: 'bar'});

    client({url: url + '/bad', method: 'GET'}, function(err, res, data) {
      request.checkResponseAndCallbackFatalError(res, function(err) {
        assert.equal(err.name, 'HTTPFatalError');
        assert.equal(err.message, `500 : GET ${url}/bad - Error: foo, Reason: bar`);
        assert.ok(couch.isDone());
        done();
      });
    });
  });
});
