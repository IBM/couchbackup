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
var supportsBulkGet;

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

  checkBulkGetSupport(dbUrl, function(err) {
    if (err) return ee.emit('error', err);
    if (resume) {
      // pick up from existing log file from previous run
      downloadRemainingBatches(log, dbUrl, ee, start, batchesPerDownloadSession, parallelism);
    } else {
      // create new log file and process
      spoolchanges(dbUrl, log, blocksize, function(err) {
        if (err) {
          ee.emit('error', err);
        } else {
          downloadRemainingBatches(log, dbUrl, ee, start, batchesPerDownloadSession, parallelism);
        }
      });
    }
  });

  return ee;
};

/**
 * Check a database supports /_bulk_get
 *
 * @param {string} dbUrl - URL of source database
 * @param {function} callback - called once check completes
 */
function checkBulkGetSupport(dbUrl, callback) {
  // allow bulk get toggle for testing
  if (typeof process.env.TEST_SUPPORT_BULK_GET !== 'undefined') {
    supportsBulkGet = process.env.TEST_SUPPORT_BULK_GET.toLowerCase() === 'true';
    return callback();
  }
  client({url: dbUrl + '/_bulk_get', method: 'GET'}, function(err, res, data) {
    if (err) return callback(err);
    switch (res.statusCode) {
      case 404:
        supportsBulkGet = false;
        callback();
        break;
      case 405:
        supportsBulkGet = true;
        callback();
        break;
      default:
        callback(new error.BackupError('BulkGetCheckFailure', 'ERROR: Failed to check if database supports bulk gets'));
    }
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
    readBatchSetIdsFromLogFile(log, batchesPerDownloadSession, ee, function(err, batchSetIds) {
      if (batchSetIds.length === 0) {
        noRemainingBatches = true;
        return done();
      }

      // Fetch the doc IDs for the batches in the current set to
      // download and download them.
      function batchSetComplete(err, newTotal) {
        total = newTotal;
        done();
      }
      function processRetrievedBatches(err, batches) {
        // process them in parallelised queue
        processBatchSet(dbUrl, parallelism, log, batches, ee, startTime, total, batchSetComplete);
      }
      logfilegetbatches(log, batchSetIds, processRetrievedBatches);
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
 * @param {any} ee - emit `error` event if log file invalid
 * @param {function} callback - sign (err, batchSetIds array)
 */
function readBatchSetIdsFromLogFile(log, batchesPerDownloadSession, ee, callback) {
  logfilesummary(log, function processSummary(err, summary) {
    if (!summary.changesComplete) {
      ee.emit('error', new error.BackupError(
        'IncompleteChangesInLogFile',
        'WARNING: Changes did not finish spooling'
        ));
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
 * @param {any} total - count of documents already downloaded
 *  of batches
 * @param {any} callback - completion callback, (err, total).
 */
function processBatchSet(dbUrl, parallelism, log, batches, ee, start, total, callback) {
  // fetch docs using the /_bulk_get API
  function doBulkGet(docs, callback) {
    var output = [];

    docs.forEach(function(doc) {
      delete doc.deleted;
      delete doc.rev;
    });

    var req = {
      url: dbUrl + '/_bulk_get',
      qs: { revs: true },
      method: 'POST',
      body: {docs: docs}
    };
    client(req, function(err, res, data) {
      if (!err && data && data.results) {
        data.results.forEach(function(d) {
          if (d.docs) {
            d.docs.forEach(function(doc) {
              if (doc.ok) {
                output.push(doc.ok);
              }
            });
          }
        });
        callback(null, output);
      } else {
        callback(err);
      }
    });
  }

  // fetch docs seperately (not using the /_bulk_get API)
  function doGet(docs, callback) {
    var output = [];
    var hasErrored = false;

    var getDocQ = async.queue(function(doc, done) {
      if (!doc || hasErrored) return done();

      var req = {
        url: dbUrl + '/' + encodeURI(doc.id),
        qs: { rev: doc.rev, revs: true },
        method: 'GET'
      };
      client(req, function(err, res, data) {
        if (err) {
          hasErrored = true;
          callback(err);
        } else if (res.statusCode !== 200) {
          hasErrored = true;
          callback(new error.BackupError('BackupRetrieveError', `ERROR: Failed to get document '${doc.id}' (rev ${doc.rev}) - Status code: ${res.statusCode}`));
        } else {
          output = output.concat(data);
        }
        done();
      });
    });

    // get missing revs
    var revsDiffBody = {};
    const fakeRevId = ['9999-a'];
    docs.forEach(function(doc) {
      revsDiffBody[doc.id] = fakeRevId;
    });

    var req = {
      url: dbUrl + '/_revs_diff',
      body: revsDiffBody,
      method: 'POST'
    };
    client(req, function(err, res, data) {
      if (err) {
        hasErrored = true;
        callback(err);
      } else if (res.statusCode !== 200) {
        hasErrored = true;
        callback(new error.BackupError('BackupRetrieveError', `ERROR: Failed to query POST /_revs_diff - Status code: ${res.statusCode}`));
      } else {
        for (var docId in res.body) {
          var possibleAncestors = res.body[docId].possible_ancestors;
          if (possibleAncestors) {
            possibleAncestors.forEach(function(rev) {
              getDocQ.push({id: docId, rev: rev});
            });
          }
        }
      }
    });

    getDocQ.drain = function() {
      if (!hasErrored) callback(null, output);
    };
  }

  const fetchBatch = supportsBulkGet ? doBulkGet : doGet;
  var q = async.queue(function(batch, done) {
    fetchBatch(batch.docs, function(err, results) {
      if (err) {
        ee.emit('error', err);
        done();
      } else {
        var docCount = results.length;
        total += docCount;

        var data = {
          length: docCount,
          time: (new Date().getTime() - start) / 1000,
          total: total,
          data: results,
          batch: batch.batch
        };

        ee.emit('received', data, q, function(batchNo) {
          // mark batch as complete
          fs.appendFile(log, ':d batch' + batchNo + '\n', done);
        });
      }
    });
  }, parallelism);

  // add batches to work queue
  for (var i in batches) {
    q.push(batches[i]);
  }

  // callback with new total once complete
  q.drain = function() {
    callback(null, total);
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
