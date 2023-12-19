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
'use strict';

/**
 * CouchBackup module.
 * @module couchbackup
 * @see module:couchbackup
 */

const backupFull = require('./includes/backup.js');
const backupShallow = require('./includes/shallowbackup.js');
const defaults = require('./includes/config.js').apiDefaults;
const { convertError, BackupError, OptionError } = require('./includes/error.js');
const { newClient } = require('./includes/request.js');
const restoreInternal = require('./includes/restore.js');
const debug = require('debug')('couchbackup:app');
const events = require('events');
const fs = require('fs');
const URL = require('url').URL;

/**
 * Test for a positive, safe integer.
 *
 * @param {any} x - Object under test.
 */
function isSafePositiveInteger(x) {
  // https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
  const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || 9007199254740991;
  return (typeof x === 'number' || typeof x === 'bigint') &&
    // Is it an integer?
    x % 1 === 0 &&
    // Is it positive?
    x > 0 &&
    // Is it less than the maximum safe integer?
    x <= MAX_SAFE_INTEGER;
}

/**
 * Validate URL.
 *
 * @param {string} url - URL of database.
 * @param {boolean} isIAM - A flag if IAM authentication been used.
 * @returns Boolean true if all checks are passing.
 */
async function validateURL(url, isIAM) {
  if (typeof url !== 'string') {
    throw new OptionError('Invalid URL, must be type string');
  }
  // Validate URL and ensure no auth if using key
  try {
    const urlObject = new URL(url);
    // We require a protocol, host and path (for db), fail if any is missing.
    if (urlObject.protocol !== 'https:' && urlObject.protocol !== 'http:') {
      throw new OptionError('Invalid URL protocol.');
    }
    if (!urlObject.pathname || urlObject.pathname === '/') {
      throw new OptionError('Invalid URL, missing path element (no database).');
    }
    if (isIAM && (urlObject.username || urlObject.password)) {
      throw new OptionError('URL user information must not be supplied when using IAM API key.');
    }
  } catch (err) {
    throw convertError(err);
  }
  return true;
}

/**
 * Validate options.
 *
 * @param {object} opts - Options.
 * @returns Boolean true if all checks are passing.
 */
async function validateOptions(opts) {
  // if we don't have opts then we'll be using defaults
  if (!opts) {
    return true;
  }
  const rules = [
    { key: 'iamApiKey', type: 'string' },
    { key: 'log', type: 'string' },
    { key: 'output', type: 'string' },
    { key: 'bufferSize', type: 'number' },
    { key: 'parallelism', type: 'number' },
    { key: 'requestTimeout', type: 'number' },
    { key: 'mode', type: 'enum', values: ['full', 'shallow'] },
    { key: 'resume', type: 'boolean' }
  ];

  for (const rule of rules) {
    const val = opts[rule.key];
    switch (rule.type) {
      case 'string':
        if (typeof val !== 'undefined' && typeof val !== 'string') {
          throw new OptionError(`Invalid ${rule.key} option, must be type string`);
        }
        break;
      case 'number':
        if (typeof val !== 'undefined' && !isSafePositiveInteger(val)) {
          const humanized = rule.key.replace(/[A-Z]/g, l => ` ${l.toLowerCase()}`);
          throw new OptionError(`Invalid ${humanized} option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]`);
        }
        break;
      case 'enum':
        if (typeof val !== 'undefined' && rule.values.indexOf(val) === -1) {
          const humanized = rule.values
            .map(w => `"${w}"`)
            .reduce((acc, w, i, arr) => {
              return acc + (i < arr.length - 1 ? ', ' : ' or ') + w;
            });
          throw new OptionError(`Invalid mode option, must be either ${humanized}`);
        }
        break;
      case 'boolean':
        if (typeof val !== 'undefined' && typeof val !== 'boolean') {
          throw new OptionError(`Invalid ${rule.key} option, must be type boolean`);
        }
    }
  }
  return true;
}

/**
 * Show warning on invalid params in shallow mode.
 *
 * @param {object} opts - Options.
 */
async function shallowModeWarnings(opts) {
  if (!opts || opts.mode !== 'shallow') {
    return;
  }
  // Perform validation of invalid options for shallow mode and WARN
  // We don't error for backwards compatibility with scripts that may have been
  // written passing complete sets of options through
  if (opts.log || opts.resume) {
    console.warn('WARNING: the options "log" and "resume" are invalid when using shallow mode.');
  }
  if (opts.parallelism) {
    console.warn('WARNING: the option "parallelism" has no effect when using shallow mode.');
  }
}

/**
 * Additional checks for log on resume.
 *
 * @param {object} opts - Options.
 * @returns Boolean true if all checks are passing.
 */

