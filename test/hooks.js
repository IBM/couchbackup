// Copyright © 2017, 2021 IBM Corp. All rights reserved.
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

const { CloudantV1 } = require('@ibm-cloud/cloudant');
const url = new URL((process.env.COUCH_BACKEND_URL) ? process.env.COUCH_BACKEND_URL : 'https://no-couch-backend-url-set.test');
const { BasicAuthenticator, NoAuthAuthenticator } = require('ibm-cloud-sdk-core');
const authenticator = (url.username) ? new BasicAuthenticator({ username: url.username, password: decodeURIComponent(url.password) }) : new NoAuthAuthenticator();
const serviceOpts = {
  authenticator: authenticator
};
const cloudant = new CloudantV1(serviceOpts);
// Remove auth from URL before using for service
cloudant.setServiceUrl(new URL(url.pathname, url.origin).toString());
const uuid = require('uuid').v4;
const fs = require('fs');

// Mocha hooks that will be at the root context so run for all tests

beforeEach('Create test database', function(done) {
  // Don't run hook for unit tests, just for CI
  if (!this.currentTest.fullTitle().includes('#unit')) {
    // Allow 10 seconds to create the DB
    this.timeout(10 * 1000);
    const unique = uuid();
    this.fileName = `${unique}`;
    this.dbName = 'couchbackup_test_' + unique;
    cloudant.putDatabase({ db: this.dbName }).then(() => { done(); }).catch((err) => { done(err); });
  } else {
    done();
  }
});

afterEach('Delete test database', function(done) {
  // Don't run hook for unit tests, just for CI
  if (!this.currentTest.fullTitle().includes('#unit')) {
    // Allow 10 seconds to delete the DB
    this.timeout(10 * 1000);
    deleteIfExists(this.fileName);
    deleteIfExists(`${this.fileName}.log`);
    cloudant.deleteDatabase({ db: this.dbName }).then(() => { done(); }).catch((err) => { done(err); });
  } else {
    done();
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
