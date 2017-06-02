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
const Tail = require('tail').Tail;

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
  teardown(this.fileName, this.dbName, done);
});

function deleteIfExists(fileName) {
  fs.unlink(fileName, function(err) {
    if (err) {
      if (err.code !== 'ENOENT') {
        console.error(`${err.code} ${err.message}`);
      }
    }
  });
}

function teardown(fileName, dbName, callback) {
  deleteIfExists(fileName);
  deleteIfExists(`${fileName}.log`);
  cloudant.db.destroy(dbName, function(err) {
    if (err) {
      callback(err);
    } else {
      callback();
    }
  });
}

function scenario(test, params) {
  return `${test} ${(params.useApi) ? 'using API' : 'using CLI'}`;
}

function params() {
  const p = {};
  for (var i = 0; i < arguments.length; i++) {
    Object.assign(p, arguments[i]);
  }
  return p;
}

// Returns the event emitter for API calls, or the child process for CLI calls
function testBackup(params, databaseName, outputStream, callback) {
  var gzip;
  var backup;
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
      gzip = spawn('gzip', [], {'stdio': ['pipe', 'pipe', 'inherit']});
      // Pipe the streams as needed
      gzip.stdout.pipe(outputStream);
      backupStream = gzip.stdin;
      // register an error handler
      gzip.on('error', function(err) {
        callback(err);
      });
    }
  }

  if (params.abort) {
    // Create the log file for abort tests so we can tail it, other tests assert
    // the log file is usually created normally by the backup process.
    const f = fs.openSync(params.opts.log, 'w');
    fs.closeSync(f);
  }

  if (params.useApi) {
    backup = app.backup(dbUrl(process.env.COUCH_URL, databaseName), backupStream, params.opts, function(err, data) {
      if (err) {
        callback(err);
      } else {
        console.log(data);
        callback();
      }
    });
  } else {
    // Default to pipe, but will use 'inherit' if using --output (see params.opts.output)
    var destination = 'pipe';

    // Set up default args
    const args = ['../bin/couchbackup.bin.js', '--db', databaseName];
    if (params.opts) {
      if (params.opts.mode) {
        args.push('--mode');
        args.push(params.opts.mode);
      }
      if (params.opts.output) {
        args.push('--output');
        args.push(params.opts.output);
        destination = 'inherit';
      }
      if (params.opts.log) {
        args.push('--log');
        args.push(params.opts.log);
      }
      if (params.opts.resume) {
        args.push('--resume');
        args.push(params.opts.resume);
      }
      if (params.opts.bufferSize) {
        args.push('--buffer-size');
        args.push(params.opts.bufferSize);
      }
    }

    // Note use spawn not fork for stdio options not supported with fork in Node 4.x
    backup = spawn('node', args, {'stdio': ['ignore', destination, 'pipe']});
    // Pipe the stdout to the supplied outputStream
    if (destination === 'pipe') {
      backup.stdout.pipe(backupStream);
    }
    // Forward the spawned process stderr (we don't use inherit because we want
    // to access this stream directly as well)
    backup.stderr.on('data', function(data) {
      console.error(`${data}`);
    });

    backup.on('exit', function(code, signal) {
      try {
        if (params.abort) {
          // Assert that the process was aborted as expected
          assert.equal(signal, 'SIGTERM', `The backup should terminate.`);
        } else {
          assert.equal(code, 0, `The backup should exit normally, got exit code ${code}.`);
        }
      } catch (err) {
        callback(err);
      }
    });
    backup.on('error', function(err) {
      callback(err);
    });
    // Call done when the last child process exits - could be gzip or backup
    if (gzip) {
      gzip.on('exit', function(code) {
        callback();
      });
    } else {
      backup.on('exit', function(code) {
        callback();
      });
    }
  }
  if (params.abort) {
    // Use tail to watch the log file for a batch to be completed then abort
    const tail = new Tail(params.opts.log);
    tail.on('line', function(data) {
      let matches = data.match(/:d batch\d+/);
      if (matches !== null) {
        // Turn off the tail.
        tail.unwatch();
        // Abort the backup
        backupAbort(params.useApi, backup);
      }
    });
    tail.on('error', function(err) {
      callback(err);
    });
  }
  return backup;
}

