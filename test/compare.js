// Copyright © 2023 IBM Corp. All rights reserved.
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

'use strict';

const chunk = require('lodash/chunk');
const difference = require('lodash/difference');
const forOwn = require('lodash/forOwn');
const isEmpty = require('lodash/isEmpty');
const union = require('lodash/union');

const compare = async(database1, database2, client) => {
  // check docs same in both dbs
  const allDocs1 = await getAllDocs(client, database1);
  const allDocs2 = await getAllDocs(client, database2);

  const onlyInDb1 = (difference(allDocs1, allDocs2));
  const onlyInDb2 = (difference(allDocs2, allDocs1));

  let databasesSame = isEmpty(onlyInDb1) && isEmpty(onlyInDb2);

  if (!databasesSame) {
    console.log(onlyInDb1.length + ' documents only in db 1.');
    console.log('Document IDs only in db 1: ' + onlyInDb1);
    console.log(onlyInDb2.length + ' documents only in db 2.');
    console.log('Document IDs only in db 2: ' + onlyInDb2);
  }

  // check revs same in docs common to both dbs
  const partitionSize = 500;
  const batches = chunk(union(allDocs1, allDocs2), partitionSize);

  const missingRevsInDb2 = await getMissingRevs(client, database1, database2, batches);
  const missingRevsInDb1 = await getMissingRevs(client, database2, database1, batches);

  databasesSame = databasesSame && isEmpty(missingRevsInDb1) && isEmpty(missingRevsInDb2);

  if (!databasesSame) {
    console.log('Missing revs in db 1:' + JSON.stringify(missingRevsInDb1));
    console.log('Missing revs in db 2:' + JSON.stringify(missingRevsInDb2));
  }

  return databasesSame;
};

const getMissingRevs = async(client, databaseName1, databaseName2, batcheses) => {
  const fakeRevisionId = '9999-a';

  const missing = {};

  // look in db1 - use a fake revision ID to fetch all leaf revisions

  for (const batches of batcheses) {
    const documentRevisions = {};
    batches.forEach(id => (documentRevisions[id] = [fakeRevisionId]));

    const result1 = await client.postRevsDiff({ db: databaseName1, documentRevisions });
    const revsDiffRequestDb2 = {};
    forOwn(result1.result, (v, k) => (revsDiffRequestDb2[k] = v.possible_ancestors));
    // look in db2
    const result2 = await client.postRevsDiff({ db: databaseName2, documentRevisions: revsDiffRequestDb2 });
    forOwn(result2.result, (v, k) => {
      if ('missing' in v) {
        missing[k] = v.missing;
      }
    });
  }
  return missing;
};

const getAllDocs = async(client, database) => {
  let allDocIds = [];
  const limit = 2000;
  let startKey = '\u0000';
  do {
    const pageOfDocIds = (await client.postAllDocs({ db: database, startKey, limit })).result.rows.map(r => r.id);
    allDocIds = allDocIds.concat(pageOfDocIds);
    if (pageOfDocIds.length < limit) {
      startKey = null;
    } else {
      startKey = pageOfDocIds[limit - 1] + '\u0000';
    }
  } while (startKey != null);
  return allDocIds;
};

module.exports = {
  compare
};
