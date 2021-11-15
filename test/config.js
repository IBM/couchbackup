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

/* global describe it before after */
'use strict';

const assert = require('assert');
const applyEnvVars = require('../includes/config.js').applyEnvironmentVariables;

describe('#unit Configuration', function() {
  let processEnvCopy;

  before('Save env', function() {
    // Copy env so we can reset it after the tests
    processEnvCopy = JSON.parse(JSON.stringify(process.env));
  });

  after('Reset env', function() {
    process.env = processEnvCopy;
  });

  it('respects the COUCH_URL env variable', function(done) {
    process.env.COUCH_URL = 'http://user:pass@myurl.com';
    const config = {};
    applyEnvVars(config);
    assert.strictEqual(typeof config.url, 'string');
    assert.strictEqual(config.url, process.env.COUCH_URL);
    done();
  });

  it('respects the COUCH_DATABASE env variable', function(done) {
    process.env.COUCH_DATABASE = 'mydb';
    const config = {};
    applyEnvVars(config);
    assert.strictEqual(typeof config.db, 'string');
    assert.strictEqual(config.db, process.env.COUCH_DATABASE);
    done();
  });

  it('respects the COUCH_BUFFER_SIZE env variable', function(done) {
    process.env.COUCH_BUFFER_SIZE = '1000';
    const config = {};
    applyEnvVars(config);
    assert.strictEqual(typeof config.bufferSize, 'number');
    assert.strictEqual(config.bufferSize, 1000);
    done();
  });

  it('respects the COUCH_PARALLELISM env variable', function(done) {
    process.env.COUCH_PARALLELISM = '20';
    const config = {};
    applyEnvVars(config);
    assert.strictEqual(typeof config.parallelism, 'number');
    assert.strictEqual(config.parallelism, 20);
    done();
  });

  it('respects the COUCH_REQUEST_TIMEOUT env variable', function(done) {
    process.env.COUCH_REQUEST_TIMEOUT = '10000';
    const config = {};
    applyEnvVars(config);
    assert.strictEqual(typeof config.requestTimeout, 'number');
    assert.strictEqual(config.requestTimeout, 10000);
    done();
  });

  it('respects the CLOUDANT_IAM_API_KEY env variable', function(done) {
    const key = 'ABC123-ZYX987_cba789-xyz321';
    process.env.CLOUDANT_IAM_API_KEY = key;
    const config = {};
    applyEnvVars(config);
    assert.strictEqual(typeof config.iamApiKey, 'string');
    assert.strictEqual(config.iamApiKey, key);
    done();
  });

  it('respects the CLOUDANT_IAM_TOKEN_URL env variable', function(done) {
    const u = 'https://testhost.example:1234/identity/token';
    process.env.CLOUDANT_IAM_TOKEN_URL = u;
    const config = {};
    applyEnvVars(config);
    assert.strictEqual(typeof config.iamTokenUrl, 'string');
    assert.strictEqual(config.iamTokenUrl, u);
    done();
  });

  it('respects the COUCH_LOG env variable', function(done) {
    process.env.COUCH_LOG = 'my.log';
    const config = {};
    applyEnvVars(config);
    assert.strictEqual(typeof config.log, 'string');
    assert.strictEqual(config.log, process.env.COUCH_LOG);
    done();
  });

  it('respects the COUCH_RESUME env variable', function(done) {
    process.env.COUCH_RESUME = 'true';
    const config = {};
    applyEnvVars(config);
    assert.strictEqual(typeof config.resume, 'boolean');
    assert.strictEqual(config.resume, true);
    done();
  });

  it('respects the COUCH_OUTPUT env variable', function(done) {
    process.env.COUCH_OUTPUT = 'myfile.txt';
    const config = {};
    applyEnvVars(config);
    assert.strictEqual(typeof config.output, 'string');
    assert.strictEqual(config.output, process.env.COUCH_OUTPUT);
    done();
  });

  it('respects the COUCH_MODE env variable', function(done) {
    process.env.COUCH_MODE = 'shallow';
    const config = {};
    applyEnvVars(config);
    assert.strictEqual(typeof config.mode, 'string');
    assert.strictEqual(config.mode, 'shallow');
    done();
  });

  it('respects the COUCH_QUIET env variable', function(done) {
    process.env.COUCH_QUIET = 'true';
    const config = {};
    applyEnvVars(config);
    assert.strictEqual(typeof config.quiet, 'boolean');
    assert.strictEqual(config.quiet, true);
    done();
  });
});
