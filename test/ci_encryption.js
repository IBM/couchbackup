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

/* global describe it */
'use strict';

const u = require('./citestutils.js');

describe('Encryption tests', function() {
  // Note CLI only to use openssl command
  const p = { useApi: false, encryption: true };

  it('should backup and restore animaldb via an encrypted file', function(done) {
    // Allow up to 60 s for backup and restore of animaldb
    u.setTimeout(this, 60);
    const encryptedBackup = `./${this.fileName}`;
    u.testBackupAndRestoreViaFile(p, 'animaldb', encryptedBackup, this.dbName, function(err) {
      if (err) {
        done(err);
      } else {
        u.assertEncryptedFile(encryptedBackup, done);
      }
    });
  });
});