function backupAbort(usingApi, backup) {
  setImmediate(function() {
    if (usingApi) {
      // Currently no way to abort an API backup
      console.error('UNSUPPORTED: cannot abort API backups at this time.');
    } else {
      backup.kill();
    }
  });
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
        assert.equal(code, 0, `The restore should exit normally, got exit code ${code}`);
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
  testBackupToFile(params, srcDb, backupFile, function(err) {
    if (err) {
      callback(err);
    } else {
      testRestoreFromFile(params, backupFile, targetDb, function(err) {
        dbCompare(srcDb, targetDb, callback);
      });
    }
  });
}

function testBackupToFile(params, srcDb, backupFile, callback, processCallback) {
  // Open the file for appending if this is a resume
  const output = fs.createWriteStream(backupFile, {flags: (params.opts && params.opts.resume) ? 'a' : 'w'});
  output.on('open', function() {
    const backupProcess = testBackup(params, srcDb, output, function(err) {
      if (err) {
        callback(err);
      } else {
        callback();
      }
    });
    if (processCallback) {
      processCallback(backupProcess);
    }
  });
}

function testRestoreFromFile(params, backupFile, targetDb, callback) {
  const input = fs.createReadStream(backupFile);
  input.on('open', function() {
    testRestore(params, input, targetDb, function(err) {
      if (err) {
        callback(err);
      } else {
        callback();
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

function assertResumedBackup(params, resumedBackup, restoreCallback) {
  // Validate that the resume backup didn't need to write all the docs
  if (params.useApi) {
    resumedBackup.once('finished', function(summary) {
      assertWrittenFewerThan(summary.total, params.exclusiveMaxExpected, restoreCallback);
    });
  } else {
    // For the CLI case we need to see the output because we don't have
    // the finished event.
    const listener = function(data) {
      let matches = data.toString().match(/.*finished { total: (\d+) }.*/);
      if (matches !== null) {
        assertWrittenFewerThan(matches[1], params.exclusiveMaxExpected, restoreCallback);
        resumedBackup.stderr.removeListener('data', listener);
      }
    };
    resumedBackup.stderr.on('data', listener);
  }
}

function testBackupAbortResumeRestore(params, srcDb, backupFile, targetDb, callback) {
  const restore = function(err) {
    if (err) {
      callback(err);
    } else {
      testRestoreFromFile(params, backupFile, targetDb, function(err) {
        if (err) {
          callback(err);
        } else {
          dbCompare(srcDb, targetDb, callback);
        }
      });
    }
  };

  const resume = function(err) {
    if (err) {
      callback(err);
    }
    // Remove the abort parameter and add the resume parameter
    delete params.abort;
    params.opts.resume = true;

    // Resume backup and restore to validate it was successful.
    if (params.opts && params.opts.output) {
      const resumedBackup = testBackup(params, srcDb, null, function(err) {
        if (err) {
          callback(err);
        }
      });
      assertResumedBackup(params, resumedBackup, restore);
    } else {
      testBackupToFile(params, srcDb, backupFile, function(err) {
        if (err) {
          callback(err);
        }
      },
      function(backupProcess) {
        assertResumedBackup(params, backupProcess, restore);
      });
    }
  };

  if (params.opts && params.opts.output) {
    testBackup(params, srcDb, null, resume);
  } else {
    testBackupToFile(params, srcDb, backupFile, resume);
  }
}

function dbCompare(db1Name, db2Name, callback) {
  const comparison = spawn(`./${process.env.DBCOMPARE_NAME}-${process.env.DBCOMPARE_VERSION}/bin/${process.env.DBCOMPARE_NAME}`,
    [process.env.COUCH_URL_COMPARE, db1Name, process.env.COUCH_URL_COMPARE, db2Name], {'stdio': 'inherit'});
  comparison.on('exit', function(code) {
    try {
      assert.equal(code, 0, `The database comparison should succeed, got exit code ${code}`);
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
    // Workaround https://github.com/mochajs/mocha/issues/2546 by tearing down
    // since the afterEach will not be called.
    teardown(context.fileName, context.dbName, function(err) {
      if (err) {
        // Log if there was an error deleting
        console.error(err);
      }
    });
    // Now skip the test as it is expected to run for longer than the limit
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

function assertWrittenFewerThan(total, number, callback) {
  try {
    assert(total < number && total > 0, `Saw ${total} but expected between 1 and ${number - 1} documents for the resumed backup.`);
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
  testDirectBackupAndRestore: testDirectBackupAndRestore,
  testBackupToFile: testBackupToFile,
  testRestoreFromFile: testRestoreFromFile,
  testBackupAndRestoreViaFile: testBackupAndRestoreViaFile,
  testBackupAbortResumeRestore: testBackupAbortResumeRestore
};
