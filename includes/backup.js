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

  client = request.client(dbUrl, parallelism);

  checkBulkGetSupport(dbUrl, function(err) {
    if (err) return ee.emit('error', err);
    if (resume) {
      // pick up from existing log file from previous run
      downloadBatches(log, dbUrl, ee, start, parallelism);
    } else {
      // create new log file and process
      spoolchanges(dbUrl, log, blocksize, function logFileGenerated() {
        downloadBatches(log, dbUrl, ee, start, parallelism);
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
  client({url: dbUrl + '/_bulk_get', method: 'get'}, function(err, res, data) {
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
 * Download batches in a log file.
 *
 * @param {string} log - log file name to maintain download state
 * @param {string} dbUrl - Source database URL
 * @param {events.EventEmitter} ee - event emitter to emit received events on
 * @param {time} start - start time for backup process
 * @param {number} parallelism - number of concurrent downloads
 * @param {function} callback - called once complete with signature is (err,
 * total documents downloaded number)
 */
function downloadBatches(log, dbUrl, ee, startTime, parallelism, callback) {
  readAllBatchIdsFromLogFile(log, function(err, allBatchIds) {
    if (err) return ee.emit('error', err);
    if (allBatchIds.length === 0) return ee.emit('finished', {total: 0});

    var total = 0;
    const maxBatchFetch = 50;
    var hasErrored = false;

    function process(done) {
      logfilegetbatches(log, allBatchIds.splice(0, maxBatchFetch).map(Number), function(err, batches) {
        processBatches(dbUrl, parallelism, log, batches, ee, startTime, total, function(err, newTotal) {
          total = newTotal;
          if (err) {
            hasErrored = true;
            done(err, total);
          } else {
            done(null, total);
          }
        });
      });
    }

    function isComplete() {
      return hasErrored || allBatchIds.length === 0;
    }

    function onComplete(err, total) {
      if (err) {
        ee.emit('error', err);
      } else {
        ee.emit('finished', {total: total});
      }
    }

    async.doUntil(process, isComplete, onComplete);
  });
}

/**
 * Return all uncompleted download batch IDs from the log file.
 *
 * @param {string} log - log file path
 * @param {function} callback - called once complete with signature is (err,
 * batchSetIds array)
 */
function readAllBatchIdsFromLogFile(log, callback) {
  logfilesummary(log, function(err, summary) {
    if (!summary.changesComplete) {
      callback(new error.BackupError('IncompleteChangesInLogFile', 'WARNING: Changes did not finish spooling'));
    } else {
      callback(null, Object.keys(summary.batches));
    }
  });
}

/**
 * Download a batch retrieved from a log file. When a download is complete, add
 * a line to the logfile indicating such.
 *
 * @param {any} dbUrl - URL of database
 * @param {any} parallelism - number of concurrent requests to make
 * @param {any} log - log file to drive downloads from
 * @param {any} batches - batches to download
 * @param {any} ee - event emitter for progress. This funciton emits received
 *  and error events.
 * @param {any} start - time backup started, to report deltas
 * @param {any} total - count of documents downloaded
 * @param {function} callback - called once complete with signature (err, total)
 * where total is the number of documents downloaded
 */
function processBatches(dbUrl, parallelism, log, batches, ee, start, total, callback) {
  // fetch docs using the /_bulk_get API
  function doBulkGet(docs, callback) {
    docs.forEach(function(doc) {
      delete doc.deleted;
      delete doc.rev;
    });

    var req = {
      url: dbUrl + '/_bulk_get',
      qs: { revs: true },
      method: 'post',
      body: {docs: docs}
    };

    var output = [];
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
        callback(err, null);
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
        method: 'get'
      };

      var fetchDoc = function(callback) {
        client(req, function(err, res, data) {
          if (err) {
            callback(err);
          } else if (res.statusCode !== 200) {
            callback(new error.BackupError('BackupRetrieveError', `ERROR: Failed to get document '${doc.id}' (rev ${doc.rev}) - Status code: ${res.statusCode}`));
          } else {
            callback(null, data);
          }
        });
      };

      async.retry(3, fetchDoc, function(err, doc) {
        if (err) {
          hasErrored = true;
          callback(err);
        } else {
          output = output.concat(doc);
        }
        done();
      });
    });

    // get missing revs
    var revsDiffBody = {};
    var fakeRevId = ['9999-a'];
    docs.forEach(function(doc) {
      revsDiffBody[doc.id] = fakeRevId;
    });

    var req = { url: dbUrl + '/_revs_diff', body: revsDiffBody, method: 'post' };
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

  var q = async.queue(function(batch, done) {
    function fetchBatch(callback) {
      if (supportsBulkGet) {
        doBulkGet(batch.docs, callback);
      } else {
        doGet(batch.docs, callback);
      }
    }

    function logCompletedBatch(batch) {
      if (log) {
        fs.appendFile(log, ':d batch' + batch + '\n', done);
      } else {
        done();
      }
    }

    async.retry(3, fetchBatch, function(err, results) {
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

        ee.emit('received', data, q, logCompletedBatch);
      }
    });
  }, parallelism);

  // add batches to work queue
  for (var i in batches) {
    q.push(batches[i]);
  }

  // callback with new total once complete
  q.drain = function() { callback(null, total); };
}
