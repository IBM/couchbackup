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

/* global describe it before after */
'use strict';

const assert = require('assert');
const applyEnvVars = require('../includes/config.js').applyEnvironmentVariables;

describe('#unit Configuration', function() {
  var processEnvCopy;

  before('Save env', function() {
    // Copy env so we can reset it after the tests
    processEnvCopy = JSON.parse(JSON.stringify(process.env));
  });

  after('Reset env', function() {
    process.env = processEnvCopy;
  });

  it('respects the COUCH_URL env variable', function(done) {
    process.env.COUCH_URL = 'http://user:pass@myurl.com';
    var config = {};
    applyEnvVars(config);
    assert.equal(typeof config.url, 'string');
    assert.equal(config.url, process.env.COUCH_URL);
    done();
  });

  it('respects the COUCH_DATABASE env variable', function(done) {
    process.env.COUCH_DATABASE = 'mydb';
    var config = {};
    applyEnvVars(config);
    assert.equal(typeof config.db, 'string');
    assert.equal(config.db, process.env.COUCH_DATABASE);
    done();
  });

  it('respects the COUCH_BUFFER_SIZE env variable', function(done) {
    process.env.COUCH_BUFFER_SIZE = '1000';
    var config = {};
    applyEnvVars(config);
    assert.equal(typeof config.bufferSize, 'number');
    assert.equal(config.bufferSize, 1000);
    done();
  });

  it('respects the COUCH_PARALLELISM env variable', function(done) {
    process.env.COUCH_PARALLELISM = '20';
    var config = {};
    applyEnvVars(config);
    assert.equal(typeof config.parallelism, 'number');
    assert.equal(config.parallelism, 20);
    done();
  });

  it('respects the CLOUDANT_IAM_API_KEY env variable', function(done) {
    const key = 'ABC123-ZYX987_cba789-xyz321';
    process.env.CLOUDANT_IAM_API_KEY = key;
    var config = {};
    applyEnvVars(config);
    assert.equal(typeof config.iamApiKey, 'string');
    assert.equal(config.iamApiKey, key);
    done();
  });

  it('respects the CLOUDANT_IAM_TOKEN_URL env variable', function(done) {
    const u = 'https://testhost.example:1234/identity/token';
    process.env.CLOUDANT_IAM_TOKEN_URL = u;
    var config = {};
    applyEnvVars(config);
    assert.equal(typeof config.iamTokenUrl, 'string');
    assert.equal(config.iamTokenUrl, u);
    done();
  });

  it('respects the COUCH_LOG env variable', function(done) {
    process.env.COUCH_LOG = 'my.log';
    var config = {};
    applyEnvVars(config);
    assert.equal(typeof config.log, 'string');
    assert.equal(config.log, process.env.COUCH_LOG);
    done();
  });

  it('respects the COUCH_RESUME env variable', function(done) {
    process.env.COUCH_RESUME = 'true';
    var config = {};
    applyEnvVars(config);
    assert.equal(typeof config.resume, 'boolean');
    assert.equal(config.resume, true);
    done();
  });

  it('respects the COUCH_OUTPUT env variable', function(done) {
    process.env.COUCH_OUTPUT = 'myfile.txt';
    var config = {};
    applyEnvVars(config);
    assert.equal(typeof config.output, 'string');
    assert.equal(config.output, process.env.COUCH_OUTPUT);
    done();
  });

  it('respects the COUCH_MODE env variable', function(done) {
    process.env.COUCH_MODE = 'shallow';
    var config = {};
    applyEnvVars(config);
    assert.equal(typeof config.mode, 'string');
    assert.equal(config.mode, 'shallow');
    done();
  });
});
