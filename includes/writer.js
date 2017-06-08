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
const request = require('./request.js');
const stream = require('stream');
const error = require('./error.js');
// global flag across all threads to indicate
// - that we stop processing the queue
// - that we only emit an error on the first failing thread
var didError = false;

module.exports = function(couchDbUrl, bufferSize, parallelism) {
  const client = request.client(couchDbUrl, parallelism);
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
    var r = {
      url: couchDbUrl + '/_bulk_docs',
      method: 'post',
      body: payload
    };

    const response = client(r, function(err, res, data) {
      if (err) {
        writer.emit('error', err);
      } else {
        written += payload.docs.length;
        writer.emit('restored', {documents: payload.docs.length, total: written});
      }
      cb();
    });

    response.on('response', function(resp) {
      var e = null;
      switch (resp.statusCode) {
        // TODO move this to a common file where it can be re-used:
        // deal with all expected error codes and distinguish between
        // permanent and transient errors
        case 401:
          e = new error.BackupError('Unauthorized', `Database ${couchDbUrl} does not have correct permissions. Check that you have the correct permissions before restoring.`);
          break;
        case 403:
          e = new error.BackupError('Forbidden', `Incorrect credentials for database ${couchDbUrl}. Check that you have the correct username and password or API key before restoring.`);
          break;
      }
      if (e != null) {
        response.abort();
        // only emit the first error as there are multiple threads
        if (!didError) {
          didError = true;
          writer.emit('error', e);
        }
      }
    });
  }, parallelism);

  // write the contents of the buffer to CouchDB in blocks of bufferSize
  var processBuffer = function(flush, callback) {
    if (flush || buffer.length >= bufferSize) {
      // work through the buffer to break off bufferSize chunks
      // and feed the chunks to the queue
      do {
        // split the buffer into bufferSize chunks
        var toSend = buffer.splice(0, bufferSize);

        // and add the chunk to the queue
        q.push({docs: toSend});
      } while (buffer.length >= bufferSize);

      // send any leftover documents to the queue
      if (flush && buffer.length > 0) {
        q.push({docs: buffer});
      }

      // wait until the queue size falls to a reasonable level
      async.until(
        // wait until the queue length drops to twice the paralellism
        // or until empty on the last write
        function() {
          // if we encountered an error, stop processing the queue
          if (didError) {
            return true;
          }
          if (flush) {
            return q.idle() && q.length() === 0;
          } else {
            return q.length() <= parallelism * 2;
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
  };

  var writer = new stream.Transform({objectMode: true});

  // take an object
  writer._transform = function(obj, encoding, done) {
    // each obj that arrives here is a line from the backup file
    // it should contain an array of objects. The length of the array
    // depends on the bufferSize at backup time.
    linenumber++;
    if (obj !== '') {
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
          processBuffer(false, function() {
            done();
          });
        } else {
          console.error('ERROR on line', linenumber, ': not an array');
          done();
        }
      } catch (e) {
        console.error('ERROR on line', linenumber, ': cannot parse as JSON');
        // Could be an incomplete write that was subsequently resumed
        done();
      }
    } else {
      done();
    }
  };

  // called when we need to flush everything
  writer._flush = function(done) {
    processBuffer(true, function() {
      done();
    });
  };
  return writer;
};
