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
// bucket, using an intermediary file on disk.
//
// The script generates the backup object name by combining together the path
// part of the database URL and the current time.

'use strict';

const stream = require('stream');
const fs = require('fs');
const url = require('url');

const AWS = require('aws-sdk');
const couchbackup = require('@cloudant/couchbackup');
const debug = require('debug')('s3-backup');
const tmp = require('tmp');
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
  const backupBucket = argv.bucket;
  const backupName = new url.URL(sourceUrl).pathname.split('/').filter(function(x) { return x; }).join('-');
  const backupKeyPrefix = `${argv.prefix}-${backupName}`;

  const backupKey = `${backupKeyPrefix}-${new Date().toISOString()}`;
  const backupTmpFile = tmp.fileSync();

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
      return createBackupFile(sourceUrl, backupTmpFile.name);
    })
    .then(() => {
      return uploadNewBackup(s3, backupTmpFile.name, backupBucket, backupKey);
    })
    .then(() => {
      debug('Backup successful!');
      backupTmpFile.removeCallback();
      debug('done.');
    })
    .catch((reason) => {
      debug(`Error: ${reason}`);
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
 * Use couchbackup to create a backup of the specified database to a file path.
 *
 * @param {any} sourceUrl Database URL
 * @param {any} backupTmpFilePath Path to write file
 * @returns Promise
 */
function createBackupFile(sourceUrl, backupTmpFilePath) {
  return new Promise((resolve, reject) => {
    couchbackup.backup(
      sourceUrl,
      fs.createWriteStream(backupTmpFilePath),
      (err) => {
        if (err) {
          return reject(new VError(err, 'CouchBackup process failed'));
        }
        debug('couchbackup to file done; uploading to S3');
        resolve('creating backup file complete');
      }
    );
  });
}

/**
 * Upload a backup file to an S3 bucket.
 *
 * @param {any} s3 Object store client
 * @param {any} backupTmpFilePath Path of backup file to write.
 * @param {any} bucket Object store bucket name
 * @param {any} key Object store key name
 * @returns Promise
 */
function uploadNewBackup(s3, backupTmpFilePath, bucket, key) {
  return new Promise((resolve, reject) => {
    debug(`Uploading from ${backupTmpFilePath} to ${bucket}/${key}`);

    function uploadFromStream(s3, bucket, key) {
      const pass = new stream.PassThrough();

      const params = {
        Bucket: bucket,
        Key: key,
        Body: pass
      };
      s3.upload(params, function(err, data) {
        debug('S3 upload done');
        if (err) {
          debug(err);
          reject(new VError(err, 'Upload failed'));
          return;
        }
        debug('Upload succeeded');
        debug(data);
        resolve();
      }).httpUploadProgress = (progress) => {
        debug(`S3 upload progress: ${progress}`);
      };

      return pass;
    }

    const inputStream = fs.createReadStream(backupTmpFilePath);
    const s3Stream = uploadFromStream(s3, bucket, key);
    inputStream.pipe(s3Stream);
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
