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

/* global */
'use strict';

const assert = require('assert');
const spawn = require('child_process').spawn;
const app = require('../app.js');
const dbUrl = require('../includes/cliutils.js').databaseUrl;
const stream = require('stream');
const fs = require('fs');
const zlib = require('zlib');
const Tail = require('tail').Tail;

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
  var openssl;
  var backup;
  var backupStream = outputStream;

  // Configure API key if needed
  augmentParamsWithApiKey(params);

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

  // Pipe via encryption if requested
  if (params.encryption) {
    if (params.useApi) {
      // Currently only CLI support for testing encryption
      callback(new Error('Not implemented: cannot test encrypted API backups at this time.'));
    } else {
      // Spawn process for openssl
      openssl = spawn('openssl', ['aes-128-cbc', '-pass', 'pass:12345'], {'stdio': ['pipe', 'pipe', 'inherit']});
      // Pipe the streams as needed
      openssl.stdout.pipe(outputStream);
      backupStream = openssl.stdin;
      // register an error handler
      openssl.on('error', function(err) {
        callback(err);
      });
    }
  }

  var tail;
  if (params.abort) {
    // Create the log file for abort tests so we can tail it, other tests assert
    // the log file is usually created normally by the backup process.
    const f = fs.openSync(params.opts.log, 'w');
    fs.closeSync(f);

    // Use tail to watch the log file for a batch to be completed then abort
    tail = new Tail(params.opts.log, {useWatchFile: true, fsWatchOptions: {interval: 500}, follow: false});
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

  if (params.useApi) {
    backup = app.backup(dbUrl(process.env.COUCH_URL, databaseName), backupStream, params.opts, function(err, data) {
      if (err) {
        if (params.expectedBackupError) {
          try {
            assert.equal(err.name, params.expectedBackupError.name, `The backup should receive the expected error.`);
            callback();
          } catch (err) {
            callback(err);
          }
        } else {
          callback(err);
        }
      } else {
        console.log(data);
        callback();
      }
    });
    backup.on('error', function(err) {
      console.error(`Caught non-fatal error: ${err}`);
    });
  } else {
    // Default to pipe, but will use 'inherit' if using --output (see params.opts.output)
    var destination = 'pipe';

    // Set up default args
    const args = ['./bin/couchbackup.bin.js', '--db', databaseName];
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
      if (params.opts.iamApiKey) {
        args.push('--iam-api-key');
        args.push(params.opts.iamApiKey);
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
    backup.on('error', function(err) {
      callback(err);
    });
    // Call done when the last child process exits - could be gzip or backup
    if (gzip) {
      gzip.on('close', function(code) {
        try {
          assert.equal(code, 0, `The compression should exit normally, got exit code ${code}.`);
          callback();
        } catch (err) {
          callback(err);
        }
      });
    } else if (openssl) {
      openssl.on('close', function(code) {
        try {
          assert.equal(code, 0, `The encryption should exit normally, got exit code ${code}.`);
          callback();
        } catch (err) {
          callback(err);
        }
      });
    } else {
      backup.on('close', function(code, signal) {
        try {
          if (params.abort) {
            // The tail should be stopped when we match a line and abort, but if
            // something didn't work we need to make sure the tail is stopped
            tail.unwatch();
            // Assert that the process was aborted as expected
            assert.equal(signal, 'SIGTERM', `The backup should have terminated with SIGTERM, but was ${signal}.`);
          } else if (params.expectedBackupError) {
            assert.equal(code, params.expectedBackupError.code, `The backup exited with unexpected code ${code}.`);
          } else {
            assert.equal(code, 0, `The backup should exit normally, got exit code ${code}.`);
          }
          callback();
        } catch (err) {
          callback(err);
        }
      });
    }
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

  // Configure API key if needed
  augmentParamsWithApiKey(params);

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

  // Pipe via decryption if requested
  if (params.encryption) {
    if (params.useApi) {
      callback(new Error('Not implemented: cannot test encrypted API backups at this time.'));
    } else {
      // Spawn process for openssl
      const dopenssl = spawn('openssl', ['aes-128-cbc', '-d', '-pass', 'pass:12345'], {'stdio': ['pipe', 'pipe', 'inherit']});
      // Pipe the streams as needed
      inputStream.pipe(dopenssl.stdin);
      restoreStream = dopenssl.stdout;
    }
  }

  if (params.useApi) {
    app.restore(restoreStream, dbUrl(process.env.COUCH_URL, databaseName), params.opts, function(err, data) {
      if (err) {
        if (params.expectedRestoreError) {
          try {
            assert.equal(err.name, params.expectedRestoreError.name, `The restore should receive the expected error.`);
            callback();
          } catch (err) {
            callback(err);
          }
        } else {
          callback(err);
        }
      } else {
        console.log(data);
        callback();
      }
    }).on('error', function(err) {
      console.error(`Caught non-fatal error: ${err}`);
    });
  } else {
    // Set up default args
    const args = ['./bin/couchrestore.bin.js', '--db', databaseName];
    if (params.opts) {
      if (params.opts.bufferSize) {
        args.push('--buffer-size');
        args.push(params.opts.bufferSize);
      }
      if (params.opts.parallelism) {
        args.push('--parallelism');
        args.push(params.opts.parallelism);
      }
      if (params.opts.iamApiKey) {
        args.push('--iam-api-key');
        args.push(params.opts.iamApiKey);
      }
    }

    // Note use spawn not fork for stdio options not supported with fork in Node 4.x
    const restore = spawn('node', args, {'stdio': ['pipe', 'inherit', 'inherit']});
    // Pipe to write the readable inputStream into stdin
    restoreStream.pipe(restore.stdin);
    restore.stdin.on('error', function(err) {
      // Suppress errors that might arise from piping of input streams
      // from the test process to the child process (this appears to be  handled
      // gracefully in the shell)
      console.error(`Test stream error code ${err.code}`);
    });
    restore.on('close', function(code) {
      try {
        if (params.expectedRestoreError) {
          assert.equal(code, params.expectedRestoreError.code, `The backup exited with unexpected code ${code}.`);
        } else {
          assert.equal(code, 0, `The restore should exit normally, got exit code ${code}`);
        }
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
      let matches = data.toString().match(/.*Finished - Total document revisions written: (\d+).*/);
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
    [process.env.COUCH_BACKEND_URL, db1Name, process.env.COUCH_BACKEND_URL, db2Name], {'stdio': 'inherit'});
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

function setTimeout(context, timeout) {
  // Increase timeout using TEST_TIMEOUT_MULTIPLIER
  const multiplier = (typeof process.env.TEST_TIMEOUT_MULTIPLIER !== 'undefined') ? parseInt(process.env.TEST_TIMEOUT_MULTIPLIER) : 1;
  timeout *= multiplier;
  // Set the mocha timeout
  context.timeout(timeout * 1000);
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

function assertEncryptedFile(path, callback) {
  try {
    // Openssl encrypted files start with Salted
    const expectedBytes = Buffer.from('Salted');
    const buffer = Buffer.alloc(6);
    const fd = fs.openSync(path, 'r');
    // Read the first six bytes
    fs.readSync(fd, buffer, 0, 6, 0);
    fs.closeSync(fd);
    // Assert first 6 characters of the file are "Salted"
    assert.deepEqual(buffer, expectedBytes, 'The backup file should be encrypted.');
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

function augmentParamsWithApiKey(params) {
  if (process.env.COUCHBACKUP_TEST_IAM_API_KEY) {
    if (!params.opts) {
      params.opts = {};
    }
    params.opts.iamApiKey = process.env.COUCHBACKUP_TEST_IAM_API_KEY;
  }
}

module.exports = {
  scenario: scenario,
  p: params,
  setTimeout: setTimeout,
  dbCompare: dbCompare,
  readSortAndDeepEqual: readSortAndDeepEqual,
  assertGzipFile: assertGzipFile,
  assertEncryptedFile: assertEncryptedFile,
  testBackup: testBackup,
  testRestore: testRestore,
  testDirectBackupAndRestore: testDirectBackupAndRestore,
  testBackupToFile: testBackupToFile,
  testRestoreFromFile: testRestoreFromFile,
  testBackupAndRestoreViaFile: testBackupAndRestoreViaFile,
  testBackupAbortResumeRestore: testBackupAbortResumeRestore
};
