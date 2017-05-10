
/**
 * CouchBackup module.
 * @module couchbackup
 * @see module:couchbackup
 */

const restoreInternal = require('./includes/restore.js');
const backupShallow = require('./includes/shallowbackup.js');
const backupFull = require('./includes/backup.js');
const debug = require('debug')('couchbackup');
const defaults = require('./includes/defaults.js');
const fs = require('fs');
const url = require('url');

/**
 * Copy an attribute between objects if it is defined on the source,
 * overwriting any existing property on the target.
 *
 * @param {object} src - source object.
 * @param {string} srcProperty - source property name.
 * @param {object} target - target object.
 * @param {string} targetProperty - target property name.
 *
 * @private
 */
function copyIfDefined(src, srcProperty, target, targetProperty) {
  if (typeof src[srcProperty] !== 'undefined') {
    target[targetProperty] = src[srcProperty];
  }
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
    opts = Object.assign({}, defaults.get(), opts);

    var backup = null;
    if (opts.mode === 'shallow') {
      backup = backupShallow;
    } else {  // full mode
      backup = backupFull;
    }

    return backup(srcUrl, opts.bufferSize, opts.parallelism, opts.log, opts.resume)
      .on('written', function(obj) {
        debug(' backed up batch', obj.batch, ' docs: ', obj.total, 'Time', obj.time);
        targetStream.write(JSON.stringify(obj.data) + '\n');
      })
      .on('writeerror', function(obj) {
        debug('Error ' + JSON.stringify(obj));
      })
      .on('writecomplete', function(obj) {
        debug('Backup complete - written ' + JSON.stringify(obj));
        callback(null, obj);
      });
  },

  /**
   * Restore a backup from a stream.
   *
   * @param {stream.Readable} srcStream - Stream containing backed up data.
   * @param {string} targetUrl - Target database.
   * @param {object} opts - Restore options.
   * @param {number} opts.parallelism - Number of parallel HTTP requests to use. Default 5.
   * @param {number} opts.bufferSize - Number of documents per batch request. Default 500.
   * @param {backupRestoreCallback} callback - Called on completion.
   */
  restore: function(srcStream, targetUrl, opts, callback) {
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = Object.assign({}, defaults.get(), opts);

    return restoreInternal(
      targetUrl,
      opts.bufferSize,
      opts.parallelism,
      srcStream,
      function(err, writer) {
        if (err) {
          callback(err, null);
        }

        writer.on('written', function(obj) {
          debug(' written ', obj.total);
        })
        .on('writeerror', function(e) {
          debug(' error', e);
        })
        .on('writecomplete', function(obj) {
          debug('restore complete');
          callback(null, obj);
        });
      }
    );
  },

  /* DEPRECATED METHODS *****************************************/

  /**
   * Backup to a stream.
   *
   * @deprecated
   * @see backup
   *
   * @param {stream.Writable} writeStream - Stream to write content to.
   * @param {object} opts - Backup options.
   * @param {string} [opts.COUCH_URL] - Source CouchDB/Cloudant instance URL.
   * @param {string} [opts.COUCH_DATABASE] - Source database name.
   * @param {number} [opts.COUCH_PARALLELISM=5] - Number of parallel HTTP requests to use.
   * @param {number} [opts.COUCH_BUFFER_SIZE=500] - Number of documents per batch request.
   * @param {string} [opts.COUCH_LOG] - Log file name. Default uses a temporary file.
   * @param {boolean} [opts.COUCH_RESUME] - Whether to resume from existing log.
   * @param {string} [opts.COUCH_MODE=full] - Use `full` or `shallow` mode.
   * @param {backupRestoreCallback} callback - Called on completion.
   */
  backupStream: function(writeStream, opts, callback) {
    opts = Object.assign({}, defaults.legacyDefaults(), opts);

    // copyIfDefined ensures we don't overwrite defaults for
    // new methods with `undefined`.
    var newOpts = {};
    copyIfDefined(opts, 'COUCH_BUFFER_SIZE', newOpts, 'bufferSize');
    copyIfDefined(opts, 'COUCH_PARALLELISM', newOpts, 'parallelism');
    copyIfDefined(opts, 'COUCH_LOG', newOpts, 'log');
    copyIfDefined(opts, 'COUCH_RESUME', newOpts, 'bufferesumerSize');
    copyIfDefined(opts, 'COUCH_MODE', newOpts, 'mode');

    return this.backup(
      databaseUrl(opts.COUCH_URL, opts.COUCH_DATABASE),
      writeStream,
      newOpts,
      callback
    );
  },

  /**
   * Restore from a stream.
   *
   * @deprecated
   * @see restore
   *
   * @param {stream.Readable} readStream - Stream to restore from.
   * @param {object} opts - Backup options.
   * @param {string} [opts.COUCH_URL] - Target CouchDB/Cloudant instance URL.
   * @param {string} [opts.COUCH_DATABASE] - Target database name.
   * @param {number} [opts.COUCH_PARALLELISM=5] - Number of parallel HTTP requests to use.
   * @param {number} [opts.COUCH_BUFFER_SIZE=500] - Number of documents per batch request.
   * @param {backupRestoreCallback} callback - Called on completion.
   */
  restoreStream: function(readStream, opts, callback) {
    opts = Object.assign({}, defaults.legacyDefaults(), opts);

    // copyIfDefined ensures we don't overwrite defaults for
    // new methods with `undefined`.
    var newOpts = {};
    copyIfDefined(opts, 'COUCH_BUFFER_SIZE', newOpts, 'bufferSize');
    copyIfDefined(opts, 'COUCH_PARALLELISM', newOpts, 'parallelism');

    return this.restore(
      readStream,
      databaseUrl(opts.COUCH_URL, opts.COUCH_DATABASE),
      newOpts,
      callback
    );
  },

  /**
   * Backup to a file.
   *
   * @deprecated
   * @see backup
   *
   * @param {string} filename - File to write backup to.
   * @param {object} opts - Backup options.
   * @param {string} [opts.COUCH_URL] - Source CouchDB/Cloudant instance URL.
   * @param {string} [opts.COUCH_DATABASE] - Source database name.
   * @param {number} [opts.COUCH_PARALLELISM=5] - Number of parallel HTTP requests to use.
   * @param {number} [opts.COUCH_BUFFER_SIZE=500] - Number of documents per batch request.
   * @param {string} [opts.COUCH_LOG] - Log file name. Default uses a temporary file.
   * @param {boolean} [opts.COUCH_RESUME] - Whether to resume from existing log.
   * @param {string} [opts.COUCH_MODE=full] - Use `full` or `shallow` mode.
   * @param {backupRestoreCallback} callback - Called on completion.
   */
  backupFile: function(filename, opts, callback) {
    return this.backupStream(fs.createWriteStream(filename), opts, callback);
  },

  /**
   * Restore from a file.
   *
   * @deprecated
   * @see restore
   *
   * @param {string} filename - File path to restore from.
   * @param {object} opts - Backup options.
   * @param {string} [opts.COUCH_URL] - Target CouchDB/Cloudant instance URL.
   * @param {string} [opts.COUCH_DATABASE] - Target database name.
   * @param {number} [opts.COUCH_PARALLELISM=5] - Number of parallel HTTP requests to use.
   * @param {number} [opts.COUCH_BUFFER_SIZE=500] - Number of documents per batch request.
   * @param {backupRestoreCallback} callback - Called on completion.
   */
  restoreFile: function(filename, opts, callback) {
    return this.restoreStream(fs.createReadStream(filename), opts, callback);
  }
};

/**
 * Combine a base URL and a database name, ensuring at least single slash
 * between root and database name. This allows users to have Couch behind
 * proxies that mount Couch's / endpoint at some other mount point.
 * @param {string} root - root URL
 * @param {string} databaseName - database name
 * @return concatenated URL.
 *
 * @private
 */
function databaseUrl(root, databaseName) {
  if (!root.endsWith('/')) {
    root = root + '/';
  }
  return url.resolve(root, encodeURIComponent(databaseName));
}

/**
 * Backup/restore callback
 * @callback backupRestoreCallback
 * @param {Error} err - Error object if operation failed.
 * @param {object} data - summary data for backup/restore
 */
