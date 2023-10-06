// Copyright © 2017, 2023 IBM Corp. All rights reserved.
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

const assert = require('node:assert');
const { once } = require('node:events');
const fs = require('node:fs');
const { PassThrough } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createGzip, createGunzip } = require('node:zlib');
const debug = require('debug');
const { Tail } = require('tail');
const app = require('../app.js');
const dbUrl = require('../includes/cliutils.js').databaseUrl;
const compare = require('./compare.js');
const request = require('../includes/request.js');
const { cliBackup, cliDecrypt, cliEncrypt, cliGzip, cliGunzip, cliRestore } = require('./test_process.js');
const testLogger = debug('couchbackup:test:utils');

function scenario(test, params) {
  return `${test} ${(params.useApi) ? 'using API' : 'using CLI'}`;
}

function params() {
  const p = {};
  for (let i = 0; i < arguments.length; i++) {
    Object.assign(p, arguments[i]);
  }
  return p;
}

// Returns the event emitter for API calls, or the child process for CLI calls
function testBackup(params, databaseName, outputStream, callback) {
  const pipelineStreams = [];
  const promises = [];

  // Configure API key if needed
  augmentParamsWithApiKey(params);

  let backup;
  let backupStream;
  let backupPromise;
  let tail;
  if (params.useApi) {
    if (params.useStdOut) {
      backupStream = outputStream;
    } else {
      backupStream = new PassThrough();
    }
    const backupCallbackPromise = new Promise((resolve, reject) => {
      backup = app.backup(
        dbUrl(process.env.COUCH_URL, databaseName),
        backupStream,
        params.opts,
        (err, data) => {
          if (err) {
            testLogger(`API backup callback with ${JSON.stringify(err)}, will reject.`);
            reject(err);
          } else {
            testLogger(`API backup callback with ${JSON.stringify(data)}, will resolve.`);
            resolve(data);
          }
        });
    });
    const backupFinshedPromise = once(backup, 'finished')
      .then((summary) => {
        testLogger(`Resolving API backup event promise with ${JSON.stringify(summary)}`);
        if (params.resume) {
          assertWrittenFewerThan(summary.total, params.exclusiveMaxExpected);
        }
      })
      .catch((err) => {
        testLogger(`Rejecting API backup event promise with error ${JSON.stringify(err)}`);
        throw err;
      });
    backupPromise = Promise.all([backupCallbackPromise, backupFinshedPromise])
      .then(() => {
        testLogger('Both API backup promises resolved.');
      });
  } else {
    backup = cliBackup(databaseName, params);
    backupStream = backup.stream;
    backupPromise = backup.childProcessPromise;
    if (params.abort) {
      // Create the log file for abort tests so we can tail it, other tests assert
      // the log file is usually created normally by the backup process.
      const f = fs.openSync(params.opts.log, 'w');
      fs.closeSync(f);

      // Use tail to watch the log file for a batch to be completed then abort
      tail = new Tail(params.opts.log, { useWatchFile: true, fsWatchOptions: { interval: 500 }, follow: false });
      tail.on('line', function(data) {
        const matches = data.match(/:d batch\d+/);
        if (matches !== null) {
          // Turn off the tail.
          tail.unwatch();
          // Abort the backup
          backup.childProcess.kill();
        }
      });
      tail.on('error', function(err) {
        callback(err);
      });
    }
    if (params.resume) {
      const listenerPromise = new Promise((resolve, reject) => {
        const listener = function(data) {
          const matches = data.toString().match(/.*Finished - Total document revisions written: (\d+).*/);
          if (matches !== null) {
            try {
              assertWrittenFewerThan(matches[1], params.exclusiveMaxExpected);
              resolve();
            } catch (err) {
              reject(err);
            }
            process.stderr.removeListener('data', listener);
          }
        };
        backup.childProcess.stderr.on('data', listener);
      });
      promises.push(listenerPromise);
    }
  }
  promises.push(backupPromise);
  if (!params.useStdOut) {
    pipelineStreams.push(backupStream);
  }

  if (params.compression) {
    if (params.useApi) {
      pipelineStreams.push(createGzip());
    } else {
      const gzipProcess = cliGzip();
      pipelineStreams.push(gzipProcess.stream);
      promises.push(gzipProcess.childProcessPromise);
    }
  }

  // Pipe via encryption if requested
  if (params.encryption) {
    if (params.useApi) {
      // Currently only CLI support for testing encryption
      callback(new Error('Not implemented: cannot test encrypted API backups at this time.'));
    } else {
      const encryptProcess = cliEncrypt();
      pipelineStreams.push(encryptProcess.stream);
      promises.push(encryptProcess.childProcessPromise);
    }
  }

  if (!params.useStdOut) {
    // Finally add the outputStream to the list we want to pipeline
    pipelineStreams.push(outputStream);

    // Create the promisified pipeline and add it to the array of promises we'll wait for
    promises.unshift(pipeline(pipelineStreams));
  }

  // Wait for the promises and then assert
  return Promise.all(promises)
    .then(() => testLogger('All backup promises resolved.'))
    .then(() => {
      if (params.expectedBackupError) {
        throw new Error('Backup passed when it should have failed.');
      }
    })
    .catch((err) => {
      if (params.expectedBackupError || params.abort) {
        if (params.useApi) {
          assert.strictEqual(err.name, params.expectedBackupError.name, 'The backup should receive the expected error.');
        } else {
          if (params.abort) {
            // The tail should be stopped when we match a line and abort, but if
            // something didn't work we need to make sure the tail is stopped
            tail.unwatch();
            // Assert that the process was aborted as expected
            assert.strictEqual(err.signal, 'SIGTERM', `The backup should have terminated with SIGTERM, but was ${err.signal}.`);
          } else if (params.expectedBackupError) {
            assert.strictEqual(err.code, params.expectedBackupError.code, `The backup exited with unexpected code ${err.code} and signal ${err.signal}.`);
          }
        }
      } else {
        throw err;
      }
    }).then(() => {
      if (callback) callback();
    })
    .catch((err) => {
      if (callback) callback(err);
    });
}

