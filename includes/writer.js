// Copyright © 2017, 2019 IBM Corp. All rights reserved.
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
const zlib = require('zlib');
const error = require('./error.js');
const debug = require('debug')('couchbackup:writer');

module.exports = function(db, bufferSize, parallelism, ee) {
  const writer = new stream.Transform({ objectMode: true });
  var buffer = [];
  var written = 0;
  var linenumber = 0;

  // this is the queue of chunks that are written to the database
  // the queue's payload will be an array of documents to be written,
  // the size of the array will be bufferSize. The variable parallelism
  // determines how many HTTP requests will occur at any one time.
  var q = async.queue(function(payload, cb) {
    // if we are restoring known revisions, we need to supply new_edits=false
    if (payload.docs && payload.docs[0] && payload.docs[0]._rev) {
      payload.new_edits = false;
    }

    // Stream the payload through a zip stream to the server
    const payloadStream = new stream.PassThrough();
    payloadStream.end(Buffer.from(JSON.stringify(payload), 'utf8'));
    const zipstream = zlib.createGzip();

    // Class for streaming _bulk_docs responses into
    // In general the response is [] or a small error/reason JSON object
    // so it is OK to have this in memory.
    class ResponseWriteable extends stream.Writable {
      constructor(options) {
        super(options);
        this.data = [];
      }

      _write(chunk, encoding, callback) {
        this.data.push(chunk);
        callback();
      }

      asJson() {
        return JSON.parse(Buffer.concat(this.data).toString());
      }
    }

    if (!didError) {
      var response;
      const responseBody = new ResponseWriteable();
      const req = db.server.request({
        db: db.config.db,
        path: '_bulk_docs',
        method: 'POST',
        headers: { 'content-encoding': 'gzip' },
        stream: true
      })
        .on('response', function(resp) {
          response = resp;
        })
        .on('end', function() {
          if (response.statusCode >= 400) {
            const err = error.convertResponseError(Object.assign({}, response, responseBody.asJson()));
            debug(`Error writing docs ${err.name} ${err.message}`);
            cb(err, payload);
          } else {
            written += payload.docs.length;
            writer.emit('restored', { documents: payload.docs.length, total: written });
            cb();
          }
        });
      // Pipe the payload into the request object to POST to _bulk_docs
      payloadStream.pipe(zipstream).pipe(req);
      // Pipe the request object's response into our bulkDocsResponse
      req.pipe(responseBody);
    }
  }, parallelism);

  var didError = false;

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
        var toSend = buffer.splice(0, bufferSize);

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
        var arr = JSON.parse(obj);

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
