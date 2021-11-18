// Copyright © 2018, 2021 IBM Corp. All rights reserved.
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

/* global describe it */
'use strict';

const fs = require('fs');
const readline = require('readline');
const u = require('./citestutils.js');
const uuid = require('uuid').v4;

const params = { useApi: true };

describe(u.scenario('Concurrent database backups', params), function() {
  it('should run concurrent API database backups correctly #slower', function(done) {
    // Allow up to 900 s to backup and compare (it should be much faster)!
    u.setTimeout(this, 900);

    let doneCount = 0;
    let doneErr;
    const finished = function(err) {
      doneCount++;
      if (doneCount === 2) {
        done(doneErr || err);
      }
      doneErr = err;
    };

    const checkForEmptyBatches = function(fileName, cb) {
      let foundEmptyBatch = false;

      const rd = readline.createInterface({
        input: fs.createReadStream(fileName),
        output: fs.createWriteStream('/dev/null'),
        terminal: false
      });

      rd.on('line', function(line) {
        if (JSON.parse(line).length === 0) {
          // Note: Empty batch arrays indicate that the running backup is
          // incorrectly sharing a log file with another ongoing backup job.
          foundEmptyBatch = true;
        }
      });

      rd.on('close', function() {
        if (foundEmptyBatch) {
          cb(new Error(`Log file '${fileName}' contains empty batches`));
        } else {
          cb();
        }
      });
    };

    // [1] Run 'largedb2g' database backup
    const actualBackup1 = `./${uuid()}`;
    const output1 = fs.createWriteStream(actualBackup1);
    output1.on('open', function() {
      u.testBackup(params, 'largedb2g', output1, function(err) {
        if (err) {
          finished(err);
        } else {
          checkForEmptyBatches(actualBackup1, finished);
        }
      });
    });

    // [2] Run 'largedb1g' database backup
    const actualBackup2 = `./${uuid()}`;
    const output2 = fs.createWriteStream(actualBackup2);
    output2.on('open', function() {
      u.testBackup(params, 'largedb1g', output2, function(err) {
        if (err) {
          finished(err);
        } else {
          checkForEmptyBatches(actualBackup2, finished);
        }
      });
    });
  });
});