function testRestore(params, inputStream, databaseName, callback) {
  const pipelineStreams = [inputStream];
  const promises = [];

  // Configure API key if needed
  augmentParamsWithApiKey(params);

  let restore;
  let restoreStream;
  let restorePromise;

  if (params.useApi) {
    restoreStream = new PassThrough();
    const restoreCallbackPromise = new Promise((resolve, reject) => {
      restore = app.restore(
        restoreStream,
        dbUrl(process.env.COUCH_URL, databaseName),
        params.opts,
        (err, data) => {
          if (err) {
            testLogger(`API restore callback with ${err}, will reject.`);
            reject(err);
          } else {
            resolve(data);
          }
        });
    });
    const restoreFinshedPromise = once(restore, 'finished')
      .then((summary) => {
        testLogger(`Resolving API restore promise with ${summary}`);
      })
      .catch((err) => {
        testLogger(`Handling API restore error event ${JSON.stringify(err)}`);
        if (params.expectedRestoreErrorRecoverable) {
          testLogger(`Expecting restore error ${params.expectedRestoreErrorRecoverable.name}`);
          assert.strictEqual(err.name, params.expectedRestoreErrorRecoverable.name, 'The restore should receive the expected recoverable error.');
        } else {
          testLogger(`API restore will reject by throwing error event ${JSON.stringify(err)}`);
          throw err;
        }
      });
    restorePromise = Promise.all([restoreCallbackPromise, restoreFinshedPromise]);
  } else {
    restore = cliRestore(databaseName, params);
    restoreStream = restore.stream;
    restorePromise = restore.childProcessPromise;
  }
  promises.push(restorePromise);

  // Pipe via decompression if requested
  if (params.compression) {
    if (params.useApi) {
      pipelineStreams.push(createGunzip());
    } else {
      const gunzipProcess = cliGunzip();
      pipelineStreams.push(gunzipProcess.stream);
      promises.push(gunzipProcess.childProcessPromise);
    }
  }

  // Pipe via decryption if requested
  if (params.encryption) {
    if (params.useApi) {
      // Currently only CLI support for testing encryption
      callback(new Error('Not implemented: cannot test encrypted API backups at this time.'));
    } else {
      const decryptProcess = cliDecrypt();
      pipelineStreams.push(decryptProcess.stream);
      promises.push(decryptProcess.childProcessPromise);
    }
  }

  // pipeline everything into the restoreStream
  pipelineStreams.push(restoreStream);

  // Create the promisified pipeline and add it to the array of promises we'll wait for
  promises.unshift(pipeline(pipelineStreams));

  // Wait for the all the promises to settle and then assert based on the process promise
  return Promise.allSettled(promises)
    .then(() => { return restorePromise; })
    .then((summary) => {
      testLogger(`Restore promise resolved with ${summary}.`);
      if (params.expectedRestoreError) {
        throw new Error('Restore passed when it should have failed.');
      }
    })
    .catch((err) => {
      testLogger(`Restore promise rejected with ${err}.`);
      if (params.expectedRestoreError) {
        if (params.useApi) {
          assert.strictEqual(err.name, params.expectedRestoreError.name, 'The restore should receive the expected error.');
        } else {
          assert.strictEqual(err.code, params.expectedRestoreError.code, `The restore exited with unexpected code ${err.code} and signal ${err.signal}.`);
        }
      } else {
        throw err;
      }
    })
    .then(() => { callback(); })
    .catch((err) => {
      callback(err);
    });
}

