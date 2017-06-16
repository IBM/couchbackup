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

[{useApi: true}, {useApi: false}].forEach(function(params) {
  describe(u.scenario('#slowest End to end backup and restore', params), function() {
    it('should backup and restore largedb2g', function(done) {
      u.setTimeout(this, 60 * 60);
      u.testDirectBackupAndRestore(params, 'largedb1g', this.dbName, done);
    });
    it('should backup and restore largedb5g', function(done) {
      u.setTimeout(this, 150 * 60);
      u.testDirectBackupAndRestore(params, 'largedb1g', this.dbName, done);
    });
    it('should backup and restore largedb10g', function(done) {
      u.setTimeout(this, 300 * 60);
      u.testDirectBackupAndRestore(params, 'largedb10g', this.dbName, done);
    });
    it('should backup and restore largedb25g', function(done) {
      u.setTimeout(this, 750 * 60);
      u.testDirectBackupAndRestore(params, 'largedb25g', this.dbName, done);
    });
    it('should backup and restore largedb50g', function(done) {
      u.setTimeout(this, 1500 * 60);
      u.testDirectBackupAndRestore(params, 'largedb50g', this.dbName, done);
    });
  });
});
