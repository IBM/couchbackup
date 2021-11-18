// Copyright © 2017, 2018 IBM Corp. All rights reserved.
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
const fs = require('fs');
const u = require('./citestutils.js');

describe('Write error tests', function() {
  it('calls callback with error set when stream is not writeable', function(done) {
    u.setTimeout(this, 10);
    const dirname = fs.mkdtempSync('test_backup_');
    // make temp dir read only
    fs.chmodSync(dirname, 0o444);
    const filename = dirname + '/test.backup';
    const backupStream = fs.createWriteStream(filename, { flags: 'w' });
    const params = { useApi: true };
    // try to do backup and check err was set in callback
    u.testBackup(params, 'animaldb', backupStream, function(resultErr) {
      let err = null;
      try {
        // cleanup temp dir
        fs.rmdirSync(dirname);
        // error should have been set
        assert.ok(resultErr);
        assert.strictEqual(resultErr.code, 'EACCES');
      } catch (thrownErr) {
        err = thrownErr;
      } finally {
        done(err);
      }
    });
  });
});
