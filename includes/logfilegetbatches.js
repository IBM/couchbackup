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

const fs = require('fs');
const stream = require('stream');
const liner = require('./liner.js');

const onLine = function(onCommand, batches) {
  const change = new stream.Transform({ objectMode: true });
  change._transform = function(line, encoding, done) {
    if (line && line[0] === ':') {
      const obj = {
        command: null,
        batch: null,
        docs: []
      };

      let matches;

      // extract command
      matches = line.match(/^:([a-z_]+) ?/);
      if (matches) {
        obj.command = matches[1];
      }

      // extract batch
      matches = line.match(/ batch([0-9]+)/);
      if (matches) {
        obj.batch = parseInt(matches[1]);
      }

      // if this is one we want
      if (obj.command === 't' && batches.indexOf(obj.batch) > -1) {
        const json = line.replace(/^.* batch[0-9]+ /, '').trim();
        obj.docs = JSON.parse(json);
        onCommand(obj);
      }
    }
    done();
  };
  return change;
};

module.exports = function(log, batches, callback) {
  // our sense of state
  const retval = { };

  // called with each line from the log file
  const onCommand = function(obj) {
    retval[obj.batch] = obj;
  };

  // stream through the previous log file
  fs.createReadStream(log)
    .pipe(liner())
    .pipe(onLine(onCommand, batches))
    .on('error', function(err) {
      callback(err);
    })
    .on('finish', function() {
      callback(null, retval);
    });
};
