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

delete require.cache[require.resolve('./citestutils.js')];
const u = require('./citestutils.js');

[{ useApi: true }, { useApi: false }].forEach(function(params) {
  describe(u.scenario('End to end backup and restore', params), function() {
    it('should backup and restore animaldb', function(done) {
      // Allow up to 60 s for backup and restore of animaldb
      u.setTimeout(this, 60);
      u.testDirectBackupAndRestore(params, 'animaldb', this.dbName, done);
    });
    it('should backup and restore largedb1g #slow', function(done) {
      // Allow up to 30 m for backup and restore of largedb1g
      // This is a long time but when many builds run in parallel it can take a
      // while to get this done.
      u.setTimeout(this, 30 * 60);
      u.testDirectBackupAndRestore(params, 'largedb1g', this.dbName, done);
    });
  });
});
