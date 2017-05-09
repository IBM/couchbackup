
/**
 * CouchBackup module.
 * @module couchbackup
 * @see module:couchbackup
 */

var backup = require('./includes/backup.js');
const restore = require('./includes/restore.js');
const debug = require('debug')('couchbackup');
const defaults = require('./includes/defaults.js').get();
const fs = require('fs');
const url = require('url');

var mergeDefaults = function(opts, defaults) {
  for (var i in defaults) {
    if (!opts[i]) {
      opts[i] = defaults[i];
    }
  }
  return opts;
};

module.exports = {

  /**
   * Backup to a stream.
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
   * @param {function} callback - Called on completion.
   */
  backupStream: function(writeStream, opts, callback) {
    opts = mergeDefaults(opts, defaults);
    if (opts.COUCH_MODE === 'shallow') {
      backup = require('./includes/shallowbackup.js');
    }
    return backup(
      databaseUrl(opts.COUCH_URL, opts.COUCH_DATABASE),
      opts.COUCH_BUFFER_SIZE,
      opts.COUCH_PARALLELISM,
      opts.COUCH_LOG,
      opts.COUCH_RESUME
      ).on('written', function(obj) {
        debug(' backed up batch', obj.batch, ' docs: ', obj.total, 'Time', obj.time);
        writeStream.write(JSON.stringify(obj.data) + '\n');
      })
      .on('writeerror', function(obj) {
        debug('Error' + JSON.stringify(obj));
      })
      .on('writecomplete', function(obj) {
        debug('Backup complete - written' + JSON.stringify(obj));
        callback(null, obj);
      });
  },

    /**
   * Restore from a stream.
   *
   * @param {stream.Readable} readStream - Stream to restore from.
   * @param {object} opts - Backup options.
   * @param {string} [opts.COUCH_URL] - Target CouchDB/Cloudant instance URL.
   * @param {string} [opts.COUCH_DATABASE] - Target database name.
   * @param {number} [opts.COUCH_PARALLELISM=5] - Number of parallel HTTP requests to use.
   * @param {number} [opts.COUCH_BUFFER_SIZE=500] - Number of documents per batch request.
   * @param {function} callback - Called on completion.
   */
  restoreStream: function(readStream, opts, callback) {
    opts = mergeDefaults(opts, defaults);
    return restore(
      databaseUrl(opts.COUCH_URL, opts.COUCH_DATABASE),
      opts.COUCH_BUFFER_SIZE,
      opts.COUCH_PARALLELISM,
      readStream,
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

  /**
   * Backup to a file.
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
   * @param {function} callback - Called on completion.
   */
  backupFile: function(filename, opts, callback) {
    return this.backupStream(fs.createWriteStream(filename), opts, callback);
  },

  /**
   * Restore from a file.
   *
   * @param {string} filename - File path to restore from.
   * @param {object} opts - Backup options.
   * @param {string} [opts.COUCH_URL] - Target CouchDB/Cloudant instance URL.
   * @param {string} [opts.COUCH_DATABASE] - Target database name.
   * @param {number} [opts.COUCH_PARALLELISM=5] - Number of parallel HTTP requests to use.
   * @param {number} [opts.COUCH_BUFFER_SIZE=500] - Number of documents per batch request.
   * @param {function} callback - Called on completion.
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
