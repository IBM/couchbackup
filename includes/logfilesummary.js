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

const onLine = function(onCommand, getDocs) {
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

      // extract doc ids
      if (getDocs && obj.command === 't') {
        const json = line.replace(/^.* batch[0-9]+ /, '').trim();
        obj.docs = JSON.parse(json);
      }
      onCommand(obj);
    }
    done();
  };
  return change;
};

/**
 * Generate a list of remaining batches from a download file.
 *
 * @param {string} log - log file name
 * @param {function} callback - callback with err, {changesComplete: N, batches: N}.
 *  changesComplete signifies whether the log file appeared to
 *  have completed reading the changes feed (contains :changes_complete).
 *  batches are remaining batch IDs for download.
 */
module.exports = function(log, callback) {
  // our sense of state
  const state = {

  };
  let changesComplete = false;

  // called with each line from the log file
  const onCommand = function(obj) {
    if (obj.command === 't') {
      state[obj.batch] = true;
    } else if (obj.command === 'd') {
      delete state[obj.batch];
    } else if (obj.command === 'changes_complete') {
      changesComplete = true;
    }
  };

  // stream through the previous log file
  fs.createReadStream(log)
    .pipe(liner())
    .pipe(onLine(onCommand, false))
    .on('finish', function() {
      const obj = { changesComplete: changesComplete, batches: state };
      callback(null, obj);
    });
};
