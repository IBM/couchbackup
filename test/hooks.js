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

/* global beforeEach afterEach */
'use strict';

const uuid = require('uuid').v4;
const fs = require('fs');
const { newSimpleClient } = require('../includes/request.js');

const sharedClient = makeSharedClient();
function makeSharedClient() {
  const url = (process.env.COUCH_BACKEND_URL) ? process.env.COUCH_BACKEND_URL : 'https://no-couch-backend-url-set.test';
  const opts = {};
  opts.iamApiKey = process.env.COUCHBACKUP_TEST_IAM_API_KEY || null;
  opts.iamTokenUrl = process.env.CLOUDANT_IAM_TOKEN_URL || null;
  return newSimpleClient(url, opts).service;
}

// Mocha hooks that will be at the root context so run for all tests

beforeEach('Create test database', async function() {
  // Don't run hook for unit tests, just for CI
  if (!this.currentTest.fullTitle().includes('#unit')) {
    // Allow 10 seconds to create the DB
    this.timeout(10 * 1000);
    const unique = uuid();
    this.fileName = `${unique}`;
    this.dbName = 'couchbackup_test_' + unique;
    return sharedClient.putDatabase({ db: this.dbName });
  }
});

afterEach('Delete test database', async function() {
  // Don't run hook for unit tests, just for CI
  if (!this.currentTest.fullTitle().includes('#unit')) {
    // Allow 10 seconds to delete the DB
    this.timeout(10 * 1000);
    deleteIfExists(this.fileName);
    deleteIfExists(`${this.fileName}.log`);
    return sharedClient.deleteDatabase({ db: this.dbName });
  }
});

function deleteIfExists(fileName) {
  fs.unlink(fileName, function(err) {
    if (err) {
      if (err.code !== 'ENOENT') {
        console.error(`${err.code} ${err.message}`);
      }
    }
  });
}

module.exports = {
  sharedClient
};
