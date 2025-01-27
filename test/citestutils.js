// Copyright © 2017, 2025 IBM Corp. All rights reserved.
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

const assert = require('node:assert');
const { once } = require('node:events');
const { createReadStream, createWriteStream, readSync, watch } = require('node:fs');
const { open } = require('node:fs/promises');
const { basename, dirname } = require('node:path');
const { PassThrough } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { createGzip, createGunzip } = require('node:zlib');
const debug = require('debug');
const { Tail } = require('tail');
const app = require('../app.js');
const dbUrl = require('../includes/cliutils.js').databaseUrl;
const compare = require('./compare.js');
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
async function testBackup(params, databaseName, outputStream) {
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
      // Watch the directory where we expect the log file.
      // Once the log file appears set up the tail.
      // Use an AbortController to shutdown the directory watch as soon as we've triggered.
      const ac = new AbortController();
      watch(dirname(params.opts.log), { persistent: false, signal: ac.signal },
        (eventType, filename) => {
          if (eventType === 'rename' && basename(params.opts.log) === filename) {
            // Use tail to watch the log file for a batch to be completed then abort the backup
            tail = new Tail(params.opts.log, { follow: false });
            tail.on('line', (data) => {
              const matches = data.match(/:d batch\d+/);
              if (matches !== null) {
                // Turn off the tail.
                tail.unwatch();
                // Abort the backup
                backup.childProcess.kill();
              }
            });
            // Stop the original directory watcher
            ac.abort();
          }
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
      return Promise.reject(new Error('Not implemented: cannot test encrypted API backups at this time.'));
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
    promises.push(pipeline(pipelineStreams));
  }

  if (params.expectedBackupError || params.abort) {
    // Expected errors assert the backupPromise [rejection]
    return backupPromise
      .then(() => {
        if (params.expectedBackupError) {
          return Promise.reject(new Error('Backup passed when it should have failed.'));
        }
      })
      .catch((err) => {
        testLogger(`Backup promise rejected with ${err}.`);
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
      });
  } else {
    // Success case expect everything to be clean
    return Promise.all(promises)
      .then(() => {
        testLogger('All backup promises resolved.');
        return backupPromise;
      })
      .then(summary => testLogger(`Backup promise resolved with ${summary}.`));
  }
}

async function testRestore(params, inputStream, databaseName) {
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
        testLogger(`API restore will reject by throwing error event ${JSON.stringify(err)}`);
        return Promise.reject(err);
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
      return Promise.reject(new Error('Not implemented: cannot test encrypted API backups at this time.'));
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

  if (params.expectedRestoreError) {
    // Expected errors, assert the restorePromise [rejection]
    return restorePromise
      .then(() => {
        if (params.expectedBackupError) {
          return Promise.reject(new Error('Restore passed when it should have failed.'));
        }
      })
      .catch((err) => {
        testLogger(`Restore promise rejected with ${err}.`);
        if (params.useApi) {
          assert.strictEqual(err.name, params.expectedRestoreError.name, 'The restore should receive the expected error.');
        } else {
          assert.strictEqual(err.code, params.expectedRestoreError.code, `The restore exited with unexpected code ${err.code} and signal ${err.signal}.`);
        }
      });
  } else {
    // Success case expect everything to be clean
    return Promise.all(promises)
      .then(() => {
        testLogger('All restore promises resolved.');
        return restorePromise;
      })
      .then(summary => testLogger(`Restore promise resolved with ${summary}.`));
  }
}

// Serial backup and restore via a file on disk
async function testBackupAndRestoreViaFile(params, srcDb, backupFile, targetDb) {
  return testBackupToFile(params, srcDb, backupFile).then(() => {
    return testRestoreFromFile(params, backupFile, targetDb);
  });
}

async function testBackupToFile(params, srcDb, backupFile) {
  // Open the file for appending if this is a resume
  const output = createWriteStream(backupFile, { flags: (params.opts && params.opts.resume) ? 'a' : 'w' });
  return once(output, 'open')
    .then(() => {
      return testBackup(params, srcDb, output);
    });
}

async function testRestoreFromFile(params, backupFile, targetDb) {
  const input = createReadStream(backupFile);
  return once(input, 'open')
    .then(() => {
      return testRestore(params, input, targetDb);
    });
}

async function testDirectBackupAndRestore(params, srcDb, targetDb) {
  // Allow a 64 MB highWaterMark for the passthrough during testing
  const passthrough = new PassThrough({ highWaterMark: 67108864 });
  const backup = testBackup(params, srcDb, passthrough);
  const restore = testRestore(params, passthrough, targetDb);
  return Promise.all([backup, restore]).then(() => {
    return dbCompare(srcDb, targetDb);
  });
}

async function testBackupAbortResumeRestore(params, srcDb, backupFile, targetDb) {
  return Promise.resolve()
    .then(() => {
      // First backup with an abort
      if (params.opts && params.opts.output) {
        return testBackup(params, srcDb, new PassThrough());
      } else {
        return testBackupToFile(params, srcDb, backupFile);
      }
    }).then(() => {
      // Remove the abort parameter and add the resume parameter
      delete params.abort;
      params.opts.resume = true;
      // Resume the backup
      if (params.opts && params.opts.output) {
        return testBackup(params, srcDb, new PassThrough());
      } else {
        return testBackupToFile(params, srcDb, backupFile);
      }
    }).then(() => {
      // Restore the backup
      return testRestoreFromFile(params, backupFile, targetDb);
    }).then(() => {
      // Now compare the restored to the original for validation
      return dbCompare(srcDb, targetDb);
    });
}

async function dbCompare(db1Name, db2Name) {
  return compare.compare(db1Name, db2Name)
    .then(result => {
      return assert.strictEqual(result, true, 'The database comparison should succeed, but failed');
    });
}

function sortByIdThenRev(o1, o2) {
  if (o1._id < o2._id) return -1;
  if (o1._id > o2._id) return 1;
  if (o1._rev < o2._rev) return -1;
  if (o1._rev > o2._rev) return 1;
  return 0;
}

async function backupFileCompare(actualContentPath, expectedContentPath) {
  let actualFile;
  let expectedFile;
  try {
    actualFile = await open(actualContentPath, 'r');
    expectedFile = await open(expectedContentPath, 'r');
    // We only do this comparison with small files, so putting everything in memory is OK
    const actualLines = [];
    for await (const actualLine of actualFile.readLines({ encoding: 'utf-8' })) {
      actualLines.push(actualLine);
    }
    for await (const expectedLine of expectedFile.readLines({ encoding: 'utf-8' })) {
      const actualLine = actualLines.shift();
      // Check we have an actual line to compare
      assert.ok(actualLine, 'The actual backup had fewer lines than expected.');
      readSortAndDeepEqual(actualLine, expectedLine);
    }
    // Check we compared all the actual lines
    assert.ok(actualLines.length === 0, 'The actual backup had more lines than expected.');
  } finally {
    await actualFile?.close();
    await expectedFile?.close();
  }
}

function readSortAndDeepEqual(actutalJsonToParse, expectedJsonToParse) {
  const backupContent = JSON.parse(actutalJsonToParse);
  const expectedContent = JSON.parse(expectedJsonToParse);
  if (Array.isArray(backupContent) && Array.isArray(expectedContent)) {
    // Array order of the docs is important for equality, but not for backup
    backupContent.sort(sortByIdThenRev);
    expectedContent.sort(sortByIdThenRev);
  } else {
    // File metadata
    if (backupContent.version && expectedContent.version) {
      delete backupContent.version;
      delete expectedContent.version;
    }
  }
  // Assert that the backup matches the expected
  assert.deepStrictEqual(backupContent, expectedContent);
}

function setTimeout(context, timeout) {
  // Increase timeout using TEST_TIMEOUT_MULTIPLIER
  const multiplier = (typeof process.env.TEST_TIMEOUT_MULTIPLIER !== 'undefined') ? parseInt(process.env.TEST_TIMEOUT_MULTIPLIER) : 1;
  timeout *= multiplier;
  // Set the mocha timeout
  context.timeout(timeout * 1000);
}

async function assertGzipFile(path) {
  // 1f 8b is the gzip magic number
  const expectedBytes = Buffer.from([0x1f, 0x8b]);
  const buffer = Buffer.alloc(2);
  let fileHandle;
  try {
    fileHandle = await open(path, 'r');
    // Read the first two bytes
    readSync(fileHandle.fd, buffer, 0, 2, 0);
    // Assert the magic number corresponds to gz extension
    assert.deepStrictEqual(buffer, expectedBytes, 'The backup file should be gz compressed.');
  } finally {
    await fileHandle?.close();
  }
}

async function assertEncryptedFile(path) {
  // Openssl encrypted files start with Salted
  // base64 encoded is U2FsdGVk
  const expectedBytes = Buffer.from('U2FsdGVk');
  const buffer = Buffer.alloc(8);
  let fileHandle;
  try {
    fileHandle = await open(path, 'r');
    // Read the first eight bytes
    readSync(fileHandle.fd, buffer, 0, 8, 0);
    // Assert first 8 characters of the file are "U2FsdGVk"
    assert.deepStrictEqual(buffer, expectedBytes, 'The backup file should be encrypted.');
  } finally {
    await fileHandle?.close();
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
  backupFileCompare,
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
