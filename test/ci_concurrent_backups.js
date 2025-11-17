// Copyright © 2018, 2025 IBM Corp. All rights reserved.
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

const assert = require('node:assert');
const fs = require('node:fs');
const { once } = require('node:events');
const uuid = require('uuid').v4;
const u = require('./citestutils.js');
const { Liner } = require('../includes/liner.js');

const params = { useApi: true };

describe(u.scenario('Concurrent database backups', params), function() {
  it('should run concurrent API database backups correctly #slower', async function() {
    // Allow up to 900 s to backup and compare (it should be much faster)!
    u.setTimeout(this, 900);

    const checkForEmptyBatches = async function(fileName) {
      assert.ok(await fs.createReadStream(fileName) // backup file
        .pipe(new Liner(true)) // split to lines
        .map(linerLine => JSON.parse(linerLine.line)) // parse JSON
        .filter(parsedJson => Array.isArray(parsedJson)) // we want batches so filter to arrays
        // Note: Empty batch arrays indicate that the running backup is
        // incorrectly sharing a log file with another ongoing backup job.
        .every(batch => batch.length > 0),
        `Backup file ${fileName} contains empty batches.`);
    };

    const backupPromise = async function() {
      const actualBackup = `./${uuid()}`;
      const output = fs.createWriteStream(actualBackup);
      return once(output, 'open').then(() => {
        return u.testBackup(params, 'largedb1g', output);
      }).then(() => {
        return checkForEmptyBatches(actualBackup);
      });
    };

    // [1] Run 'largedb1g' database backup
    const backup1 = backupPromise();

    // [2] Run 'largedb1g' database backup
    const backup2 = backupPromise();

    return Promise.all([backup1, backup2]);
  });
});
