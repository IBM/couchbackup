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

// Small script which restores a Cloudant or CouchDB database from an IBM Cloud Object Storage (COS)
// bucket via direct stream rather than on-disk file

const IBM_COS = require('ibm-cos-sdk');
const VError = require('verror');
const couchbackup = require('@cloudant/couchbackup');
const debug = require('debug')('couchbackup-cos');
const url = require('url');

function main() {
  const argv = require('yargs')
    .usage('Usage: $0 [options]')
    .example('$0 -t https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/database -b <bucket> -o <object> --cos_url <cos_endpoint>', 'Restore database from a bucket via direct streaming')
    .options({
      target: { alias: 't', nargs: 1, demandOption: true, describe: 'Target database URL' },
      bucket: { alias: 'b', nargs: 1, demandOption: true, describe: 'Source bucket containing backup' },
      object: { alias: 'o', nargs: 1, demandOption: true, describe: 'Backup Object name in IBM COS' },
      cos_url: { nargs: 1, demandOption: true, describe: 'IBM COS S3 endpoint URL' },
    })
    .help('h').alias('h', 'help')
    .epilog('Copyright (C) IBM 2025')
    .argv;

  const restoreBucket = argv.bucket;
  const objectKey = argv.object;
  const cosEndpoint = argv.cos_url;
  const targetUrl = argv.target;

  const cloudantApiKey = process.env.CLOUDANT_IAM_API_KEY;

  const config = {
    endpoint: cosEndpoint,
    credentials: new IBM_COS.SharedJSONFileCredentials(),
  };

  const COS = new IBM_COS.S3(config);

  objectAccessible(COS, restoreBucket, objectKey)
    .then(() => {
      return restoreFromCOS(COS, restoreBucket, objectKey, targetUrl, cloudantApiKey);
    })
    .then(() => {
      debug('Restore completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Restore failed:', err.message);
      process.exit(1);
    });
}

/**
 * Check if object is accessible in COS
 * @param {IBM_COS.S3} s3
 * @param {string} bucketName
 * @param {string} objectKey
 */
async function objectAccessible(s3, bucketName, objectKey) {
  const params = {
    Key: objectKey,
    Bucket: bucketName,
  };
  try {
    await s3.headObject(params).promise();
    debug(`Object '${objectKey}' is accessible`);
  } catch (reason) {
    debug(reason);
    throw new VError(reason, 'Object is not accessible');
  }
}

/**
 * Restore directly from a backup file on IBM COS S3 to a new and empty CouchDB or Cloudant database.
 * Uses direct streaming without intermediate files.
 *
 * @param {IBM_COS.S3} cosClient Object store client
 * @param {string} cosBucket Backup source bucket
 * @param {string} cosObjectKey Backup file name on IBM COS
 * @param {string} targetUrl URL of database
 * @param {string} cloudantApiKey IAM API key for Cloudant authentication
 */
async function restoreFromCOS(cosClient, cosBucket, cosObjectKey, targetUrl, cloudantApiKey) {
  debug(`Starting direct stream restore from ${cosBucket}/${cosObjectKey} to ${s(targetUrl)}`);

  const cosInputStream = cosClient.getObject({
    Bucket: cosBucket,
    Key: cosObjectKey
  }).createReadStream({
    highWaterMark: 16 * 1024 * 1024 // 16MB buffer
  });

  cosInputStream.on('error', (err) => {
    debug('COS input stream error:', err);
    throw new VError(err, 'Failed to read from COS object');
  });

  const restorePromise = new Promise((resolve, reject) => {
    const params = {
      iamApiKey: cloudantApiKey,
      ...(process.env.CLOUDANT_IAM_TOKEN_URL && { iamTokenUrl: process.env.CLOUDANT_IAM_TOKEN_URL }),
    };

    const restoreStream = couchbackup.restore(
      cosInputStream,
      targetUrl,
      params,
      (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      }
    );
    restoreStream.on('restored', progress => {
      debug('Restored batch:', progress.batch, 'Total document revisions written:', progress.total, 'Time:', progress.time);
    });
    restoreStream.on('error', (err) => {
      debug('Restore stream error:', err);
      reject(err);
    });
  });

  try {
    const result = await restorePromise;
    debug(`Couchbackup restore to ${s(targetUrl)} complete; restored ${result.total} documents`);
    return result;
  } catch (err) {
    debug(err);
    throw new VError(err, 'Couchbackup restore failed');
  }
}

/**
 * Remove credentials from a URL for safe logging
 * @param {string} originalUrl URL to sanitize
 */
function s(originalUrl) {
  const parts = new url.URL(originalUrl);
  return url.format(parts, { auth: false });
}

main();
