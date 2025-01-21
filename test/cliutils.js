// Copyright © 2025 IBM Corp. All rights reserved.
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

const cliutils = require('../includes/cliutils.js');
const assert = require('assert');

describe('#unit Check URL handling', function() {
  it('should encode database names', async function() {
    const server = 'http://foo.example';
    const dbName = 'a_$()+/-';
    const expectedEncodedDbName = 'a_%24()%2B%2F-';
    const encodedDbName = encodeURIComponent(dbName);
    assert.strictEqual(encodedDbName, 'a_%24()%2B%2F-',
        `The encoded DB name was ${encodedDbName} but should match the expected ${expectedEncodedDbName}`);
    const expectedUrl = `${server}/${expectedEncodedDbName}`;
    const url = cliutils.databaseUrl(server, dbName);
    assert.strictEqual(url, expectedUrl,
      `The url was ${url} but should be ${expectedUrl}`
    );
  });
});
