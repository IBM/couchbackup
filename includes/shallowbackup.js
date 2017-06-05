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

module.exports = function(dbUrl, blocksize, parallelism, log, resume) {
  const client = request.client(dbUrl, parallelism);
  if (typeof blocksize === 'string') {
    blocksize = parseInt(blocksize);
  }
  const events = require('events');
  const ee = new events.EventEmitter();

  var startdocid = null;
  const start = new Date().getTime();
  var batch = 1;
  var total = 0;

  async.doUntil(function(callback) {
    var opts = {limit: blocksize + 1, include_docs: true};
    if (startdocid) {
      opts.startkey_docid = startdocid;
    }
    var r = {
      url: dbUrl + '/_all_docs',
      method: 'get',
      qs: opts
    };
    client(r, function(err, res, data) {
      if (err || !data.rows) {
        ee.emit('error', err || data);
        return callback(null, null);
      }

      if (data.rows.length === blocksize + 1) {
        startdocid = data.rows[blocksize].id;
      } else {
        startdocid = null;
      }

      var docs = [];
      for (var i = 0; i < Math.min(data.rows.length, blocksize); i++) {
        delete data.rows[i].doc._rev;
        docs.push(data.rows[i].doc);
      }

      total += docs.length;
      var t = (new Date().getTime() - start) / 1000;
      ee.emit('received', {length: docs.length, batch: batch++, time: t, total: total, data: docs});
      callback(null);
    });
  },
  function() {
    return (startdocid == null);
  },
  function(err) {
    ee.emit('finished', {total: total, err: err});
  });

  return ee;
};