async function validateLogOnResume(opts) {
  const logFileExists = opts && opts.log && fs.existsSync(opts.log);
  if (!opts || opts.mode === 'shallow') {
    // No opts specified, defaults will be populated.
    // In shallow mode log/resume are irrelevant and we'll have warned already.
    return true;
  } else if (opts.resume) {
    // Expecting to resume
    if (!opts.log) {
      // This is the second place we check for the presence of the log option in conjunction with resume
      // It has to be here for the API case
      throw new BackupError('NoLogFileName', 'To resume a backup, a log file must be specified');
    } else if (!logFileExists) {
      throw new BackupError('LogDoesNotExist', 'To resume a backup, the log file must exist');
    }
    if (opts.bufferSize) {
      // Warn that the bufferSize is already fixed
      console.warn('WARNING: the original backup "bufferSize" applies when resmuming a backup.');
    }
  } else {
    // Not resuming
    if (logFileExists) {
      throw new BackupError('LogFileExists', `The log file ${opts.log} exists. ` +
      'Use the resume option if you want to resume a backup from an existing log file.');
    }
  }
  return true;
}

/**
 * Validate arguments.
 *
 * @param {string} url - URL of database.
 * @param {object} opts - Options.
 * @param {boolean} backup - true for backup, false for restore
 * @returns Boolean true if all checks are passing.
 */
async function validateArgs(url, opts, backup = true) {
  const isIAM = opts && typeof opts.iamApiKey === 'string';
  const validations = [
    validateURL(url, isIAM),
    validateOptions(opts)
  ]
  if (backup) {
    validations.push(
      shallowModeWarnings(opts),
      validateLogOnResume(opts)
    );
  }
  return Promise.all(validations);
}

function addEventListener(indicator, emitter, event, f) {
  emitter.on(event, function(...args) {
    if (!indicator.errored) {
      if (event === 'error') indicator.errored = true;
      f(...args);
    }
  });
}

/**
 * Check the backup database exists and that the credentials used have
 * visibility. Throw a fatal error if there is a problem with the DB.
 *
 * @param {object} dbClient - database client object
 * @returns Passed in database client object
 */
async function validateBackupDb(dbClient) {
  try {
    await dbClient.service.headDatabase({ db: dbClient.dbName });
    return dbClient;
  } catch (err) {
    const e = parseDbResponseError(dbClient, err);
    if (e.name === 'DatabaseNotFound') {
      e.message = `${err.message} Ensure the backup source database exists.`;
    }
    // maybe convert it to HTTPError
    throw convertError(e);
  }
}

/**
 * Check that the restore database exists, is new and is empty. Also verify that the credentials used have
 * visibility. Callback with a fatal error if there is a problem with the DB.
 *
 * @param {object} dbClient - database client object
 * @returns Passed in database client object
 */
async function validateRestoreDb(dbClient) {
  try {
    const response = await dbClient.service.getDatabaseInformation({ db: dbClient.dbName });
    const { doc_count: docCount, doc_del_count: deletedDocCount } = response.result;
    // The system databases can have a validation ddoc(s) injected in them on creation.
    // This sets the doc count off, so we just complitely exclude the system databases from this check.
    // The assumption here is that users restoring system databases know what they are doing.
    if (!dbClient.dbName.startsWith('_') && (docCount !== 0 || deletedDocCount !== 0)) {
      throw new BackupError('DatabaseNotEmpty', `Target database ${dbClient.url}${dbClient.dbName} is not empty. A target database must be a new and empty database.`);
    }
    // good to use
    return dbClient;
  } catch (err) {
    const e = parseDbResponseError(dbClient, err);
    if (e.name === 'DatabaseNotFound') {
      e.message = `${e.message} Create the target database before restoring.`;
    }
    // maybe convert it to HTTPError
    throw convertError(e);
  }
}

/**
 * Convert the database validation response error to a special DatabaseNotFound error
 * in case the database is missing. Otherwise returns an original error.
 * @param {object} dbClient - database client object
 * @param {object} err - HTTP response error
 * @returns {Error} - DatabaseNotFound error or passed in err
 */
function parseDbResponseError(dbClient, err) {
  if (err && err.status === 404) {
    // Override the error type and message for the DB not found case
    const msg = `Database ${dbClient.url}` +
    `${dbClient.dbName} does not exist. ` +
    'Check the URL and database name have been specified correctly.';
    return new BackupError('DatabaseNotFound', msg);
  }
  return err;
}

