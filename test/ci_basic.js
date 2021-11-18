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

const fs = require('fs');
const u = require('./citestutils.js');

[{ useApi: true }, { useApi: false }].forEach(function(params) {
  describe(u.scenario('Basic backup and restore', params), function() {
    it('should backup animaldb to a file correctly', function(done) {
      // Allow up to 40 s to backup and compare (it should be much faster)!
      u.setTimeout(this, 40);
      const actualBackup = `./${this.fileName}`;
      // Create a file and backup to it
      const output = fs.createWriteStream(actualBackup);
      output.on('open', function() {
        u.testBackup(params, 'animaldb', output, function(err) {
          if (err) {
            done(err);
          } else {
            u.readSortAndDeepEqual(actualBackup, './test/fixtures/animaldb_expected.json', done);
          }
        });
      });
    });

    it('should restore animaldb to a database correctly', function(done) {
      // Allow up to 60 s to restore and compare (again it should be faster)!
      u.setTimeout(this, 60);
      const input = fs.createReadStream('./test/fixtures/animaldb_expected.json');
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

    it('should execute a shallow mode backup successfully', function(done) {
      // Allow 30 s
      u.setTimeout(this, 30);
      const actualBackup = `./${this.fileName}`;
      const output = fs.createWriteStream(actualBackup);
      // Add the shallow mode option
      const p = u.p(params, { opts: { mode: 'shallow' } });
      output.on('open', function() {
        u.testBackup(p, 'animaldb', output, function(err) {
          if (err) {
            done(err);
          } else {
            u.readSortAndDeepEqual(actualBackup, './test/fixtures/animaldb_expected_shallow.json', done);
          }
        });
      });
    });

    describe(u.scenario('Buffer size tests', params), function() {
      it('should backup/restore animaldb with the same buffer size', function(done) {
        // Allow up to 60 s for backup and restore of animaldb
        u.setTimeout(this, 60);
        const actualBackup = `./${this.fileName}`;
        const logFile = `./${this.fileName}` + '.log';
        const p = u.p(params, { opts: { log: logFile, bufferSize: 1 } });
        u.testBackupAndRestoreViaFile(p, 'animaldb', actualBackup, this.dbName, done);
      });
      it('should backup/restore animaldb with backup buffer > restore buffer', function(done) {
        // Allow up to 60 s for backup and restore of animaldb
        u.setTimeout(this, 60);
        const actualBackup = `./${this.fileName}`;
        const logFile = `./${this.fileName}` + '.log';
        const dbName = this.dbName;
        const p = u.p(params, { opts: { log: logFile, bufferSize: 2 } }); // backup
        const q = u.p(params, { opts: { bufferSize: 1 } }); // restore
        u.testBackupToFile(p, 'animaldb', actualBackup, function(err) {
          if (err) {
            done(err);
          } else {
            // restore
            u.testRestoreFromFile(q, actualBackup, dbName, function(err) {
              if (!err) {
                u.dbCompare('animaldb', dbName, done);
              } else {
                done(err);
              }
            });
          }
        });
      });
      it('should backup/restore animaldb with backup buffer < restore buffer', function(done) {
        // Allow up to 60 s for backup and restore of animaldb
        u.setTimeout(this, 60);
        const actualBackup = `./${this.fileName}`;
        const logFile = `./${this.fileName}` + '.log';
        const dbName = this.dbName;
        const p = u.p(params, { opts: { log: logFile, bufferSize: 1 } }); // backup
        const q = u.p(params, { opts: { bufferSize: 2 } }); // restore
        u.testBackupToFile(p, 'animaldb', actualBackup, function(err) {
          if (err) {
            done(err);
          } else {
            // restore
            u.testRestoreFromFile(q, actualBackup, dbName, function(err) {
              if (!err) {
                u.dbCompare('animaldb', dbName, done);
              } else {
                done(err);
              }
            });
          }
        });
      });
    });
  });
});
