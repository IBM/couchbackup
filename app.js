// Copyright © 2017, 2021 IBM Corp. All rights reserved.
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
const defaults = require('./includes/config.js').apiDefaults;
const error = require('./includes/error.js');
const request = require('./includes/request.js');
const restoreInternal = require('./includes/restore.js');
const backupShallow = require('./includes/shallowbackup.js');
const debug = require('debug')('couchbackup:app');
const events = require('events');
const fs = require('fs');
const URL = require('url').URL;

/**
 * Test for a positive, safe integer.
 *
 * @param {object} x - Object under test.
 */
function isSafePositiveInteger(x) {
  // https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
  const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER || 9007199254740991;
  // Is it a number?
  return Object.prototype.toString.call(x) === '[object Number]' &&
    // Is it an integer?
    x % 1 === 0 &&
    // Is it positive?
    x > 0 &&
    // Is it less than the maximum safe integer?
    x <= MAX_SAFE_INTEGER;
}

/**
 * Validate arguments.
 *
 * @param {object} url - URL of database.
 * @param {object} opts - Options.
 * @param {function} cb - Callback to be called on error.
 */
function validateArgs(url, opts, cb) {
  if (typeof url !== 'string') {
    cb(new error.BackupError('InvalidOption', 'Invalid URL, must be type string'), null);
    return;
  }
  if (opts && typeof opts.bufferSize !== 'undefined' && !isSafePositiveInteger(opts.bufferSize)) {
    cb(new error.BackupError('InvalidOption', 'Invalid buffer size option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'), null);
    return;
  }
  if (opts && typeof opts.iamApiKey !== 'undefined' && typeof opts.iamApiKey !== 'string') {
    cb(new error.BackupError('InvalidOption', 'Invalid iamApiKey option, must be type string'), null);
    return;
  }
  if (opts && typeof opts.log !== 'undefined' && typeof opts.log !== 'string') {
    cb(new error.BackupError('InvalidOption', 'Invalid log option, must be type string'), null);
    return;
  }
  if (opts && typeof opts.mode !== 'undefined' && ['full', 'shallow'].indexOf(opts.mode) === -1) {
    cb(new error.BackupError('InvalidOption', 'Invalid mode option, must be either "full" or "shallow"'), null);
    return;
  }
  if (opts && typeof opts.output !== 'undefined' && typeof opts.output !== 'string') {
    cb(new error.BackupError('InvalidOption', 'Invalid output option, must be type string'), null);
    return;
  }
  if (opts && typeof opts.parallelism !== 'undefined' && !isSafePositiveInteger(opts.parallelism)) {
    cb(new error.BackupError('InvalidOption', 'Invalid parallelism option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'), null);
    return;
  }
  if (opts && typeof opts.requestTimeout !== 'undefined' && !isSafePositiveInteger(opts.requestTimeout)) {
    cb(new error.BackupError('InvalidOption', 'Invalid request timeout option, must be a positive integer in the range (0, MAX_SAFE_INTEGER]'), null);
    return;
  }
  if (opts && typeof opts.resume !== 'undefined' && typeof opts.resume !== 'boolean') {
    cb(new error.BackupError('InvalidOption', 'Invalid resume option, must be type boolean'), null);
    return;
  }

  // Validate URL and ensure no auth if using key
  try {
    const urlObject = new URL(url);
    // We require a protocol, host and path (for db), fail if any is missing.
    if (urlObject.protocol !== 'https:' && urlObject.protocol !== 'http:') {
      cb(new error.BackupError('InvalidOption', 'Invalid URL protocol.'));
      return;
    }
    if (!urlObject.host) {
      cb(new error.BackupError('InvalidOption', 'Invalid URL host.'));
      return;
    }
    if (!urlObject.pathname || urlObject.pathname === '/') {
      cb(new error.BackupError('InvalidOption', 'Invalid URL, missing path element (no database).'));
      return;
    }
    if (opts && opts.iamApiKey && (urlObject.username || urlObject.password)) {
      cb(new error.BackupError('InvalidOption', 'URL user information must not be supplied when using IAM API key.'));
      return;
    }
  } catch (err) {
    cb(err);
    return;
  }

  // Perform validation of invalid options for shallow mode and WARN
  // We don't error for backwards compatibility with scripts that may have been
  // written passing complete sets of options through
  if (opts && opts.mode === 'shallow') {
    if (opts.log || opts.resume) {
      console.warn('WARNING: the options "log" and "resume" are invalid when using shallow mode.');
    }
    if (opts.parallelism) {
      console.warn('WARNING: the option "parallelism" has no effect when using shallow mode.');
    }
  }

  if (opts && opts.resume) {
    if (!opts.log) {
      // This is the second place we check for the presence of the log option in conjunction with resume
      // It has to be here for the API case
      cb(new error.BackupError('NoLogFileName', 'To resume a backup, a log file must be specified'), null);
      return;
    } else if (!fs.existsSync(opts.log)) {
      cb(new error.BackupError('LogDoesNotExist', 'To resume a backup, the log file must exist'), null);
      return;
    }
  }
  return true;
}

function addEventListener(indicator, emitter, event, f) {
  emitter.on(event, function(...args) {
    if (!indicator.errored) {
      if (event === 'error') indicator.errored = true;
      f(...args);
    }
  });
}

