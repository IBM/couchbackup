/* global describe it beforeEach afterEach */
'use strict';

const assert = require('assert');
const spawn = require('child_process').spawn;
const fs = require('fs');
const cloudant = require('cloudant')({url: process.env.COUCH_URL});
const uuid = require('uuid/v4');
const app = require('../app.js');
const dbUrl = require('../includes/cliutils.js').databaseUrl;
const stream = require('stream');

var dbName;
beforeEach('Create test database', function(done) {
  // Allow 10 seconds to create the DB
  this.timeout(10 * 1000);
  dbName = 'couchbackup_test_' + uuid();
  console.log(`Database name ${dbName}`);
  cloudant.db.create(dbName, function(err) {
    if (err) {
      done(err);
    } else {
      done();
    }
  });
});

afterEach('Delete test database', function(done) {
  // Allow 10 seconds to delete the DB
  this.timeout(10 * 1000);
  cloudant.db.destroy(dbName, function(err) {
    if (err) {
      done(err);
    } else {
      done();
    }
  });
});

[{useApi: true}, {useApi: false}].forEach(function(params) {
  describe(`Basic backup and restore ${(params.useApi) ? 'using API' : 'using CLI'}`, function() {
    // Allow up to 40 s to backup and compare (it should be much faster)!
    this.timeout(40 * 1000);
    it('should backup animaldb to a file correctly', function(done) {
      // Create a file and backup to it
      const output = fs.createWriteStream('animaldb_actual.json');
      output.on('open', function() {
        testBackup(params.useApi, 'animaldb', output, function(err) {
          if (err) {
            done(err);
          } else {
            const backupContent = require('./animaldb_actual.json');
            const expectedContent = require('./animaldb_expected.json');
            // Array order of the docs is important for equality, but not for backup
            backupContent.sort(sortByIdThenRev);
            expectedContent.sort(sortByIdThenRev);
            // Assert that the backup matches the expected
            try {
              assert.deepEqual(backupContent, expectedContent);
              done();
            } catch (err) {
              done(err);
            }
          }
        });
      });
    });

    it('should restore animaldb to a database correctly', function(done) {
      // Allow up to 60 s to restore and compare (again it should be faster)!
      this.timeout(60 * 1000);
      const input = fs.createReadStream('animaldb_expected.json');
      input.on('open', function() {
        testRestore(params.useApi, input, dbName, function(err) {
          if (err) {
            done(err);
          } else {
            dbCompare('animaldb', dbName, done);
          }
        });
      });
    });
  });

  describe(`End to end backup and restore ${(params.useApi) ? 'using API' : 'using CLI'}`, function() {
    it('should backup and restore animaldb', function(done) {
      // Allow up to 60 s for backup and restore of animaldb
      this.timeout(60 * 1000);
      testBackupAndRestore(params.useApi, 'animaldb', dbName, done);
    });
    it('should backup and restore largedb1g', function(done) {
      // Allow up to 10 m for backup and restore of largedb1g
      this.timeout(10 * 60 * 1000);
      testBackupAndRestore(params.useApi, 'largedb1g', dbName, done);
    });
  });
});

function testBackup(useApi, databaseName, outputStream, callback) {
  if (useApi) {
    app.backup(dbUrl(process.env.COUCH_URL, databaseName), outputStream, null, function(err, data) {
      if (err) {
        callback(err);
      } else {
        console.log(data);
        callback();
      }
    });
  } else {
    // Note use spawn not fork for stdio options not supported with fork in Node 4.x
    const backup = spawn('node', ['../bin/couchbackup.bin.js', '--db', databaseName], {'stdio': ['ignore', 'pipe', 'inherit']});
    // Pipe the stdout to the supplied outputStream
    backup.stdout.pipe(outputStream);
    backup.on('exit', function(code) {
      try {
        assert.equal(code, 0, 'The backup should exit normally.');
        callback();
      } catch (err) {
        callback(err);
      }
    });
    backup.on('error', function(err) {
      callback(err);
    });
  }
}

function testRestore(useApi, inputStream, databaseName, callback) {
  if (useApi) {
    app.restore(inputStream, dbUrl(process.env.COUCH_URL, databaseName), null, function(err, data) {
      if (err) {
        callback(err);
      } else {
        console.log(data);
        callback();
      }
    });
  } else {
    // Note use spawn not fork for stdio options not supported with fork in Node 4.x
    const restore = spawn('node', ['../bin/couchrestore.bin.js', '--db', databaseName], {'stdio': ['pipe', 'inherit', 'inherit']});
    // Pipe to write the readable inputStream into stdin
    inputStream.pipe(restore.stdin);
    restore.on('exit', function(code) {
      try {
        assert.equal(code, 0, 'The restore should exit normally.');
        callback();
      } catch (err) {
        callback(err);
      }
    });
    restore.on('error', function(err) {
      callback(err);
    });
  }
}

function testBackupAndRestore(useApi, srcDb, targetDb, callback) {
  // Allow a 64 MB highWaterMark for the passthrough during testing
  const passthrough = new stream.PassThrough({highWaterMark: 67108864});
  testBackup(useApi, srcDb, passthrough, function(err) {
    if (err) {
      callback(err);
    }
  });
  testRestore(useApi, passthrough, targetDb, function(err) {
    if (err) {
      callback(err);
    } else {
      dbCompare(srcDb, dbName, callback);
    }
  });
}

function dbCompare(db1Name, db2Name, callback) {
  const comparison = spawn(`./${process.env.DBCOMPARE_NAME}-${process.env.DBCOMPARE_VERSION}/bin/${process.env.DBCOMPARE_NAME}`,
    [process.env.COUCH_URL, db1Name, process.env.COUCH_URL, db2Name], {'stdio': 'inherit'});
  comparison.on('exit', function(code) {
    try {
      assert.equal(code, 0, 'The database comparison should succeed.');
      callback();
    } catch (err) {
      callback(err);
    }
  });
  comparison.on('error', function(err) {
    callback(err);
  });
}

function sortByIdThenRev(o1, o2) {
  if (o1._id < o2._id) return -1;
  if (o1._id > o2._id) return 1;
  if (o1._rev < o2._rev) return -1;
  if (o1._rev > o2._rev) return 1;
  return 0;
}