module.exports = {

  /**
   * Backup a Cloudant database to a stream.
   *
   * @param {string} srcUrl - URL of database to backup.
   * @param {stream.Writable} targetStream - Stream to write content to.
   * @param {object} opts - Backup options.
   * @param {number} [opts.parallelism=5] - Number of parallel HTTP requests to use.
   * @param {number} [opts.bufferSize=500] - Number of documents per batch request.
   * @param {number} [opts.requestTimeout=120000] - Milliseconds to wait before retrying a HTTP request.
   * @param {string} [opts.iamApiKey] - IAM API key to use to access Cloudant database.
   * @param {string} [opts.log] - Log file name. Default uses a temporary file.
   * @param {boolean} [opts.resume] - Whether to resume from existing log.
   * @param {string} [opts.mode=full] - Use `full` or `shallow` mode.
   * @param {backupRestoreCallback} callback - Called on completion.
   */
  backup: function(srcUrl, targetStream, opts, callback) {
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts;
      opts = {};
    }

    const ee = new events.EventEmitter();

    validateArgs(srcUrl, opts)
      // Set up the DB client
      .then(() => {
        opts = Object.assign({}, defaults(), opts);
        return newClient(srcUrl, opts);
      })
      // Validate the DB exists, before proceeding to backup
      .then((backupDbClient) => validateBackupDb(backupDbClient))
      .then((backupDbClient) => {
        if (opts.mode === 'shallow') {
          // TODO make the backup function adjust the pipeline for shallow mode as part of i267

          // if there is an error writing to the stream, call the completion
          // callback with the error set
          const listenerErrorIndicator = { errored: false };
          addEventListener(listenerErrorIndicator, targetStream, 'error', function(err) {
            debug('Error ' + JSON.stringify(err));
            if (callback) callback(err);
          });

          // Get the event emitter from the backup process so we can handle events
          // before passing them on to the app's event emitter if needed.
          const internalEE = backupShallow(backupDbClient, opts);
          addEventListener(listenerErrorIndicator, internalEE, 'changes', function(batch) {
            ee.emit('changes', batch);
          });
          addEventListener(listenerErrorIndicator, internalEE, 'received', function(obj, q, logCompletedBatch) {
          // this may be too verbose to have as well as the "backed up" message
          // debug(' received batch', obj.batch, ' docs: ', obj.total, 'Time', obj.time);
          // Callback to emit the written event when the content is flushed
            function writeFlushed() {
              ee.emit('written', { total: obj.total, time: obj.time, batch: obj.batch });
              if (logCompletedBatch) {
                logCompletedBatch(obj.batch);
              }
              debug(' backed up batch', obj.batch, ' docs: ', obj.total, 'Time', obj.time);
            }
            // Write the received content to the targetStream
            const continueWriting = targetStream.write(JSON.stringify(obj.data) + '\n',
              'utf8',
              writeFlushed);
            if (!continueWriting) {
            // The buffer was full, pause the queue to stop the writes until we
            // get a drain event
              if (q && !q.paused) {
                q.pause();
                targetStream.once('drain', function() {
                  q.resume();
                });
              }
            }
          });
          // For errors we expect, may or may not be fatal
          addEventListener(listenerErrorIndicator, internalEE, 'error', function(err) {
            debug('Error ' + JSON.stringify(err));
            callback(err);
          });
          addEventListener(listenerErrorIndicator, internalEE, 'finished', function(obj) {
            function emitFinished() {
              debug('Backup complete - written ' + JSON.stringify(obj));
              const summary = { total: obj.total };
              ee.emit('finished', summary);
              if (callback) callback(null, summary);
            }
            if (targetStream === process.stdout) {
            // stdout cannot emit a finish event so use a final write + callback
              targetStream.write('', 'utf8', emitFinished);
            } else {
            // If we're writing to a file, end the writes and register the
            // emitFinished function for a callback when the file stream's finish
            // event is emitted.
              targetStream.end('', 'utf8', emitFinished);
            }
          });
        } else {
          // If resuming write a newline as it's possible one would be missing from
          // an interruption of the previous backup. If the backup was clean this
          // will cause an empty line that will be gracefully handled by the restore.
          if (opts.resume) {
            targetStream.write('\n');
          }

          return backupFull(backupDbClient, opts, targetStream, ee)
            .then((total) => {
              ee.emit('finished', total);
              callback(null, total); // TODO move after shallow backup is refactored
            });
        }
      })
      .catch(e => callback(convertError(e)));

    return ee;
  },

  /**
   * Restore a backup from a stream.
   *
   * @param {stream.Readable} srcStream - Stream containing backed up data.
   * @param {string} targetUrl - Target database.
   * @param {object} opts - Restore options.
   * @param {number} opts.parallelism - Number of parallel HTTP requests to use. Default 5.
   * @param {number} opts.bufferSize - Number of documents per batch request. Default 500.
   * @param {number} opts.requestTimeout - Milliseconds to wait before retrying a HTTP request. Default 120000.
   * @param {string} opts.iamApiKey - IAM API key to use to access Cloudant database.
   * @param {backupRestoreCallback} callback - Called on completion.
   */
  restore: function(srcStream, targetUrl, opts, callback) {
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts;
      opts = {};
    }

    const ee = new events.EventEmitter();

    validateArgs(targetUrl, opts, false)
      // Set up the DB client
      .then(() => {
        opts = Object.assign({}, defaults(), opts);
        return newClient(targetUrl, opts);
      })
      // Validate the DB exists, before proceeding to restore
      .then((restoreDbClient) => validateRestoreDb(restoreDbClient))
      .then((restoreDbClient) => {
        return restoreInternal(
          restoreDbClient,
          opts,
          srcStream,
          ee);
      })
      .then((total) => {
        ee.emit('finished', total);
        callback(null, total);
      })
      .catch(e => callback(convertError(e)));
    return ee;
  }
};

/**
 * Backup/restore callback
 * @callback backupRestoreCallback
 * @param {Error} err - Error object if operation failed.
 * @param {object} data - summary data for backup/restore
 */