/*
  Check the backup database exists and that the credentials used have
  visibility. Callback with a fatal error if there is a problem with the DB.
  @param {string} db - database object
  @param {function(err)} callback - error is undefined if DB exists
*/
function proceedIfBackupDbValid(db, callback) {
  db.service.headDatabase({ db: db.db }).then(() => callback()).catch(err => {
    err = error.convertResponseError(err, err => parseIfDbValidResponseError(db, err));
    callback(err);
  });
}

/*
  Check that the restore database exists, is new and is empty. Also verify that the credentials used have
  visibility. Callback with a fatal error if there is a problem with the DB.
  @param {string} db - database object
  @param {function(err)} callback - error is undefined if DB exists, new and empty
*/
function proceedIfRestoreDbValid(db, callback) {
  db.service.getDatabaseInformation({ db: db.db }).then(response => {
    const { doc_count: docCount, doc_del_count: deletedDocCount } = response.result;
    // The system databases can have a validation ddoc(s) injected in them on creation.
    // This sets the doc count off, so we just complitely exclude the system databases from this check.
    // The assumption here is that users restoring system databases know what they are doing.
    if (!db.db.startsWith('_') && (docCount !== 0 || deletedDocCount !== 0)) {
      const notEmptyDBErr = new Error(`Target database ${db.url}${db.db} is not empty.`);
      notEmptyDBErr.name = 'DatabaseNotEmpty';
      callback(notEmptyDBErr);
    } else {
      callback();
    }
  }).catch(err => {
    err = error.convertResponseError(err, err => parseIfDbValidResponseError(db, err));
    callback(err);
  });
}

/*
  Convert the database validation response error to a special DatabaseNotFound error
  in case the database is missing. Otherwise delegate to the default error factory.
  @param {object} db - database object
  @param {object} err - HTTP response error
*/
function parseIfDbValidResponseError(db, err) {
  if (err && err.status === 404) {
    // Override the error type and message for the DB not found case
    const msg = `Database ${db.url}` +
    `${db.db} does not exist. ` +
    'Check the URL and database name have been specified correctly.';
    const noDBErr = new Error(msg);
    noDBErr.name = 'DatabaseNotFound';
    return noDBErr;
  }
  // Delegate to the default error factory if it wasn't a 404
  return error.convertResponseError(err);
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
    const listenerErrorIndicator = { errored: false };
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    if (!validateArgs(srcUrl, opts, callback)) {
      // bad args, bail
      return;
    }

    // if there is an error writing to the stream, call the completion
    // callback with the error set
    addEventListener(listenerErrorIndicator, targetStream, 'error', function(err) {
      debug('Error ' + JSON.stringify(err));
      if (callback) callback(err);
    });

    opts = Object.assign({}, defaults(), opts);

    const ee = new events.EventEmitter();

    // Set up the DB client
    const backupDB = request.client(srcUrl, opts);

    // Validate the DB exists, before proceeding to backup
    proceedIfBackupDbValid(backupDB, function(err) {
      if (err) {
        if (err.name === 'DatabaseNotFound') {
          err.message = `${err.message} Ensure the backup source database exists.`;
        }
        // Didn't exist, or another fatal error, exit
        callback(err);
        return;
      }
      let backup = null;
      if (opts.mode === 'shallow') {
        backup = backupShallow;
      } else { // full mode
        backup = backupFull;
      }

      // If resuming write a newline as it's possible one would be missing from
      // an interruption of the previous backup. If the backup was clean this
      // will cause an empty line that will be gracefully handled by the restore.
      if (opts.resume) {
        targetStream.write('\n');
      }

      // Get the event emitter from the backup process so we can handle events
      // before passing them on to the app's event emitter if needed.
      const internalEE = backup(backupDB, opts);
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
    });
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
    const listenerErrorIndicator = { errored: false };
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    validateArgs(targetUrl, opts, callback);
    opts = Object.assign({}, defaults(), opts);

    const ee = new events.EventEmitter();

    // Set up the DB client
    const restoreDB = request.client(targetUrl, opts);

    // Validate the DB exists, before proceeding to restore
    proceedIfRestoreDbValid(restoreDB, function(err) {
      if (err) {
        if (err.name === 'DatabaseNotFound') {
          err.message = `${err.message} Create the target database before restoring.`;
        } else if (err.name === 'DatabaseNotEmpty') {
          err.message = `${err.message} A target database must be a new and empty database.`;
        }
        // Didn't exist, or another fatal error, exit
        callback(err);
        return;
      }

      restoreInternal(
        restoreDB,
        opts,
        srcStream,
        ee,
        function(err, writer) {
          if (err) {
            callback(err, null);
            return;
          }
          if (writer != null) {
            addEventListener(listenerErrorIndicator, writer, 'restored', function(obj) {
              debug(' restored ', obj.total);
              ee.emit('restored', { documents: obj.documents, total: obj.total });
            });
            addEventListener(listenerErrorIndicator, writer, 'error', function(err) {
              debug('Error ' + JSON.stringify(err));
              // Only call destroy if it is available on the stream
              if (srcStream.destroy && srcStream.destroy instanceof Function) {
                srcStream.destroy();
              }
              callback(err);
            });
            addEventListener(listenerErrorIndicator, writer, 'finished', function(obj) {
              debug('restore complete');
              ee.emit('finished', { total: obj.total });
              callback(null, obj);
            });
          }
        }
      );
    });
    return ee;
  }
};

/**
 * Backup/restore callback
 * @callback backupRestoreCallback
 * @param {Error} err - Error object if operation failed.
 * @param {object} data - summary data for backup/restore
 */
