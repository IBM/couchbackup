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

const assert = require('assert');
const fs = require('fs');
const u = require('./citestutils.js');

[{ useApi: true }, { useApi: false }].forEach(function(params) {
  describe(u.scenario('Resume tests', params), function() {
    it('should create a log file', function(done) {
      // Allow up to 90 s for this test
      u.setTimeout(this, 60);

      const actualBackup = `./${this.fileName}`;
      const logFile = `./${this.fileName}` + '.log';
      // Use abort parameter to terminate the backup a given number of ms after
      // the first data write to the output file.
      const p = u.p(params, { opts: { log: logFile } });
      u.testBackupToFile(p, 'animaldb', actualBackup, function(err) {
        if (err) {
          done(err);
        } else {
          // Assert the log file exists
          try {
            assert.ok(fs.existsSync(logFile), 'The log file should exist.');
            done();
          } catch (err) {
            done(err);
          }
        }
      });
    });

    it('should restore corrupted animaldb to a database correctly', function(done) {
      // Allow up to 60 s to restore and compare (again it should be faster)!
      u.setTimeout(this, 60);
      const input = fs.createReadStream('./test/fixtures/animaldb_corrupted.json');
      const dbName = this.dbName;
      input.on('open', function() {
        u.testRestore(params, input, dbName, function(err) {
          if (err) {
            done(err);
          } else {
            u.dbCompare('animaldb', dbName, done);
          }
        });
      });
    });

    it('should restore resumed animaldb with blank line to a database correctly', function(done) {
      // Allow up to 60 s to restore and compare (again it should be faster)!
      u.setTimeout(this, 60);
      const input = fs.createReadStream('./test/fixtures/animaldb_resumed_blank.json');
      const dbName = this.dbName;
      input.on('open', function() {
        u.testRestore(params, input, dbName, function(err) {
          if (err) {
            done(err);
          } else {
            u.dbCompare('animaldb', dbName, done);
          }
        });
      });
    });
  });
});

describe('Resume tests', function() {
  // Currently cannot abort API backups, when we do this test should be run for
  // both API and CLI
  it('should correctly backup and restore backup10m', function(done) {
    // Allow up to 90 s for this test
    u.setTimeout(this, 90);

    const actualBackup = `./${this.fileName}`;
    const logFile = `./${this.fileName}` + '.log';
    // Use abort parameter to terminate the backup a given number of ms after
    // the first data write to the output file.
    const p = u.p(params, { abort: true }, { opts: { log: logFile } });
    const restoreDb = this.dbName;
    // Set the database doc count as fewer than this should be written during
    // resumed backup.
    p.exclusiveMaxExpected = 5096;

    u.testBackupAbortResumeRestore(p, 'backup10m', actualBackup, restoreDb, done);
  });
  // Note --output is only valid for CLI usage, this test should only run for CLI
  const params = { useApi: false };
  it('should correctly backup and restore backup10m using --output', function(done) {
    // Allow up to 90 s for this test
    u.setTimeout(this, 90);

    const actualBackup = `./${this.fileName}`;
    const logFile = `./${this.fileName}` + '.log';
    // Use abort parameter to terminate the backup a given number of ms after
    // the first data write to the output file.
    const p = u.p(params, { abort: true }, { opts: { output: actualBackup, log: logFile } });
    const restoreDb = this.dbName;
    // Set the database doc count as fewer than this should be written during
    // resumed backup.
    p.exclusiveMaxExpected = 5096;

    u.testBackupAbortResumeRestore(p, 'backup10m', actualBackup, restoreDb, done);
  });
});
