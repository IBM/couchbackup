/* global beforeEach afterEach */
'use strict';

const assert = require('assert');
const spawn = require('child_process').spawn;
const cloudant = require('cloudant')({url: process.env.COUCH_URL});
const app = require('../app.js');
const dbUrl = require('../includes/cliutils.js').databaseUrl;
const stream = require('stream');
const uuid = require('uuid/v4');
const fs = require('fs');
const zlib = require('zlib');

beforeEach('Create test database', function(done) {
  // Allow 10 seconds to create the DB
  this.timeout(10 * 1000);
  const unique = uuid();
  this.fileName = `${unique}`;
  this.dbName = 'couchbackup_test_' + unique;
  cloudant.db.create(this.dbName, function(err) {
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
  fs.unlink(this.fileName, function(err) {
    if (err) {
      if (err.code !== 'ENOENT') {
        console.error(`${err.code} ${err.message}`);
      }
    }
  });
  cloudant.db.destroy(this.dbName, function(err) {
    if (err) {
      done(err);
    } else {
      done();
    }
  });
});

function scenario(test, params) {
  return `${test} ${(params.useApi) ? 'using API' : 'using CLI'}`;
}

function params(params, o) {
  return Object.assign({}, params, o);
}

function testBackup(params, databaseName, outputStream, callback) {
  var backupStream = outputStream;

  // Pipe via compression if requested
  if (params.compression) {
    if (params.useApi) {
      // If use API use the Node zlib stream
      const zlib = require('zlib');
      backupStream = zlib.createGzip();
      backupStream.pipe(outputStream);
    } else {
      // Spawn process for gzip
      const gzip = spawn('gzip', [], {'stdio': ['pipe', 'pipe', 'inherit']});
      // Pipe the streams as needed
      gzip.stdout.pipe(outputStream);
      backupStream = gzip.stdin;
    }
  }

  if (params.useApi) {
    app.backup(dbUrl(process.env.COUCH_URL, databaseName), backupStream, params.opts, function(err, data) {
      if (err) {
        callback(err);
      } else {
        console.log(data);
        callback();
      }
    });
  } else {
    // Set up default args
    const args = ['../bin/couchbackup.bin.js', '--db', databaseName];
    if (params.opts && params.opts.mode) {
      args.push('--mode');
      args.push(params.opts.mode);
    }

    // Note use spawn not fork for stdio options not supported with fork in Node 4.x
    const backup = spawn('node', args, {'stdio': ['ignore', 'pipe', 'inherit']});
    // Pipe the stdout to the supplied outputStream
    backup.stdout.pipe(backupStream);
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

function testRestore(params, inputStream, databaseName, callback) {
  var restoreStream = inputStream;

  // Pipe via decompression if requested
  if (params.compression) {
    if (params.useApi) {
      // If use API use the Node zlib stream
      restoreStream = zlib.createGunzip();
      inputStream.pipe(restoreStream);
    } else {
      // Spawn process for gunzip
      const gunzip = spawn('gunzip', [], {'stdio': ['pipe', 'pipe', 'inherit']});
      // Pipe the streams as needed
      inputStream.pipe(gunzip.stdin);
      restoreStream = gunzip.stdout;
    }
  }

  if (params.useApi) {
    app.restore(restoreStream, dbUrl(process.env.COUCH_URL, databaseName), null, function(err, data) {
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
    restoreStream.pipe(restore.stdin);
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

// Serial backup and restore via a file on disk
function testBackupAndRestoreViaFile(params, srcDb, backupFile, targetDb, callback) {
  const output = fs.createWriteStream(backupFile);
  output.on('open', function() {
    testBackup(params, srcDb, output, function(err) {
      if (err) {
        callback(err);
      } else {
        const input = fs.createReadStream(backupFile);
        input.on('open', function() {
          testRestore(params, input, targetDb, function(err) {
            if (err) {
              callback(err);
            } else {
              dbCompare(srcDb, targetDb, callback);
            }
          });
        });
      }
    });
  });
}

function testDirectBackupAndRestore(params, srcDb, targetDb, callback) {
  // Allow a 64 MB highWaterMark for the passthrough during testing
  const passthrough = new stream.PassThrough({highWaterMark: 67108864});
  testBackupAndRestore(params, srcDb, passthrough, passthrough, targetDb, callback);
}

function testBackupAndRestore(params, srcDb, backupStream, restoreStream, targetDb, callback) {
  testBackup(params, srcDb, backupStream, function(err) {
    if (err) {
      callback(err);
    }
  });
  testRestore(params, restoreStream, targetDb, function(err) {
    if (err) {
      callback(err);
    } else {
      dbCompare(srcDb, targetDb, callback);
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

function readSortAndDeepEqual(actualContentPath, expectedContentPath, callback) {
  const backupContent = JSON.parse(fs.readFileSync(actualContentPath, 'utf8'));
  const expectedContent = JSON.parse(fs.readFileSync(expectedContentPath, 'utf8'));
  // Array order of the docs is important for equality, but not for backup
  backupContent.sort(sortByIdThenRev);
  expectedContent.sort(sortByIdThenRev);
  // Assert that the backup matches the expected
  try {
    assert.deepEqual(backupContent, expectedContent);
    callback();
  } catch (err) {
    callback(err);
  }
}

function timeoutFilter(context, timeout) {
  // Default to a limit of 1 minute for tests
  const limit = (typeof process.env.TEST_LIMIT !== 'undefined') ? parseInt(process.env.TEST_LIMIT) : 60;
  timeout = (!timeout) ? 60 : timeout;
  if (timeout <= limit) {
    // Set the mocha timeout
    context.timeout(timeout * 1000);
  } else {
    // Skip the test if it is expected to run for longer than the limit
    context.skip();
  }
}

function assertGzipFile(path, callback) {
  try {
    // 1f 8b is the gzip magic number
    const expectedBytes = Buffer.from([0x1f, 0x8b]);
    const buffer = Buffer.alloc(2);
    const fd = fs.openSync(path, 'r');
    // Read the first two bytes
    fs.readSync(fd, buffer, 0, 2, 0);
    fs.closeSync(fd);
    // Assert the magic number corresponds to gz extension
    assert.deepEqual(buffer, expectedBytes, 'The backup file should be gz compressed.');
    callback();
  } catch (err) {
    callback(err);
  }
}

module.exports = {
  scenario: scenario,
  p: params,
  timeoutFilter: timeoutFilter,
  dbCompare: dbCompare,
  readSortAndDeepEqual: readSortAndDeepEqual,
  assertGzipFile: assertGzipFile,
  testBackup: testBackup,
  testRestore: testRestore,
  testBackupAndRestore: testBackupAndRestore,
  testDirectBackupAndRestore: testDirectBackupAndRestore,
  testBackupAndRestoreViaFile: testBackupAndRestoreViaFile
};
