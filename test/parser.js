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

/* global describe afterEach before after it */
'use strict';

var assert = require('assert');
var parser = require('../includes/parser.js');

describe('#unit Default parameters', function() {
  var processEnvCopy;
  var processArgvCopy;

  before('Set process data for test', function() {
    // Copy env and argv so we can reset them after the tests
    processEnvCopy = JSON.parse(JSON.stringify(process.env));
    processArgvCopy = JSON.parse(JSON.stringify(process.argv));

    // setup environment variables
    process.env.COUCH_URL = 'http://user:pass@myurl.com';
    process.env.COUCH_DATABASE = 'mydb';
    process.env.COUCH_BUFFER_SIZE = '1000';
    process.env.COUCH_PARALLELISM = '20';
    process.env.COUCH_LOG = 'my.log';
    process.env.COUCH_RESUME = 'true';
    process.env.COUCH_OUTPUT = 'myfile.txt';
    process.env.COUCH_MODE = 'shallow';
    process.env.CLOUDANT_IAM_API_KEY = 'ABC123-ZYX987_cba789-xyz321';
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
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.url, 'string');
      assert.equal(program.url, process.env.COUCH_URL);
      done();
    });

    it('respects the COUCH_DATABASE env variable if the --db backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.db, 'string');
      assert.equal(program.db, process.env.COUCH_DATABASE);
      done();
    });

    it('respects the COUCH_BUFFER_SIZE env variable if the --buffer-size backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.bufferSize, 'number');
      assert.equal(program.bufferSize, process.env.COUCH_BUFFER_SIZE);
      done();
    });

    it('respects the COUCH_PARALLELISM env variable if the --parallelism backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.parallelism, 'number');
      assert.equal(program.parallelism, process.env.COUCH_PARALLELISM);
      done();
    });

    it('respects the CLOUDANT_IAM_API_KEY env variable if the --iam-api-key backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.iamApiKey, 'string');
      assert.equal(program.iamApiKey, process.env.CLOUDANT_IAM_API_KEY);
      done();
    });

    it('respects the COUCH_LOG env variable if the --log backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.log, 'string');
      assert.equal(program.log, process.env.COUCH_LOG);
      done();
    });

    it('respects the COUCH_OUTPUT env variable if the --output backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.output, 'string');
      assert.equal(program.output, process.env.COUCH_OUTPUT);
      done();
    });

    it('respects the COUCH_MODE env variable if the --mode backup command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.mode, 'string');
      assert.equal(program.mode, process.env.COUCH_MODE);
      done();
    });

    it('respects the backup --url command-line parameter', function(done) {
      var url = 'http://user:pass@myurl2.com';
      process.argv = ['node', 'test', '--url', url];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.url, 'string');
      assert.equal(program.url, url);
      done();
    });

    it('respects the backup --db command-line parameter', function(done) {
      var db = 'mydb2';
      process.argv = ['node', 'test', '--db', db];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.db, 'string');
      assert.equal(program.db, db);
      done();
    });

    it('respects the backup --buffer-size command-line parameter', function(done) {
      var bufferSize = 500;
      process.argv = ['node', 'test', '--buffer-size', bufferSize];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.bufferSize, 'number');
      assert.equal(program.bufferSize, bufferSize);
      done();
    });

    it('respects the backup --parallelism command-line parameter', function(done) {
      var parallelism = 10;
      process.argv = ['node', 'test', '--parallelism', parallelism];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.parallelism, 'number');
      assert.equal(program.parallelism, parallelism);
      done();
    });

    it('respects the backup --iam-api-key command-line parameter', function(done) {
      const key = '123abc-789zyx_CBA987-XYZ321';
      process.argv = ['node', 'test', '--iam-api-key', key];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.iamApiKey, 'string');
      assert.equal(program.iamApiKey, key);
      done();
    });

    it('respects the backup --log command-line parameter', function(done) {
      var filename = 'my2.log';
      process.argv = ['node', 'test', '--log', filename];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.log, 'string');
      assert.equal(program.log, filename);
      done();
    });

    it('respects the backup --output command-line parameter', function(done) {
      var filename = 'myfile2.txt';
      process.argv = ['node', 'test', '--output', filename];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.output, 'string');
      assert.equal(program.output, filename);
      done();
    });

    it('respects the backup --mode full command-line parameter', function(done) {
      process.argv = ['node', 'test', '--mode', 'full'];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.mode, 'string');
      assert.equal(program.mode, 'full');
      done();
    });

    it('respects the backup --mode shallow command-line parameter', function(done) {
      process.argv = ['node', 'test', '--mode', 'shallow'];
      var program = parser.parseBackupArgs();
      assert.equal(typeof program.mode, 'string');
      assert.equal(program.mode, 'shallow');
      done();
    });
  });

  describe('Restore command-line', function() {
    it('respects the COUCH_URL env variable if the --url restore command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      var program = parser.parseRestoreArgs();
      assert.equal(typeof program.url, 'string');
      assert.equal(program.url, process.env.COUCH_URL);
      done();
    });

    it('respects the COUCH_DATABASE env variable if the --db restore command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      var program = parser.parseRestoreArgs();
      assert.equal(typeof program.db, 'string');
      assert.equal(program.db, process.env.COUCH_DATABASE);
      done();
    });

    it('respects the COUCH_BUFFER_SIZE env variable if the --buffer-size restore command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      var program = parser.parseRestoreArgs();
      assert.equal(typeof program.bufferSize, 'number');
      assert.equal(program.bufferSize, process.env.COUCH_BUFFER_SIZE);
      done();
    });

    it('respects the COUCH_PARALLELISM env variable if the --parallelism restore command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      var program = parser.parseRestoreArgs();
      assert.equal(typeof program.parallelism, 'number');
      assert.equal(program.parallelism, process.env.COUCH_PARALLELISM);
      done();
    });

    it('respects the CLOUDANT_IAM_API_KEY env variable if the --iam-api-key restore command-line parameter is missing', function(done) {
      process.argv = ['node', 'test'];
      var program = parser.parseRestoreArgs();
      assert.equal(typeof program.iamApiKey, 'string');
      assert.equal(program.iamApiKey, process.env.CLOUDANT_IAM_API_KEY);
      done();
    });

    it('respects the restore --url command-line parameter', function(done) {
      var url = 'https://a:b@myurl3.com';
      process.argv = ['node', 'test', '--url', url];
      var program = parser.parseRestoreArgs();
      assert.equal(typeof program.url, 'string');
      assert.equal(program.url, url);
      done();
    });

    it('respects the restore --db command-line parameter', function(done) {
      var db = 'mydb3';
      process.argv = ['node', 'test', '--db', db];
      var program = parser.parseRestoreArgs();
      assert.equal(typeof program.db, 'string');
      assert.equal(program.db, db);
      done();
    });

    it('respects the restore --buffer-size command-line parameter', function(done) {
      var bufferSize = 250;
      process.argv = ['node', 'test', '--buffer-size', bufferSize];
      var program = parser.parseRestoreArgs();
      assert.equal(typeof program.bufferSize, 'number');
      assert.equal(program.bufferSize, bufferSize);
      done();
    });

    it('respects the restore --parallelism command-line parameter', function(done) {
      var parallelism = 5;
      process.argv = ['node', 'test', '--parallelism', parallelism];
      var program = parser.parseRestoreArgs();
      assert.equal(typeof program.parallelism, 'number');
      assert.equal(program.parallelism, parallelism);
      done();
    });

    it('respects the restore --iam-api-key command-line parameter', function(done) {
      const key = '123abc-789zyx_CBA987-XYZ321';
      process.argv = ['node', 'test', '--iam-api-key', key];
      var program = parser.parseRestoreArgs();
      assert.equal(typeof program.iamApiKey, 'string');
      assert.equal(program.iamApiKey, key);
      done();
    });
  });
});
