'use strict';

const async = require('async');
const events = require('events');
const request = require('request');
const fs = require('fs');
const error = require('./error.js');
const spoolchanges = require('./spoolchanges.js');
const logfilesummary = require('./logfilesummary.js');
const logfilegetbatches = require('./logfilegetbatches.js');

/**
 * Process a set of download batches.
 *
 * @param {any} dbUrl - URL of database
 * @param {any} parallelism - number of concurrent requests to make
 * @param {any} log - log file to drive downloads from
 * @param {any} batches - batches to download
 * @param {any} ee - event emitter for progress. This funciton emits
 *  received and error events.
 * @param {any} start - time backup started, to report deltas
 * @param {any} grandtotal - count of documents downloaded prior to this set
 *  of batches
 * @param {any} callback - completion callback, (err, {total: number}).
 */
function processBatches(dbUrl, parallelism, log, batches, ee, start, grandtotal, callback) {
  var total = grandtotal;

  // queue to process the fetch requests in an orderly fashion using _bulk_get
  var q = async.queue(function(payload, done) {
    var output = [];
    var thisBatch = payload.batch;
    delete payload.batch;

    // do the /db/_bulk_get request
    var r = {
      url: dbUrl + '/_bulk_get',
      qs: { revs: true }, // gets previous revision tokens too
      method: 'post',
      json: true,
      body: payload
    };
    request(r, function(err, res, data) {
      if (!err && data && data.results) {
        // create an output array with the docs returned
        data.results.forEach(function(d) {
          if (d.docs) {
            d.docs.forEach(function(doc) {
              if (doc.ok) {
                output.push(doc.ok);
              }
            });
          }
        });
        total += output.length;
        var t = (new Date().getTime() - start) / 1000;
        ee.emit('received', {length: output.length, time: t, total: total, data: output, batch: thisBatch});
        if (log) {
          fs.appendFile(log, ':d batch' + thisBatch + '\n', done);
        } else {
          done();
        }
      } else {
        ee.emit('error', err);
        done();
      }
    });
  }, parallelism);

  for (var i in batches) {
    q.push(batches[i]);
  }

  q.drain = function() {
    callback(null, {total: total});
  };
}

// backup function
module.exports = function(dbUrl, blocksize, parallelism, log, resume) {
  if (typeof blocksize === 'string') {
    blocksize = parseInt(blocksize);
  }
  const ee = new events.EventEmitter();
  const start = new Date().getTime();  // backup start time
  const maxbatches = 50;  // max batches to read from log file for download at a time (prevent OOM)
  var total = 0;  // running total of documents downloaded so far

  // Reads all remaining batches in the log file and downloads them
  var downloadRemainingBatches = function downloadRemainingBatches(err, data) {
    // no point continuing if we have no docs
    if (err) {
      return ee.emit('error', err);
    }

    var noRemainingBatches = false;

    // Generate a set of batches (up to maxbatches) to download from the
    // log file and download them. Set noRemainingBatches to `true` for last batch.
    var downloadSingleBatchSet = function downloadSingleBatchSet(done) {
      logfilesummary(log, function processSummary(err, summary) {
        if (!summary.changesComplete) {
          ee.emit('error', new error.BackupError(
            'IncompleteChangesInLogFile',
            'WARNING: Changes did not finish spooling'
           ));
        }
        if (Object.keys(summary.batches).length === 0) {
          noRemainingBatches = true;
          return done();
        }

        // batch IDs are the property names of summary.batches
        var batchesToFetch = getPropertyNames(summary.batches, maxbatches);

        // Fetch the doc IDs for the batches in the current set to
        // download and download them.
        var batchSetComplete = function batchSetComplete(err, data) {
          total = data.total;
          done();
        };
        var processBatchSet = function processBatchSet(err, batches) {
          // process them in parallelised queue
          processBatches(dbUrl, parallelism, log, batches, ee, start, total, batchSetComplete);
        };
        logfilegetbatches(log, batchesToFetch, processBatchSet);
      });
    };

    // Return true if all batches in log file have been downloaded
    var isFinished = function isFinished() { return noRemainingBatches; };

    var onComplete = function onComplete() {
      ee.emit('finished', {total: total});
    };

    async.doUntil(downloadSingleBatchSet, isFinished, onComplete);
  };

  // If resuming, pick up from existing log file from previous run. Otherwise,
  // create new log file and process from that.
  if (resume) {
    downloadRemainingBatches(null, {});
  } else {
    spoolchanges(dbUrl, log, blocksize, downloadRemainingBatches);
  }

  return ee;
};

/**
 * Returns first N properties on an object.
 *
 * @param {object} obj - object with properties
 * @param {number} count - number of properties to return
 */
function getPropertyNames(obj, count) {
  // decide which batch numbers to deal with
  var batchestofetch = [];
  var j = 0;
  for (var i in obj) {
    batchestofetch.push(parseInt(i));
    j++;
    if (j >= count) break;
  }
  return batchestofetch;
}
