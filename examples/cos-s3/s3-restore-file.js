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

// Small script which restores a Cloudant or CouchDB database from an S3 compatible
// bucket using an intermediary file on disk

const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { fromIni } = require('@aws-sdk/credential-providers');
const VError = require('verror').VError;
const { restore } = require('@cloudant/couchbackup');
const debug = require('debug')('couchbackup-s3');
const url = require('url');
const fs = require('fs');
const tmp = require('tmp');
const { pipeline } = require('stream/promises');

function main() {
  const argv = require('yargs')
    .usage('Usage: $0 [options]')
    .example('$0 -t https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/targetdb -b <bucket> -o <object> --s3_url <s3_endpoint>', 'Restore database from a bucket using intermediate file')
    .options({
      target: { alias: 't', nargs: 1, demandOption: true, describe: 'Target database URL' },
      bucket: { alias: 'b', nargs: 1, demandOption: true, describe: 'Source bucket containing backup' },
      object: { alias: 'o', nargs: 1, demandOption: true, describe: 'Backup Object name in S3 instance' },
      s3_url: { nargs: 1, describe: 'S3 endpoint URL' },
      awsprofile: { nargs: 1, describe: 'The profile section to use in the ~/.aws/credentials file', default: 'default' },
    })
    .help('h').alias('h', 'help')
    .epilog('Copyright (C) IBM 2025')
    .argv;

  const cloudantURL = argv.target;
  const restoreBucket = argv.bucket;
  const restoreObject = argv.object;
  const s3Endpoint = argv.s3_url;
  const awsProfile = argv.awsprofile;
  const cloudantApiKey = process.env.CLOUDANT_IAM_API_KEY;
  const restoreTmpFile = tmp.fileSync();

  const awsOpts = {
    signatureVersion: 'v4',
    credentials: fromIni({ profile: awsProfile })
  };
  if (typeof s3Endpoint !== 'undefined') {
    awsOpts.endpoint = s3Endpoint;
  }
  const s3 = new S3Client(awsOpts);

  debug(`Restoring from ${restoreBucket}/${restoreObject} to ${cloudantURL} via file`);

  // Start the restore process
  restoreProcess(s3, restoreBucket, restoreObject, cloudantURL, cloudantApiKey, restoreTmpFile.name)
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
 * Main restore process
 */
async function restoreProcess(s3, restoreBucket, restoreObject, targetUrl, cloudantApiKey, restoreTmpFilePath) {
  await objectAccessible(s3, restoreBucket, restoreObject);

  await createRestoreFile(s3, restoreBucket, restoreObject, restoreTmpFilePath);

  await restoreFromFile(restoreTmpFilePath, targetUrl, cloudantApiKey);
}

/**
 * Check if object is accessible in S3
 * @param {S3Client} s3
 * @param {string} bucketName
 * @param {string} objectKey
 */
async function objectAccessible(s3, bucketName, objectKey) {
  try {
    await s3.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: objectKey
    }));
    debug(`Object '${objectKey}' is accessible`);
  } catch (reason) {
    debug(reason);
    throw new VError(reason, 'Object is not accessible');
  }
}

/**
 * Download backup file from S3 to local temporary file with optimized buffer sizes
 * @param {S3Client} s3
 * @param {string} restoreBucket
 * @param {string} objectKey
 * @param {string} restoreTmpFilePath
 */
async function createRestoreFile(s3, restoreBucket, objectKey, restoreTmpFilePath) {
  debug(`Downloading from ${restoreBucket}/${objectKey} to ${restoreTmpFilePath}`);

  const response = await s3.send(new GetObjectCommand({
    Bucket: restoreBucket,
    Key: objectKey
  }));

  const inputStream = response.Body;

  const outputStream = fs.createWriteStream(restoreTmpFilePath, {
    highWaterMark: 16 * 1024 * 1024 // 16MB buffer for efficient disk writes
  });

  try {
    await pipeline(inputStream, outputStream);
    debug('Download completed successfully');
  } catch (err) {
    debug(err);
    throw new VError(err, 'Failed to download backup file from S3');
  }
}

/**
 * Restore from a local backup file to Cloudant database with optimized buffer
 * @param {string} restoreFileName Path to backup file
 * @param {string} targetUrl URL of target database
 * @param {string} cloudantApiKey IAM API key for Cloudant
 */
async function restoreFromFile(restoreFileName, targetUrl, cloudantApiKey) {
  debug(`Starting restore from ${restoreFileName} to ${s(targetUrl)}`);

  const inputStream = fs.createReadStream(restoreFileName, {
    highWaterMark: 16 * 1024 * 1024 // 16MB buffer for efficient file reading
  });

  const restorePromise = new Promise((resolve, reject) => {
    const params = {
      iamApiKey: cloudantApiKey,
      ...(process.env.CLOUDANT_IAM_TOKEN_URL && { iamTokenUrl: process.env.CLOUDANT_IAM_TOKEN_URL }),
    };

    const restoreStream = restore(
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
