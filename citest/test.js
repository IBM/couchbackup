/* global describe it beforeEach afterEach */
'use strict';

const assert = require('assert');
const spawn = require('child_process').spawn;
const fs = require('fs');
const cloudant = require('cloudant')({url: process.env.COUCH_URL});
const uuid = require('uuid/v4');
const app = require('../app.js');
const dbUrl = require('../includes/cliutils.js').databaseUrl;

[{useApi: false}, {useApi: true}].forEach(function(params) {
  describe(`Basic backup and restore ${(params.useApi) ? 'using API' : 'using CLI'}`, function() {
    this.timeout(60 * 1000);
    var dbName;

    beforeEach(function(done) {
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

    afterEach(function(done) {
      cloudant.db.destroy(dbName, function(err) {
        if (err) {
          done(err);
        } else {
          done();
        }
      });
    });

    it('should backup animaldb to a file correctly', function(done) {
      // Create a file and backup to it
      const output = fs.createWriteStream('animaldb_actual.json');
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
          assert.deepEqual(backupContent, expectedContent);
          done();
        }
      });
    });

    it('should restore animaldb to a database correctly', function(done) {
      const input = fs.createReadStream('animaldb_expected.json');
      testRestore(params.useApi, input, dbName, function(err) {
        if (err) {
          done(err);
        } else {
          const comparison = spawn(`./${process.env.DBCOMPARE_NAME}-${process.env.DBCOMPARE_VERSION}/bin/${process.env.DBCOMPARE_NAME}`,
            [process.env.COUCH_URL, 'animaldb', process.env.COUCH_URL, dbName], {'stdio': 'inherit'});
          comparison.on('exit', function(code) {
            assert.equal(code, 0, 'The database comparison should succeed.');
            done();
          });
          comparison.on('error', function(err) {
            done(err);
          });
        }
      });
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
    outputStream.on('open', function() {
      const backup = spawn('node', ['../bin/couchbackup.bin.js', '--db', databaseName], {'stdio': ['ignore', outputStream, 'inherit']});
      backup.on('exit', function(code) {
        assert.equal(code, 0, 'The backup should exit normally.');
        callback();
      });
      backup.on('error', function(err) {
        callback(err);
      });
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
    inputStream.on('open', function() {
      const restore = spawn('node', ['../bin/couchrestore.bin.js', '--db', databaseName], {'stdio': ['pipe', 'inherit', 'inherit']});
      inputStream.pipe(restore.stdin);
      restore.on('exit', function(code) {
        assert.equal(code, 0, 'The restore should exit normally.');
        callback();
      });
      restore.on('error', function(err) {
        callback(err);
      });
    });
  }
}

function sortByIdThenRev(o1, o2) {
  if (o1._id < o2._id) return -1;
  if (o1._id > o2._id) return 1;
  if (o1._rev < o2._rev) return -1;
  if (o1._rev > o2._rev) return 1;
  return 0;
}
