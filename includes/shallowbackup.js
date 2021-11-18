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
const error = require('./error.js');
const events = require('events');

module.exports = function(db, options) {
  const ee = new events.EventEmitter();
  const start = new Date().getTime();
  let batch = 0;
  let hasErrored = false;
  let startKey = null;
  let total = 0;

  async.doUntil(
    function(callback) {
      // Note, include_docs: true is set automatically when using the
      // fetch function.
      const opts = { db: db.db, limit: options.bufferSize, includeDocs: true };

      // To avoid double fetching a document solely for the purposes of getting
      // the next ID to use as a startkey for the next page we instead use the
      // last ID of the current page and append the lowest unicode sort
      // character.
      if (startKey) opts.startkey = `${startKey}\0`;
      db.service.postAllDocs(opts).then(response => {
        const body = response.result;
        if (!body.rows) {
          ee.emit('error', new error.BackupError(
            'AllDocsError', 'ERROR: Invalid all docs response'));
          callback();
        } else {
          if (body.rows.length < opts.limit) {
            startKey = null; // last batch
          } else {
            startKey = body.rows[opts.limit - 1].id;
          }

          const docs = [];
          body.rows.forEach(function(doc) {
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
      }).catch(err => {
        err = error.convertResponseError(err);
        ee.emit('error', err);
        hasErrored = true;
        callback();
      });
    },
    function(callback) { callback(null, hasErrored || startKey == null); },
    function() { ee.emit('finished', { total: total }); }
  );

  return ee;
};
