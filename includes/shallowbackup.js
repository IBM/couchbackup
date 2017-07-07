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
const error = require('./error.js');
const events = require('events');
const request = require('./request.js');

// Both the 'log' and 'resume' parameters are unused in this function. They
// exist so that the method signatures for shallow backup and backup are
// symmetrical.
module.exports = function(dbUrl, limit, parallelism, log, resume) {
  var db = request.client(dbUrl, parallelism);

  if (typeof limit === 'string') limit = parseInt(limit);

  const ee = new events.EventEmitter();
  const start = new Date().getTime();
  var batch = 0;
  var hasErrored = false;
  var startKey = null;
  var total = 0;

  async.doUntil(
    function(callback) {
      // Note, include_docs: true is set automatically when using the
      // fetch function.
      var opts = {limit: limit};

      // To avoid double fetching a document solely for the purposes of getting
      // the next ID to use as a startkey for the next page we instead use the
      // last ID of the current page and append the lowest unicode sort
      // character.
      if (startKey) opts.startkey = `${startKey}\0`;
      db.fetch({}, opts, function(err, body) {
        if (err) {
          err = error.convertResponseError(err);
          ee.emit('error', err);
          if (!err.isTransient) hasErrored = true; // fatal err
          callback();
        } else if (!body.rows) {
          ee.emit('error', new error.BackupError(
            'AllDocsError', 'ERROR: Invalid all docs response'));
          callback();
        } else {
          if (body.rows.length < limit) {
            startKey = null; // last batch
          } else {
            startKey = body.rows[limit - 1].id;
          }

          var docs = [];
          body.rows.forEach(function(doc) {
            delete doc.doc._rev;
            docs.push(doc.doc);
          });

          if (docs.length > 0) {
            ee.emit('received', {
              batch: batch++,
              data: docs,
              length: docs.length,
              time: (new Date().getTime() - start) / 1000,
              total: total += docs.length
            });
          }
          callback();
        }
      });
    },
    function() { return hasErrored || startKey == null; },
    function() { ee.emit('finished', {total: total}); }
  );

  return ee;
};
