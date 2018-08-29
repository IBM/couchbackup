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

const fs = require('fs');
const u = require('./citestutils.js');

[{ useApi: true }, { useApi: false }].forEach(function(params) {
  describe(u.scenario('Compression tests', params), function() {
    const p = u.p(params, { compression: true });

    it('should backup animaldb to a compressed file', function(done) {
      // Allow up to 60 s for backup of animaldb
      u.setTimeout(this, 60);
      const compressedBackup = `./${this.fileName}`;
      const output = fs.createWriteStream(compressedBackup);
      output.on('open', function() {
        u.testBackup(p, 'animaldb', output, function(err) {
          if (err) {
            done(err);
          } else {
            u.assertGzipFile(compressedBackup, done);
          }
        });
      });
    });

    it('should backup and restore animaldb via a compressed file', function(done) {
      // Allow up to 60 s for backup and restore of animaldb
      u.setTimeout(this, 60);
      const compressedBackup = `./${this.fileName}`;
      u.testBackupAndRestoreViaFile(p, 'animaldb', compressedBackup, this.dbName, function(err) {
        if (err) {
          done(err);
        } else {
          u.assertGzipFile(compressedBackup, done);
        }
      });
    });

    it('should backup and restore animaldb via a compressed stream', function(done) {
      // Allow up to 60 s for backup and restore of animaldb
      u.setTimeout(this, 60);
      u.testDirectBackupAndRestore(p, 'animaldb', this.dbName, done);
    });

    it('should backup and restore largedb2g via a compressed file #slower', function(done) {
      // Takes ~ 25 min using CLI, but sometimes over an hour with API
      u.setTimeout(this, 180 * 60);
      const compressedBackup = `./${this.fileName}`;
      params.compression = true;
      u.testBackupAndRestoreViaFile(p, 'largedb2g', compressedBackup, this.dbName, done);
    });
  });
});
