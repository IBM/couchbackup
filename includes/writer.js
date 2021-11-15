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

const async = require('async');
const stream = require('stream');
const error = require('./error.js');
const debug = require('debug')('couchbackup:writer');

module.exports = function(db, bufferSize, parallelism, ee) {
  const writer = new stream.Transform({ objectMode: true });
  let buffer = [];
  let written = 0;
  let linenumber = 0;

  // this is the queue of chunks that are written to the database
  // the queue's payload will be an array of documents to be written,
  // the size of the array will be bufferSize. The variable parallelism
  // determines how many HTTP requests will occur at any one time.
  const q = async.queue(function(payload, cb) {
    // if we are restoring known revisions, we need to supply new_edits=false
    if (payload.docs && payload.docs[0] && payload.docs[0]._rev) {
      payload.new_edits = false;
      debug('Using new_edits false mode.');
    }

    if (!didError) {
      db.service.postBulkDocs({
        db: db.db,
        bulkDocs: payload
      }).then(response => {
        if (!response.result || (payload.new_edits === false && response.result.length > 0)) {
          throw new Error(`Error writing batch with new_edits:${payload.new_edits !== false}` +
            ` and ${response.result ? response.result.length : 'unavailable'} items`);
        }
        written += payload.docs.length;
        writer.emit('restored', { documents: payload.docs.length, total: written });
        cb();
      }).catch(err => {
        err = error.convertResponseError(err);
        debug(`Error writing docs ${err.name} ${err.message}`);
        cb(err, payload);
      });
    }
  }, parallelism);

  let didError = false;

  // write the contents of the buffer to CouchDB in blocks of bufferSize
  function processBuffer(flush, callback) {
    function taskCallback(err, payload) {
      if (err && !didError) {
        debug(`Queue task failed with error ${err.name}`);
        didError = true;
        q.kill();
        writer.emit('error', err);
      }
    }

    if (flush || buffer.length >= bufferSize) {
      // work through the buffer to break off bufferSize chunks
      // and feed the chunks to the queue
      do {
        // split the buffer into bufferSize chunks
        const toSend = buffer.splice(0, bufferSize);

        // and add the chunk to the queue
        debug(`Adding ${toSend.length} to the write queue.`);
        q.push({ docs: toSend }, taskCallback);
      } while (buffer.length >= bufferSize);

      // send any leftover documents to the queue
      if (flush && buffer.length > 0) {
        debug(`Adding remaining ${buffer.length} to the write queue.`);
        q.push({ docs: buffer }, taskCallback);
      }

      // wait until the queue size falls to a reasonable level
      async.until(
        // wait until the queue length drops to twice the paralellism
        // or until empty on the last write
        function(callback) {
          // if we encountered an error, stop this until loop
          if (didError) {
            return callback(null, true);
          }
          if (flush) {
            callback(null, q.idle() && q.length() === 0);
          } else {
            callback(null, q.length() <= parallelism * 2);
          }
        },
        function(cb) {
          setTimeout(cb, 20);
        },

        function() {
          if (flush && !didError) {
            writer.emit('finished', { total: written });
          }
          // callback when we're happy with the queue size
          callback();
        });
    } else {
      callback();
    }
  }

  // take an object
  writer._transform = function(obj, encoding, done) {
    // each obj that arrives here is a line from the backup file
    // it should contain an array of objects. The length of the array
    // depends on the bufferSize at backup time.
    linenumber++;
    if (!didError && obj !== '') {
      // see if it parses as JSON
      try {
        const arr = JSON.parse(obj);

        // if it's an array with a length
        if (typeof arr === 'object' && arr.length > 0) {
          // push each document into a buffer
          buffer = buffer.concat(arr);

          // pause the stream
          // it's likely that the speed with which data can be read from disk
          // may exceed the rate it can be written to CouchDB. To prevent
          // the whole file being buffered in memory, we pause the stream here.
          // it is resumed, when processBuffer calls back and we call done()
          this.pause();

          // break the buffer in to bufferSize chunks to be written to the database
          processBuffer(false, done);
        } else {
          ee.emit('error', new error.BackupError('BackupFileJsonError', `Error on line ${linenumber} of backup file - not an array`));
          done();
        }
      } catch (e) {
        ee.emit('error', new error.BackupError('BackupFileJsonError', `Error on line ${linenumber} of backup file - cannot parse as JSON`));
        // Could be an incomplete write that was subsequently resumed
        done();
      }
    } else {
      done();
    }
  };

  // called when we need to flush everything
  writer._flush = function(done) {
    processBuffer(true, done);
  };
  return writer;
};
