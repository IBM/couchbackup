// Copyright © 2017, 2024 IBM Corp. All rights reserved.
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

const assert = require('assert');
const { mkdtemp, open, rm } = require('fs/promises');
const u = require('./citestutils.js');

describe('Write error tests', function() {
  it('calls callback with error set when stream is not writeable', async function() {
    u.setTimeout(this, 10);
    // Make a temp directory
    const dirname = await mkdtemp('test_backup_');
    const filename = dirname + '/test.backup';
    // Create a backup file
    const file = await open(filename, 'w');
    // Use a read stream instead of a write stream
    const backupStream = await file.createReadStream();
    const params = { useApi: true };
    // try to do backup and check err was set in callback
    return assert.rejects(u.testBackup(params, 'animaldb', backupStream), { name: 'TypeError', message: 'dest.write is not a function' })
      .finally(async() => {
        // Destroy the read stream we didn't use
        backupStream.destroy();
        // cleanup temp dir
        await rm(dirname, { recursive: true });
      });
  });
});