// Serial backup and restore via a file on disk
function testBackupAndRestoreViaFile(params, srcDb, backupFile, targetDb, callback) {
  testBackupToFile(params, srcDb, backupFile, function(err) {
    if (err) {
      callback(err);
    } else {
      testRestoreFromFile(params, backupFile, targetDb, function(err) {
        if (!err) {
          dbCompare(srcDb, targetDb, callback);
        } else {
          callback(err);
        }
      });
    }
  });
}

function testBackupToFile(params, srcDb, backupFile, callback) {
  // Open the file for appending if this is a resume
  const output = fs.createWriteStream(backupFile, { flags: (params.opts && params.opts.resume) ? 'a' : 'w' });
  output.on('open', function() {
    testBackup(params, srcDb, output, function(err) {
      if (err) {
        callback(err);
      } else {
        callback();
      }
    });
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
  const passthrough = new PassThrough({ highWaterMark: 67108864 });
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
      testBackup(params, srcDb, new PassThrough(), function(err) {
        if (err) {
          callback(err);
        } else {
          restore();
        }
      });
    } else {
      testBackupToFile(params, srcDb, backupFile, function(err) {
        if (err) {
          callback(err);
        } else {
          restore();
        }
      });
    }
  };

  if (params.opts && params.opts.output) {
    testBackup(params, srcDb, new PassThrough(), resume);
  } else {
    testBackupToFile(params, srcDb, backupFile, resume);
  }
}

function dbCompare(db1Name, db2Name, callback) {
  const client = request.client(process.env.COUCH_BACKEND_URL, {});
  compare.compare(db1Name, db2Name, client.service)
    .then(result => {
      try {
        assert.strictEqual(result, true, 'The database comparison should succeed, but failed');
        callback();
      } catch (err) {
        callback(err);
      }
    })
    .catch(err => callback(err));
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
    assert.deepStrictEqual(backupContent, expectedContent);
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
    assert.deepStrictEqual(buffer, expectedBytes, 'The backup file should be gz compressed.');
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
    assert.deepStrictEqual(buffer, expectedBytes, 'The backup file should be encrypted.');
    callback();
  } catch (err) {
    callback(err);
  }
}

function assertWrittenFewerThan(total, number) {
  assert(total < number && total > 0, `Saw ${total} but expected between 1 and ${number - 1} documents for the resumed backup.`);
}

function augmentParamsWithApiKey(params) {
  if (process.env.COUCHBACKUP_TEST_IAM_API_KEY) {
    if (!params.opts) {
      params.opts = {};
    }
    params.opts.iamApiKey = process.env.COUCHBACKUP_TEST_IAM_API_KEY;
    params.opts.iamTokenUrl = process.env.CLOUDANT_IAM_TOKEN_URL;
  }
}

module.exports = {
  scenario,
  p: params,
  setTimeout,
  dbCompare,
  readSortAndDeepEqual,
  assertGzipFile,
  assertEncryptedFile,
  testBackup,
  testRestore,
  testDirectBackupAndRestore,
  testBackupToFile,
  testRestoreFromFile,
  testBackupAndRestoreViaFile,
  testBackupAbortResumeRestore
};
