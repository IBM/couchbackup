'use strict';

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
const events = require('events');

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

    const ee = new events.EventEmitter();

    const batchWriteEventEmitter = new events.EventEmitter();
    // Array containing true at index 0, each received batch pushes a false on
    // the end, which is popped when that content is flushed. If a pop returns
    // the true from the zero index then all the batches have been written.
    const allBatchesWritten = [true];
    backup(srcUrl, opts.bufferSize, opts.parallelism, opts.log, opts.resume)
      .on('received', function(obj, q, writeCompleteCallback) {
        allBatchesWritten.push(false);
        debug(' backed up batch', obj.batch, ' docs: ', obj.total, 'Time', obj.time);
        if (!targetStream.write(JSON.stringify(obj.data) + '\n', 'utf8', function() {
          ee.emit('written', {total: obj.total, time: obj.time, batch: obj.batch});
          if (writeCompleteCallback) {
            writeCompleteCallback(obj.batch);
          }
        })) {
          // The buffer was full, pause the queue to stop the writes until we
          // get a drain event
          if (q && !q.isPaused) {
            q.pause();
            targetStream.once('drain', function() {
              q.resume();
            });
          }
        }
        batchWriteEventEmitter.emit('flushed', allBatchesWritten.pop());
      })
      .on('error', function(obj) {
        debug('Error ' + JSON.stringify(obj));
        ee.emit('error', obj);
      })
      .on('finished', function(obj) {
        debug('Backup complete - written ' + JSON.stringify(obj));
        const summary = {total: obj.total};
        if (targetStream === process.stdout) {
          // stdout cannot emit a finish event so wait for a flushed event
          // that indicates all content was flushed
          batchWriteEventEmitter.on('flushed', function(arg) {
            if (arg) {
              ee.emit('finished', summary);
              if (callback) callback(null, summary);
            }
          });
        } else {
          // If we're writing to a file, end the writes and do the callback
          // when the finish event is emitted.
          targetStream.end('', '', function() {
            ee.emit('finished', summary);
            if (callback) callback(null, summary);
          });
        }
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
   * @param {backupRestoreCallback} callback - Called on completion.
   */
  restore: function(srcStream, targetUrl, opts, callback) {
    if (typeof callback === 'undefined' && typeof opts === 'function') {
      callback = opts;
      opts = {};
    }
    opts = Object.assign({}, defaults.get(), opts);

    const ee = new events.EventEmitter();

    restoreInternal(
      targetUrl,
      opts.bufferSize,
      opts.parallelism,
      srcStream,
      function(err, writer) {
        if (err) {
          callback(err, null);
        }

        writer.on('restored', function(obj) {
          debug(' restored ', obj.total);
          ee.emit('restored', {documents: obj.documents, total: obj.total});
        })
        .on('error', function(e) {
          debug(' error', e);
          ee.emit('error', e);
        })
        .on('finished', function(obj) {
          debug('restore complete');
          ee.emit('finished', {total: obj.total});
          callback(null, obj);
        });
      }
    );

    return ee;
  }

};

/**
 * Backup/restore callback
 * @callback backupRestoreCallback
 * @param {Error} err - Error object if operation failed.
 * @param {object} data - summary data for backup/restore
 */
