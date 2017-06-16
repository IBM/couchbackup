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

delete require.cache[require.resolve('./citestutils.js')];
const u = require('./citestutils.js');

[{useApi: true}, {useApi: false}].forEach(function(params) {
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
            u.readSortAndDeepEqual(actualBackup, './animaldb_expected.json', done);
          }
        });
      });
    });

    it('should restore animaldb to a database correctly', function(done) {
      // Allow up to 60 s to restore and compare (again it should be faster)!
      u.setTimeout(this, 60);
      const input = fs.createReadStream('animaldb_expected.json');
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

    it('should restore corrupted animaldb to a database correctly', function(done) {
      // Allow up to 60 s to restore and compare (again it should be faster)!
      u.setTimeout(this, 60);
      const input = fs.createReadStream('animaldb_corrupted.json');
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
      const input = fs.createReadStream('animaldb_resumed_blank.json');
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
      const p = u.p(params, {opts: {mode: 'shallow'}});
      output.on('open', function() {
        u.testBackup(p, 'animaldb', output, function(err) {
          if (err) {
            done(err);
          } else {
            u.readSortAndDeepEqual(actualBackup, './animaldb_expected_shallow.json', done);
          }
        });
      });
    });
  });

  describe(u.scenario('End to end backup and restore', params), function() {
    it('should backup and restore animaldb', function(done) {
      // Allow up to 60 s for backup and restore of animaldb
      u.setTimeout(this, 60);
      u.testDirectBackupAndRestore(params, 'animaldb', this.dbName, done);
    });
    it('should backup and restore largedb1g #slow', function(done) {
      // Allow up to 30 m for backup and restore of largedb1g
      // This is a long time but when many builds run in parallel it can take a
      // while to get this done.
      u.setTimeout(this, 30 * 60);
      u.testDirectBackupAndRestore(params, 'largedb1g', this.dbName, done);
    });
  });

  describe(u.scenario('Compression tests', params), function() {
    const p = u.p(params, {compression: true});

    it('should backup animaldb to a compressed file', function(done) {
      // Allow up to 60 s for backup and restore of animaldb
      u.setTimeout(this, 40);
      const compressedBackup = `./${this.fileName}`;
      const output = fs.createWriteStream(compressedBackup);
      output.on('open', function() {
        u.testBackup(p, 'animaldb', output, function(err) {
          if (err) {
            done(err);
          } else {
            u.assertGzipFile(compressedBackup, done);
          }
        });
      });
    });

    it('should backup and restore animaldb via a compressed file', function(done) {
      // Allow up to 60 s for backup and restore of animaldb
      u.setTimeout(this, 60);
      const compressedBackup = `./${this.fileName}`;
      u.testBackupAndRestoreViaFile(p, 'animaldb', compressedBackup, this.dbName, function(err) {
        if (err) {
          done(err);
        } else {
          u.assertGzipFile(compressedBackup, done);
        }
      });
    });

    it('should backup and restore animaldb via a compressed stream', function(done) {
      // Allow up to 60 s for backup and restore of animaldb
      u.setTimeout(this, 60);
      u.testDirectBackupAndRestore(p, 'animaldb', this.dbName, done);
    });

    it('should backup and restore largedb2g via a compressed file #slower', function(done) {
      // Categorize as a 60 min test so it only gets run with the long run tests
      u.setTimeout(this, 60 * 60);
      const compressedBackup = `./${this.fileName}`;
      params.compression = true;
      u.testBackupAndRestoreViaFile(p, 'largedb2g', compressedBackup, this.dbName, done);
    });
  });
  describe(u.scenario('Resume tests', params), function() {
    it('should create a log file', function(done) {
      // Allow up to 90 s for this test
      u.setTimeout(this, 60);

      const actualBackup = `./${this.fileName}`;
      const logFile = `./${this.fileName}` + '.log';
      // Use abort parameter to terminate the backup a given number of ms after
      // the first data write to the output file.
      const p = u.p(params, {opts: {log: logFile}});
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
  });

  describe(u.scenario('Buffer size tests', params), function() {
    it('should backup/restore animaldb with the same buffer size', function(done) {
      // Allow up to 60 s for backup and restore of animaldb
      u.setTimeout(this, 60);
      const actualBackup = `./${this.fileName}`;
      const logFile = `./${this.fileName}` + '.log';
      const p = u.p(params, {opts: {log: logFile, bufferSize: 1}});
      u.testBackupAndRestoreViaFile(p, 'animaldb', actualBackup, this.dbName, done);
    });
    it('should backup/restore animaldb with backup buffer > restore buffer', function(done) {
      // Allow up to 60 s for backup and restore of animaldb
      u.setTimeout(this, 60);
      const actualBackup = `./${this.fileName}`;
      const logFile = `./${this.fileName}` + '.log';
      const dbName = this.dbName;
      const p = u.p(params, {opts: {log: logFile, bufferSize: 2}}); // backup
      const q = u.p(params, {opts: {bufferSize: 1}}); // restore
      u.testBackupToFile(p, 'animaldb', actualBackup, function(err) {
        if (err) {
          done(err);
        } else {
          // restore
          u.testRestoreFromFile(q, actualBackup, dbName, function(err) {
            u.dbCompare('animaldb', dbName, done);
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
      const p = u.p(params, {opts: {log: logFile, bufferSize: 1}}); // backup
      const q = u.p(params, {opts: {bufferSize: 2}}); // restore
      u.testBackupToFile(p, 'animaldb', actualBackup, function(err) {
        if (err) {
          done(err);
        } else {
          // restore
          u.testRestoreFromFile(q, actualBackup, dbName, function(err) {
            u.dbCompare('animaldb', dbName, done);
          });
        }
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
    const p = u.p(params, {abort: true}, {opts: {log: logFile}});
    const restoreDb = this.dbName;
    // Set the database doc count as fewer than this should be written during
    // resumed backup.
    p.exclusiveMaxExpected = 5096;

    u.testBackupAbortResumeRestore(p, 'backup10m', actualBackup, restoreDb, done);
  });
  // Note --output is only valid for CLI usage, this test should only run for CLI
  const params = {useApi: false};
  it('should correctly backup and restore backup10m using --output', function(done) {
    // Allow up to 90 s for this test
    u.setTimeout(this, 90);

    const actualBackup = `./${this.fileName}`;
    const logFile = `./${this.fileName}` + '.log';
    // Use abort parameter to terminate the backup a given number of ms after
    // the first data write to the output file.
    const p = u.p(params, {abort: true}, {opts: {output: actualBackup, log: logFile}});
    const restoreDb = this.dbName;
    // Set the database doc count as fewer than this should be written during
    // resumed backup.
    p.exclusiveMaxExpected = 5096;

    u.testBackupAbortResumeRestore(p, 'backup10m', actualBackup, restoreDb, done);
  });
});

describe('Event tests', function() {
  it('should get a finished event when using stdout', function(done) {
    u.setTimeout(this, 40);
    // Use the API so we can get events
    const params = {useApi: true};
    const backup = u.testBackup(params, 'animaldb', process.stdout, function(err) {
      if (err) {
        done(err);
      }
    });
    backup.on('finished', function() {
      try {
        // Test will time out if the finished event is not emitted
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should get a finished event when using file output', function(done) {
    u.setTimeout(this, 40);
    // Use the API so we can get events
    const params = {useApi: true};
    const actualBackup = `./${this.fileName}`;
    // Create a file and backup to it
    const output = fs.createWriteStream(actualBackup);
    output.on('open', function() {
      const backup = u.testBackup(params, 'animaldb', output, function(err) {
        if (err) {
          done(err);
        }
      });
      backup.on('finished', function() {
        try {
          // Test will time out if the finished event is not emitted
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });
});

describe('Write error tests', function() {
  it('calls callback with error set when stream is not writeable', function(done) {
    u.setTimeout(this, 10);
    const dirname = fs.mkdtempSync('test_backup');
    // make temp dir not writeable
    fs.chmodSync(dirname, 0);
    const filename = dirname + '/test.backup';
    const backupStream = fs.createWriteStream(filename, {flags: 'w'});
    const params = {useApi: true};
    // try to do backup and check err was set in callback
    u.testBackup(params, 'animaldb', backupStream, function(err) {
      try {
        // cleanup temp dir
        fs.chmodSync(dirname, 0x1B6); // 666 in octal
        fs.rmdirSync(dirname);
        // error should have been set
        assert.ok(err != null);
        assert.equal(err.code, 'EACCES');
        done();
      } catch (err) {
        done(err);
      }
    });
  });
});
