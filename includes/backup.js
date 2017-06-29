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
'use strict';

const async = require('async');
const events = require('events');
const request = require('./request.js');
const fs = require('fs');
const error = require('./error.js');
const spoolchanges = require('./spoolchanges.js');
const logfilesummary = require('./logfilesummary.js');
const logfilegetbatches = require('./logfilegetbatches.js');

var client;

/**
 * Read documents from a database to be backed up.
 *
 * @param {string} dbUrl - URL of source database.
 * @param {number} blocksize - number of documents to download in single request
 * @param {number} parallelism - number of concurrent downloads
 * @param {string} log - path to log file to use
 * @param {boolean} resume - whether to resume from an existing log file
 * @returns EventEmitter with following events:
 *  - `received` - called with a block of documents to write to backup
 *  - `error` - on error
 *  - `finished` - when backup process is finished (either complete or errored)
 */
module.exports = function(dbUrl, blocksize, parallelism, log, resume) {
  if (typeof blocksize === 'string') {
    blocksize = parseInt(blocksize);
  }
  const ee = new events.EventEmitter();
  const start = new Date().getTime();  // backup start time
  const batchesPerDownloadSession = 50;  // max batches to read from log file for download at a time (prevent OOM)

  client = request.client(dbUrl, parallelism);

  function proceedWithBackup() {
    if (resume) {
      // pick up from existing log file from previous run
      downloadRemainingBatches(log, dbUrl, ee, start, batchesPerDownloadSession, parallelism);
    } else {
      // create new log file and process
      spoolchanges(dbUrl, log, blocksize, ee, function(err) {
        if (err) {
          ee.emit('error', err);
        } else {
          downloadRemainingBatches(log, dbUrl, ee, start, batchesPerDownloadSession, parallelism);
        }
      });
    }
  }

  validateBulkGetSupport(dbUrl, function(err) {
    if (err) {
      return ee.emit('error', err);
    } else {
      proceedWithBackup();
    }
  });

  return ee;
};

/**
 * Validate /_bulk_get support for a specified database.
 *
 * @param {string} dbUrl - URL of database
 * @param {function} callback - called on completion with signature (err)
 */
function validateBulkGetSupport(dbUrl, callback) {
  client({url: dbUrl + '/_bulk_get', method: 'GET'}, function(err, res, data) {
    if (err) return callback(err);
    request.checkResponseAndCallbackError(res, callback, function(res) {
      switch (res.statusCode) {
        case 404:
          return new error.BackupError('BulkGetError', 'Database does not support /_bulk_get endpoint');
        case 405:
          // => supports /_bulk_get endpoint
          return;
        default:
          return new error.HTTPFatalError(res);
      }
    });
  });
}

/**
 * Download remaining batches in a log file, splitting batches into sets
 * to avoid enqueueing too many in one go.
 *
 * @param {string} log - log file name to maintain download state
 * @param {string} dbUrl - Source database URL
 * @param {events.EventEmitter} ee - event emitter to emit received events on
 * @param {time} start - start time for backup process
 * @param {number} batchesPerDownloadSession - max batches to enqueue for
 *  download at a time. As batches contain many doc IDs, this helps avoid
 *  exhausting memory.
 * @param {number} parallelism - number of concurrent downloads
 * @returns function to call do download remaining batches with signature
 *  (err, {batches: batch, docs: doccount}) {@see spoolchanges}.
 */
function downloadRemainingBatches(log, dbUrl, ee, startTime, batchesPerDownloadSession, parallelism) {
  var total = 0;  // running total of documents downloaded so far
  var noRemainingBatches = false;

  // Generate a set of batches (up to batchesPerDownloadSession) to download from the
  // log file and download them. Set noRemainingBatches to `true` for last batch.
  function downloadSingleBatchSet(done) {
    // Fetch the doc IDs for the batches in the current set to
    // download them.
    function batchSetComplete(err, data) {
      total = data.total;
      done();
    }
    function processRetrievedBatches(err, batches) {
      // process them in parallelised queue
      processBatchSet(dbUrl, parallelism, log, batches, ee, startTime, total, batchSetComplete);
    }

    readBatchSetIdsFromLogFile(log, batchesPerDownloadSession, function(err, batchSetIds) {
      if (err) {
        ee.emit('error', err);
        if (err.isFatal) {
          // Stop processing changes file for fatal errors
          noRemainingBatches = true;
        }
        done();
      } else {
        if (batchSetIds.length === 0) {
          noRemainingBatches = true;
          return done();
        }
        logfilegetbatches(log, batchSetIds, processRetrievedBatches);
      }
    });
  }

  // Return true if all batches in log file have been downloaded
  function isFinished() { return noRemainingBatches; }

  function onComplete() {
    ee.emit('finished', {total: total});
  }

  async.doUntil(downloadSingleBatchSet, isFinished, onComplete);
}

/**
 * Return a set of uncompleted download batch IDs from the log file.
 *
 * @param {string} log - log file path
 * @param {number} batchesPerDownloadSession - maximum IDs to return
 * @param {function} callback - sign (err, batchSetIds array)
 */
function readBatchSetIdsFromLogFile(log, batchesPerDownloadSession, callback) {
  logfilesummary(log, function processSummary(err, summary) {
    if (!summary.changesComplete) {
      callback(new error.BackupError('IncompleteChangesInLogFile',
        'WARNING: Changes did not finish spooling'));
      return;
    }
    if (Object.keys(summary.batches).length === 0) {
      return callback(null, []);
    }

    // batch IDs are the property names of summary.batches
    var batchSetIds = getPropertyNames(summary.batches, batchesPerDownloadSession);
    callback(null, batchSetIds);
  });
}

/**
 * Download a set of batches retrieved from a log file. When a download is
 * complete, add a line to the logfile indicating such.
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
function processBatchSet(dbUrl, parallelism, log, batches, ee, start, grandtotal, callback) {
  var total = grandtotal;

  // queue to process the fetch requests in an orderly fashion using _bulk_get
  var q = async.queue(function(payload, done) {
    var output = [];
    var thisBatch = payload.batch;
    delete payload.batch;

    function logCompletedBatch(batch) {
      if (log) {
        fs.appendFile(log, ':d batch' + thisBatch + '\n', done);
      } else {
        done();
      }
    }

    // do the /db/_bulk_get request
    var r = {
      url: dbUrl + '/_bulk_get',
      qs: { revs: true }, // gets previous revision tokens too
      method: 'POST',
      body: payload
    };
    client(r, function(err, res, data) {
      if (err) {
        ee.emit('error', err);
        done();
      } else {
        request.checkResponseAndCallbackError(res, function(err) {
          if (err) {
            if (err.isFatal) {
              // Kill the queue for fatal errors
              q.kill();
            }
            ee.emit('error', err);
            done();
          } else {
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
            ee.emit('received', {
              batch: thisBatch,
              data: output,
              length: output.length,
              time: t,
              total: total
            }, q, logCompletedBatch);
          }
        });
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
