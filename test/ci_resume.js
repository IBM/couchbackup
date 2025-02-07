// Copyright © 2017, 2024 IBM Corp. All rights reserved.
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

const assert = require('assert');
const fs = require('fs');
const { once } = require('node:events');
const u = require('./citestutils.js');

[{ useApi: true }, { useApi: false }].forEach(function(params) {
  describe(u.scenario('Resume tests', params), function() {
    it('should create a log file', async function() {
      // Allow up to 90 s for this test
      u.setTimeout(this, 60);

      const actualBackup = `./${this.fileName}`;
      const logFile = `./${this.fileName}` + '.log';
      const p = u.p(params, { opts: { log: logFile } });
      return u.testBackupToFile(p, 'animaldb', actualBackup).then(() => {
        assert.ok(fs.existsSync(logFile), 'The log file should exist.');
      });
    });

    it('should restore resumed corrupted animaldb to a database correctly', async function() {
      // Allow up to 60 s to restore and compare (again it should be faster)!
      u.setTimeout(this, 60);
      const input = fs.createReadStream('./test/fixtures/animaldb_corrupted_resume.json');
      const dbName = this.dbName;
      return once(input, 'open')
        .then(() => {
          return u.testRestore(params, input, dbName);
        }).then(() => {
          return u.dbCompare('animaldb', dbName);
        });
    });

    it('should throw error for restore of corrupted animaldb to a database', async function() {
      // Allow up to 60 s to restore and compare (again it should be faster)!
      u.setTimeout(this, 60);
      const input = fs.createReadStream('./test/fixtures/animaldb_corrupted.json');
      const dbName = this.dbName;
      const p = u.p(params, { expectedRestoreError: { name: 'BackupFileJsonError', code: 1 } });
      return once(input, 'open')
        .then(() => u.testRestore(p, input, dbName));
    });

    it('should restore older version of corrupted animaldb to a database correctly', async function() {
      // Allow up to 60 s to restore and compare (again it should be faster)!
      u.setTimeout(this, 60);
      const input = fs.createReadStream('./test/fixtures/animaldb_corrupted_old.json');
      const dbName = this.dbName;
      return once(input, 'open')
        .then(() => {
          return u.testRestore(params, input, dbName);
        }).then(() => {
          return u.dbCompare('animaldb', dbName);
        });
    });

    it('should restore resumed animaldb with blank line to a database correctly', async function() {
      // Allow up to 60 s to restore and compare (again it should be faster)!
      u.setTimeout(this, 60);
      const input = fs.createReadStream('./test/fixtures/animaldb_resumed_blank.json');
      const dbName = this.dbName;
      return once(input, 'open')
        .then(() => {
          return u.testRestore(params, input, dbName);
        }).then(() => {
          return u.dbCompare('animaldb', dbName);
        });
    });
  });
});

describe('Resume tests', function() {
  // Currently cannot abort API backups, when we do this test should be run for
  // both API and CLI
  it('should correctly backup and restore backup10m', async function() {
    // Allow up to 90 s for this test
    u.setTimeout(this, 90);

    const actualBackup = `./${this.fileName}`;
    const logFile = `./${this.fileName}` + '.log';
    // Use abort parameter to terminate the backup
    const p = u.p(params, { abort: true }, { opts: { log: logFile } });
    const restoreDb = this.dbName;
    // Set the database doc count as fewer than this should be written during
    // resumed backup.
    p.exclusiveMaxExpected = 5096;

    return u.testBackupAbortResumeRestore(p, 'backup10m', actualBackup, restoreDb);
  });
  // Note --output is only valid for CLI usage, this test should only run for CLI
  const params = { useApi: false };
  it('should correctly backup and restore backup10m using --output', async function() {
    // Allow up to 90 s for this test
    u.setTimeout(this, 90);

    const actualBackup = `./${this.fileName}`;
    const logFile = `./${this.fileName}` + '.log';
    // Use abort parameter to terminate the backup
    const p = u.p(params, { abort: true }, { opts: { output: actualBackup, log: logFile } });
    const restoreDb = this.dbName;
    // Set the database doc count as fewer than this should be written during
    // resumed backup.
    p.exclusiveMaxExpected = 5096;

    return await u.testBackupAbortResumeRestore(p, 'backup10m', actualBackup, restoreDb);
  });
});
