// Copyright © 2017, 2023 IBM Corp. All rights reserved.
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

const u = require('./citestutils.js');

describe('Event tests', function() {
  it('should get a finished event when using stdout', async function() {
    u.setTimeout(this, 40);
    // Use the API so we can get events, pass eventEmitter so we get the emitter back
    const params = { useApi: true, useStdOut: true };
    // All API backups now set an event listener for finished and it is part of the backup
    // promise, so if the backup passes the finished event fired.
    return u.testBackup(params, 'animaldb', process.stdout);
  });

  it('should get a finished event when using file output', async function() {
    u.setTimeout(this, 40);
    // Use the API so we can get events, pass eventEmitter so we get the emitter back
    const params = { useApi: true };
    const actualBackup = `./${this.fileName}`;
    return u.testBackupToFile(params, 'animaldb', actualBackup);
  });
});
