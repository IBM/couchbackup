// Copyright © 2023, 2025 IBM Corp. All rights reserved.
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

const assert = require('node:assert');
const { setInterval } = require('node:timers/promises');
const client = require('./hooks.js').sharedClient;
/**
 * Compare 2 databases to check the contents match.
 * Since all docs is ordered the comparison can be
 * done 1 batch at a time to reduce the overhead.
 *
 * Batches are collected from all docs of each DB
 * in parallel before being compared for equality.
 *
 * If the batches are equal, then the leaf revisions
 * are fetched in parallel and compared.
 *
 * @param {*} database1 name of the "expected" database (i.e. the source)
 * @param {*} database2 name of the "actual" database (i.e. the target)
 * @returns Promise resolving to true if the contents match or rejecting with an assertion error
 */
const compare = async function(database1, database2) {
  const sourceDbInfoResponse = await client.getDatabaseInformation({ db: database1 });
  const sourceDocCount = sourceDbInfoResponse.result.docCount;
  const sourceDocDelCount = sourceDbInfoResponse.result.docDelCount;
  // Assert the doc counts match, allowing multiple attempts for eventual constency to settle after the restore completes
  // Abort signal for document count check iterator
  const ac = new AbortController();
  // Check once per second while doc counts are changing until the assertion passes.
  // If doc counts aren't changing then try up to 5 times for a change before failing.
  let lastTargetDocCount = 0;
  let lastTargetDocDelCount = 0;
  let tryCount = 0;
  try {
    for await (const maxTries of setInterval(1000, 5, { signal: ac.signal })) {
      const resp = await client.getDatabaseInformation({ db: database2 });
      const targetDocCount = resp.result.docCount;
      const targetDocDelCount = resp.result.docDelCount;
      try {
        assert.strictEqual(targetDocCount, sourceDocCount);
        assert.strictEqual(targetDocDelCount, sourceDocDelCount);
        // Assertion passed, break the loop
        break;
      } catch (e) {
        // Assertion failed, check if making progress
        if (targetDocCount > lastTargetDocCount || targetDocDelCount > lastTargetDocDelCount) {
          // Making progress, set new values and continue
          // assertion failure is suppressed
          lastTargetDocCount = targetDocCount;
          lastTargetDocDelCount = targetDocDelCount;
          tryCount = 0;
        } else {
          // Not making progress, suppress exception and try again
          if (++tryCount > maxTries) {
            throw e;
          }
        }
      }
    }
  } finally {
    // Clean up the interval iterator
    ac.abort();
  }
  const limit = 2000;
  let startKey = '\u0000';
  let count = 0;
  do {
    const allDocsOpts = { startKey, limit };
    try {
      // Fetch batches in parallel from db1 and db2
      await Promise.all([client.postAllDocs({ db: database1, ...allDocsOpts }), client.postAllDocs({ db: database2, ...allDocsOpts })])
        .then(results => {
          const db1Rows = results[0].result.rows;
          const db2Rows = results[1].result.rows;
          // Asserts that the IDs and winning revs match
          assert.deepStrictEqual(db2Rows, db1Rows);
          // extract the IDs (we use only one db because we already know the IDs are equal)
          return resultRowsToIds(db1Rows);
        })
        .then(async docIDs => {
          // Post the id/fake rev list to revs diff to get all leaf revisions
          const documentRevisions = revsDiffBodyForIds(docIDs);
          const revsDiffResponses = await Promise.all([client.postRevsDiff({ db: database1, documentRevisions }), client.postRevsDiff({ db: database2, documentRevisions })]);
          // The responses are a map of doc IDs to a map of missing and possible ancestor arrays of rev IDs.
          // The missing will be our fake rev ID and possible ancestors should be all the leaf revisions.
          // We can assert these maps match to identify any discrepencies in the rev tree.
          assert.deepStrictEqual(revsDiffResponses[1].result, revsDiffResponses[0].result);
          // Return the original list of doc IDs to prepare for the next page
          return docIDs;
        }).then(docIds => {
          // Increment the counter
          count += docIds.length;
          if (docIds.length < limit) {
            // Last page
            // Set null to break the loop
            startKey = null;
            // Assert that we actually got all the docs
            assert.strictEqual(count, sourceDocCount);
          } else {
            // Set start key for next page
            startKey = docIds[limit - 1] + '\u0000';
          }
        });
    } catch (e) {
      return Promise.reject(e);
    }
  } while (startKey != null);
  return true;
};

function resultRowsToIds(rows) {
  return rows.map(r => r.id);
}

function revsDiffBodyForIds(docIDs) {
  // Make a map of each doc ID to a fake revision
  // use a fake revision ID to fetch all leaf revisions
  const fakeRevisionId = '99999-a';
  const documentRevisions = Object.create(null);
  docIDs.forEach(id => (documentRevisions[id] = [fakeRevisionId]));
  return documentRevisions;
}

module.exports = {
  compare
};
