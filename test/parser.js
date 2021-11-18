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

/* global describe afterEach before after it */
'use strict';

const assert = require('assert');
const parser = require('../includes/parser.js');

describe('#unit Default parameters', function() {
  let processEnvCopy;
  let processArgvCopy;

  before('Set process data for test', function() {
    // Copy env and argv so we can reset them after the tests
    processEnvCopy = JSON.parse(JSON.stringify(process.env));
    processArgvCopy = JSON.parse(JSON.stringify(process.argv));

    // setup environment variables
    process.env.COUCH_URL = 'http://user:pass@myurl.com';
    process.env.COUCH_DATABASE = 'mydb';
    process.env.COUCH_BUFFER_SIZE = '1000';
    process.env.COUCH_PARALLELISM = '20';
    process.env.COUCH_REQUEST_TIMEOUT = '20000';
    process.env.COUCH_LOG = 'my.log';
    process.env.COUCH_RESUME = 'true';
    process.env.COUCH_OUTPUT = 'myfile.txt';
    process.env.COUCH_MODE = 'shallow';
    process.env.CLOUDANT_IAM_API_KEY = 'ABC123-ZYX987_cba789-xyz321';
    process.env.COUCH_QUIET = 'true';
  });

  after('Reset process data', function() {
    process.env = processEnvCopy;
    process.argv = processArgvCopy;
  });

  afterEach(function() {
    delete require.cache[require.resolve('commander')];
  });

  describe('Backup command-line', function() {
    it('respects the COUCH_URL env variable if the --url backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.url, 'string');
      assert.strictEqual(program.url, process.env.COUCH_URL);
      done();
    });

    it('respects the COUCH_DATABASE env variable if the --db backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.db, 'string');
      assert.strictEqual(program.db, process.env.COUCH_DATABASE);
      done();
    });

    it('respects the COUCH_BUFFER_SIZE env variable if the --buffer-size backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.bufferSize, 'number');
      assert.strictEqual(program.bufferSize, parseInt(process.env.COUCH_BUFFER_SIZE, 10));
      done();
    });

    it('respects the COUCH_PARALLELISM env variable if the --parallelism backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.parallelism, 'number');
      assert.strictEqual(program.parallelism, parseInt(process.env.COUCH_PARALLELISM, 10));
      done();
    });

    it('respects the COUCH_REQUEST_TIMEOUT env variable if the --request-timeout backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.requestTimeout, 'number');
      assert.strictEqual(program.requestTimeout, parseInt(process.env.COUCH_REQUEST_TIMEOUT, 10));
      done();
    });

    it('respects the CLOUDANT_IAM_API_KEY env variable if the --iam-api-key backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.iamApiKey, 'string');
      assert.strictEqual(program.iamApiKey, process.env.CLOUDANT_IAM_API_KEY);
      done();
    });

    it('respects the COUCH_LOG env variable if the --log backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.log, 'string');
      assert.strictEqual(program.log, process.env.COUCH_LOG);
      done();
    });

    it('respects the COUCH_RESUME env variable if the --resume backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.resume, 'boolean');
      assert.strictEqual(program.resume, true);
      done();
    });

    it('respects the COUCH_OUTPUT env variable if the --output backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.output, 'string');
      assert.strictEqual(program.output, process.env.COUCH_OUTPUT);
      done();
    });

    it('respects the COUCH_MODE env variable if the --mode backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.mode, 'string');
      assert.strictEqual(program.mode, process.env.COUCH_MODE);
      done();
    });

    it('respects the COUCH_QUIET env variable if the --quiet backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.quiet, 'boolean');
      assert.strictEqual(program.quiet, true);
      done();
    });

    it('respects the backup --url command-line parameter', function(done) {
      const url = 'http://user:pass@myurl2.com';
      process.argv = ['node', 'test', '--url', url];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.url, 'string');
      assert.strictEqual(program.url, url);
      done();
    });

    it('respects the backup --db command-line parameter', function(done) {
      const db = 'mydb2';
      process.argv = ['node', 'test', '--db', db];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.db, 'string');
      assert.strictEqual(program.db, db);
      done();
    });

    it('respects the backup --buffer-size command-line parameter', function(done) {
      const bufferSize = 500;
      process.argv = ['node', 'test', '--buffer-size', bufferSize];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.bufferSize, 'number');
      assert.strictEqual(program.bufferSize, bufferSize);
      done();
    });

    it('respects the backup --parallelism command-line parameter', function(done) {
      const parallelism = 10;
      process.argv = ['node', 'test', '--parallelism', parallelism];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.parallelism, 'number');
      assert.strictEqual(program.parallelism, parallelism);
      done();
    });

    it('respects the backup --request-timeout command-line parameter', function(done) {
      const requestTimeout = 10000;
      process.argv = ['node', 'test', '--request-timeout', requestTimeout];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.requestTimeout, 'number');
      assert.strictEqual(program.requestTimeout, requestTimeout);
      done();
    });

    it('respects the backup --iam-api-key command-line parameter', function(done) {
      const key = '123abc-789zyx_CBA987-XYZ321';
      process.argv = ['node', 'test', '--iam-api-key', key];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.iamApiKey, 'string');
      assert.strictEqual(program.iamApiKey, key);
      done();
    });

    it('respects the backup --log command-line parameter', function(done) {
      const filename = 'my2.log';
      process.argv = ['node', 'test', '--log', filename];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.log, 'string');
      assert.strictEqual(program.log, filename);
      done();
    });

    it('respects the backup --resume command-line parameter', function(done) {
      process.argv = ['node', 'test', '--resume'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.resume, 'boolean');
      assert.strictEqual(program.resume, true);
      done();
    });

    it('respects the backup --output command-line parameter', function(done) {
      const filename = 'myfile2.txt';
      process.argv = ['node', 'test', '--output', filename];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.output, 'string');
      assert.strictEqual(program.output, filename);
      done();
    });

    it('respects the backup --mode full command-line parameter', function(done) {
      process.argv = ['node', 'test', '--mode', 'full'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.mode, 'string');
      assert.strictEqual(program.mode, 'full');
      done();
    });

    it('respects the backup --mode shallow command-line parameter', function(done) {
      process.argv = ['node', 'test', '--mode', 'shallow'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.mode, 'string');
      assert.strictEqual(program.mode, 'shallow');
      done();
    });

    it('respects the backup --quiet command-line parameter', function(done) {
      process.argv = ['node', 'test', '--quiet'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.quiet, 'boolean');
      assert.strictEqual(program.quiet, true);
      done();
    });
  });

  describe('Restore command-line', function() {
    it('respects the COUCH_URL env variable if the --url restore command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.url, 'string');
      assert.strictEqual(program.url, process.env.COUCH_URL);
      done();
    });

    it('respects the COUCH_DATABASE env variable if the --db restore command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.db, 'string');
      assert.strictEqual(program.db, process.env.COUCH_DATABASE);
      done();
    });

    it('respects the COUCH_BUFFER_SIZE env variable if the --buffer-size restore command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.bufferSize, 'number');
      assert.strictEqual(program.bufferSize, parseInt(process.env.COUCH_BUFFER_SIZE, 10));
      done();
    });

    it('respects the COUCH_PARALLELISM env variable if the --parallelism restore command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.parallelism, 'number');
      assert.strictEqual(program.parallelism, parseInt(process.env.COUCH_PARALLELISM, 10));
      done();
    });

    it('respects the COUCH_REQUEST_TIMEOUT env variable if the --request-timeout restore command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.requestTimeout, 'number');
      assert.strictEqual(program.requestTimeout, parseInt(process.env.COUCH_REQUEST_TIMEOUT, 10));
      done();
    });

    it('respects the CLOUDANT_IAM_API_KEY env variable if the --iam-api-key restore command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.iamApiKey, 'string');
      assert.strictEqual(program.iamApiKey, process.env.CLOUDANT_IAM_API_KEY);
      done();
    });

    it('respects the COUCH_QUIET env variable if the --quiet restorer command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      const program = parser.parseBackupArgs();
      assert.strictEqual(typeof program.quiet, 'boolean');
      assert.strictEqual(program.quiet, true);
      done();
    });

    it('respects the restore --url command-line parameter', function(done) {
      const url = 'https://a:b@myurl3.com';
      process.argv = ['node', 'test', '--url', url];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.url, 'string');
      assert.strictEqual(program.url, url);
      done();
    });

    it('respects the restore --db command-line parameter', function(done) {
      const db = 'mydb3';
      process.argv = ['node', 'test', '--db', db];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.db, 'string');
      assert.strictEqual(program.db, db);
      done();
    });

    it('respects the restore --buffer-size command-line parameter', function(done) {
      const bufferSize = 250;
      process.argv = ['node', 'test', '--buffer-size', bufferSize];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.bufferSize, 'number');
      assert.strictEqual(program.bufferSize, bufferSize);
      done();
    });

    it('respects the restore --parallelism command-line parameter', function(done) {
      const parallelism = 5;
      process.argv = ['node', 'test', '--parallelism', parallelism];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.parallelism, 'number');
      assert.strictEqual(program.parallelism, parallelism);
      done();
    });

    it('respects the restore --request-timeout command-line parameter', function(done) {
      const requestTimeout = 10000;
      process.argv = ['node', 'test', '--request-timeout', requestTimeout];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.requestTimeout, 'number');
      assert.strictEqual(program.requestTimeout, requestTimeout);
      done();
    });

    it('respects the restore --iam-api-key command-line parameter', function(done) {
      const key = '123abc-789zyx_CBA987-XYZ321';
      process.argv = ['node', 'test', '--iam-api-key', key];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.iamApiKey, 'string');
      assert.strictEqual(program.iamApiKey, key);
      done();
    });

    it('respects the restore --quiet command-line parameter', function(done) {
      process.argv = ['node', 'test', '--quiet'];
      const program = parser.parseRestoreArgs();
      assert.strictEqual(typeof program.quiet, 'boolean');
      assert.strictEqual(program.quiet, true);
      done();
    });
  });
});
