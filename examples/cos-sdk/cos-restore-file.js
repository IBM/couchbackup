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
// bucket using an intermediary file on disk

const IBM_COS = require('ibm-cos-sdk');
const VError = require('verror');
const couchbackup = require('@cloudant/couchbackup');
const debug = require('debug')('couchbackup-cos');
const url = require('url');
const fs = require('fs');
const tmp = require('tmp');
const { pipeline } = require('stream/promises');

function main() {
  const argv = require('yargs')
    .usage('Usage: $0 [options]')
    .example('$0 -t https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/targetdb -b <bucket> -o <object> --cos_url <cos_endpoint>', 'Restore database from a bucket')
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
  const restoreTmpFile = tmp.fileSync();

  const config = {
    endpoint: cosEndpoint,
    credentials: new IBM_COS.SharedJSONFileCredentials(),
  };
  const COS = new IBM_COS.S3(config);
  restoreProcess(COS, restoreBucket, objectKey, targetUrl, cloudantApiKey, restoreTmpFile.name)
    .then(() => {
      debug('Restore completed successfully');
    })
    .catch((err) => {
      console.error('Restore failed:', err.message);
    });
}

/**
 * Main restore process
 */
async function restoreProcess(COS, restoreBucket, objectKey, targetUrl, cloudantApiKey, restoreTmpFilePath) {
  await objectAccessible(COS, restoreBucket, objectKey);

  await createRestoreFile(COS, restoreBucket, objectKey, restoreTmpFilePath);

  await restoreFromFile(restoreTmpFilePath, targetUrl, cloudantApiKey);
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
 * Download backup file from COS to local temporary file
 * @param {IBM_COS.S3} COS
 * @param {string} restoreBucket
 * @param {string} objectKey
 * @param {string} restoreTmpFilePath
 */
async function createRestoreFile(COS, restoreBucket, objectKey, restoreTmpFilePath) {
  debug(`Downloading from ${restoreBucket}/${objectKey} to ${restoreTmpFilePath}`);

  const inputStream = COS.getObject({
    Bucket: restoreBucket,
    Key: objectKey
  }).createReadStream({
    highWaterMark: 16 * 1024 * 1024 // 16MB buffer
  });

  const outputStream = fs.createWriteStream(restoreTmpFilePath, {
    highWaterMark: 16 * 1024 * 1024 // 16MB buffer
  });

  try {
    await pipeline(inputStream, outputStream);
    debug('Download completed successfully');
  } catch (err) {
    debug(err);
    throw new VError(err, 'Failed to download backup file from COS');
  }
}

/**
 * Restore from a local backup file to Cloudant database
 * @param {string} restoreFileName Path to backup file
 * @param {string} targetUrl URL of target database
 * @param {string} cloudantApiKey IAM API key for Cloudant
 */
async function restoreFromFile(restoreFileName, targetUrl, cloudantApiKey) {
  debug(`Starting restore from ${restoreFileName} to ${s(targetUrl)}`);

  const inputStream = fs.createReadStream(restoreFileName);

  // promisify restore
  const restorePromise = new Promise((resolve, reject) => {
    const params = {
      iamApiKey: cloudantApiKey,
      ...(process.env.CLOUDANT_IAM_TOKEN_URL && { iamTokenUrl: process.env.CLOUDANT_IAM_TOKEN_URL }),
    };

    const restoreStream = couchbackup.restore(
      inputStream,
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
