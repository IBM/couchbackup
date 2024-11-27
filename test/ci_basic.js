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

const fs = require('fs');
const { once } = require('node:events');
const u = require('./citestutils.js');

[{ useApi: true }, { useApi: false }].forEach(function(params) {
  describe(u.scenario('Basic backup and restore', params), function() {
    it('should backup animaldb to a file correctly', async function() {
      // Allow up to 40 s to backup and compare (it should be much faster)!
      u.setTimeout(this, 40);
      const actualBackup = `./${this.fileName}`;
      // Create a file and backup to it
      const output = fs.createWriteStream(actualBackup);
      return once(output, 'open')
        .then(() => {
          return u.testBackup(params, 'animaldb', output);
        }).then(() => {
          return u.backupFileCompare(actualBackup, './test/fixtures/animaldb_expected.json');
        });
    });

    it('should restore animaldb to a database correctly', async function() {
      // Allow up to 60 s to restore and compare (again it should be faster)!
      u.setTimeout(this, 60);
      const input = fs.createReadStream('./test/fixtures/animaldb_expected.json');
      const dbName = this.dbName;
      return once(input, 'open').then(() => {
        return u.testRestore(params, input, dbName);
      }).then(() => {
        return u.dbCompare('animaldb', dbName);
      });
    });

    it('should execute a shallow mode backup successfully', async function() {
      // Allow 30 s
      u.setTimeout(this, 30);
      const actualBackup = `./${this.fileName}`;
      const output = fs.createWriteStream(actualBackup);
      // Add the shallow mode option
      const p = u.p(params, { opts: { mode: 'shallow' } });
      return once(output, 'open')
        .then(() => {
          return u.testBackup(p, 'animaldb', output);
        }).then(() => {
          return u.backupFileCompare(actualBackup, './test/fixtures/animaldb_expected_shallow.json');
        });
    });

    describe(u.scenario('Buffer size tests', params), function() {
      it('should backup/restore animaldb with the same buffer size', async function() {
        // Allow up to 60 s for backup and restore of animaldb
        u.setTimeout(this, 60);
        const actualBackup = `./${this.fileName}`;
        const logFile = `./${this.fileName}` + '.log';
        const p = u.p(params, { opts: { log: logFile, bufferSize: 1 } });
        return u.testBackupAndRestoreViaFile(p, 'animaldb', actualBackup, this.dbName);
      });

      it('should backup/restore animaldb with backup buffer > restore buffer', async function() {
        // Allow up to 60 s for backup and restore of animaldb
        u.setTimeout(this, 60);
        const actualBackup = `./${this.fileName}`;
        const logFile = `./${this.fileName}` + '.log';
        const dbName = this.dbName;
        const p = u.p(params, { opts: { log: logFile, bufferSize: 2 } }); // backup
        const q = u.p(params, { opts: { bufferSize: 1 } }); // restore
        return u.testBackupToFile(p, 'animaldb', actualBackup).then(() => {
          return u.testRestoreFromFile(q, actualBackup, dbName);
        }).then(() => {
          return u.dbCompare('animaldb', dbName);
        });
      });

      it('should backup/restore animaldb with backup buffer < restore buffer', async function() {
        // Allow up to 60 s for backup and restore of animaldb
        u.setTimeout(this, 60);
        const actualBackup = `./${this.fileName}`;
        const logFile = `./${this.fileName}` + '.log';
        const dbName = this.dbName;
        const p = u.p(params, { opts: { log: logFile, bufferSize: 1 } }); // backup
        const q = u.p(params, { opts: { bufferSize: 2 } }); // restore
        return u.testBackupToFile(p, 'animaldb', actualBackup).then(() => {
          return u.testRestoreFromFile(q, actualBackup, dbName);
        }).then(() => {
          return u.dbCompare('animaldb', dbName);
        });
      });
    });
  });
});
