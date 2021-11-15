// Copyright © 2017, 2018 IBM Corp. All rights reserved.
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

// Small script which backs up a Cloudant or CouchDB database to an S3
// bucket via a stream rather than on-disk file.
//
// The script generates the backup object name by combining together the path
// part of the database URL and the current time.

'use strict';

const stream = require('stream');
const url = require('url');

const AWS = require('aws-sdk');
const couchbackup = require('@cloudant/couchbackup');
const debug = require('debug')('s3-backup');
const VError = require('verror').VError;

/*
  Main function, run from base of file.
*/
function main() {
  const argv = require('yargs')
    .usage('Usage: $0 [options]')
    .example('$0 -s https://user:pass@host/db -b <bucket>', 'Backup db to bucket')
    .options({
      source: { alias: 's', nargs: 1, demandOption: true, describe: 'Source database URL' },
      bucket: { alias: 'b', nargs: 1, demandOption: true, describe: 'Destination bucket' },
      prefix: { alias: 'p', nargs: 1, describe: 'Prefix for backup object key', default: 'couchbackup' },
      s3url: { nargs: 1, describe: 'S3 endpoint URL' },
      awsprofile: { nargs: 1, describe: 'The profile section to use in the ~/.aws/credentials file', default: 'default' }
    })
    .help('h').alias('h', 'help')
    .epilog('Copyright (C) IBM 2017')
    .argv;

  const sourceUrl = argv.source;
  const backupName = new url.URL(sourceUrl).pathname.split('/').filter(function(x) { return x; }).join('-');
  const backupBucket = argv.bucket;
  const backupKeyPrefix = `${argv.prefix}-${backupName}`;
  const shallow = argv.shallow;

  const backupKey = `${backupKeyPrefix}-${new Date().toISOString()}`;

  const s3Endpoint = argv.s3url;
  const awsProfile = argv.awsprofile;

  // Creds are from ~/.aws/credentials, environment etc. (see S3 docs).
  const awsOpts = {
    signatureVersion: 'v4',
    credentials: new AWS.SharedIniFileCredentials({ profile: awsProfile })
  };
  if (typeof s3Endpoint !== 'undefined') {
    awsOpts.endpoint = new AWS.Endpoint(s3Endpoint);
  }
  const s3 = new AWS.S3(awsOpts);

  debug(`Creating a new backup of ${s(sourceUrl)} at ${backupBucket}/${backupKey}...`);
  bucketAccessible(s3, backupBucket)
    .then(() => {
      return backupToS3(sourceUrl, s3, backupBucket, backupKey, shallow);
    })
    .then(() => {
      debug('done.');
    })
    .catch((reason) => {
      debug(`Error: ${reason}`);
      process.exit(1);
    });
}

/**
 * Return a promise that resolves if the bucket is available and
 * rejects if not.
 *
 * @param {any} s3 S3 client object
 * @param {any} bucketName Bucket name
 * @returns Promise
 */
function bucketAccessible(s3, bucketName) {
  return new Promise(function(resolve, reject) {
    const params = {
      Bucket: bucketName
    };
    s3.headBucket(params, function(err, data) {
      if (err) {
        reject(new VError(err, 'S3 bucket not accessible'));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Backup directly from Cloudant to an object store object via a stream.
 *
 * @param {any} sourceUrl URL of database
 * @param {any} s3Client Object store client
 * @param {any} s3Bucket Backup destination bucket
 * @param {any} s3Key Backup destination key name (shouldn't exist)
 * @param {any} shallow Whether to use the couchbackup `shallow` mode
 * @returns Promise
 */
function backupToS3(sourceUrl, s3Client, s3Bucket, s3Key, shallow) {
  return new Promise((resolve, reject) => {
    debug(`Setting up S3 upload to ${s3Bucket}/${s3Key}`);

    // A pass through stream that has couchbackup's output
    // written to it and it then read by the S3 upload client.
    // It has a 64MB highwater mark to allow for fairly
    // uneven network connectivity.
    const streamToUpload = new stream.PassThrough({ highWaterMark: 67108864 });

    // Set up S3 upload.
    const params = {
      Bucket: s3Bucket,
      Key: s3Key,
      Body: streamToUpload
    };
    s3Client.upload(params, function(err, data) {
      debug('Object store upload done');
      if (err) {
        debug(err);
        reject(new VError(err, 'Object store upload failed'));
        return;
      }
      debug('Object store upload succeeded');
      debug(data);
      resolve();
    }).httpUploadProgress = (progress) => {
      debug(`Object store upload progress: ${progress}`);
    };

    debug(`Starting streaming data from ${s(sourceUrl)}`);
    couchbackup.backup(
      sourceUrl,
      streamToUpload,
      (err, obj) => {
        if (err) {
          debug(err);
          reject(new VError(err, 'CouchBackup failed with an error'));
          return;
        }
        debug(`Download from ${s(sourceUrl)} complete.`);
        streamToUpload.end(); // must call end() to complete upload.
        // resolve() is called by the upload
      }
    );
  });
}

/**
 * Remove creds from a URL, e.g., before logging
 *
 * @param {string} url URL to safen
 */
function s(originalUrl) {
  const parts = new url.URL(originalUrl);
  return url.format(parts, { auth: false });
}

main();
