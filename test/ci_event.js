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

const fs = require('fs');
const u = require('./citestutils.js');

describe('Event tests', function() {
  it('should get a finished event when using stdout', function(done) {
    u.setTimeout(this, 40);
    // Use the API so we can get events
    const params = { useApi: true };
    const backup = u.testBackup(params, 'animaldb', process.stdout, function(err) {
      if (err) {
        done(err);
      }
    });
    backup.on('finished', function() {
      try {
        // Test will time out if the finished event is not emitted
        done();
      } catch (err) {
        done(err);
      }
    });
  });
  it('should get a finished event when using file output', function(done) {
    u.setTimeout(this, 40);
    // Use the API so we can get events
    const params = { useApi: true };
    const actualBackup = `./${this.fileName}`;
    // Create a file and backup to it
    const output = fs.createWriteStream(actualBackup);
    output.on('open', function() {
      const backup = u.testBackup(params, 'animaldb', output, function(err) {
        if (err) {
          done(err);
        }
      });
      backup.on('finished', function() {
        try {
          // Test will time out if the finished event is not emitted
          done();
        } catch (err) {
          done(err);
        }
      });
    });
  });
});
