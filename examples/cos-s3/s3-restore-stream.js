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
// bucket via direct stream rather than on-disk file

const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { fromIni } = require('@aws-sdk/credential-providers');
const VError = require('verror').VError;
const { restore } = require('@cloudant/couchbackup');
const debug = require('debug')('couchbackup-s3');
const url = require('url');

/*
  Main function, run from base of file.
*/

function main() {
  const argv = require('yargs')
    .usage('Usage: $0 [options]')
    .example('$0 -t https://~replaceWithYourUniqueHost~.cloudantnosqldb.appdomain.cloud/targetdb -b <bucket> -o <object> --s3_url <s3_endpoint>', 'Restore database from a bucket via direct streaming')
    .options({
      target: { alias: 't', nargs: 1, demandOption: true, describe: 'Target database URL' },
      bucket: { alias: 'b', nargs: 1, demandOption: true, describe: 'Source bucket containing backup' },
      object: { alias: 'o', nargs: 1, demandOption: true, describe: 'Backup Object name in S3 instance' },
      cos_url: { nargs: 1, describe: 'S3 endpoint URL' },
      awsprofile: { nargs: 1, describe: 'The profile section to use in the ~/.aws/credentials file', default: 'default' }
    })
    .help('h').alias('h', 'help')
    .epilog('Copyright (C) IBM 2025')
    .argv;

  const cloudantURL = argv.target;
  const restoreBucket = argv.bucket;
  const restoreObject = argv.object;
  const s3Endpoint = argv.s3url;

  const awsProfile = argv.awsprofile;
  const cloudantApiKey = process.env.CLOUDANT_IAM_API_KEY;

  const awsOpts = {
    signatureVersion: 'v4',
    credentials: fromIni({ profile: awsProfile })
  };
  if (typeof s3Endpoint !== 'undefined') {
    awsOpts.endpoint = s3Endpoint;
  }
  const s3 = new S3Client(awsOpts);

  debug(`Restoring from ${restoreBucket}/${restoreObject} to ${cloudantURL}`);

  objectAccessible(s3, restoreBucket, restoreObject)
    .then(() => {
      return restoreFromS3(s3, restoreBucket, restoreObject, cloudantURL, cloudantApiKey);
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
 *
 * @param {S3Client} S3
 * @param {any} restoreBucket
 * @param {any} objectKey
 */
async function objectAccessible(S3, restoreBucket, objectKey) {
  try {
    await S3.send(new HeadObjectCommand({
      Bucket: restoreBucket,
      Key: objectKey
    }));
    debug(`Object '${objectKey}' is accessible`);
  } catch (reason) {
    debug(reason);
    throw new VError(reason, 'Object is not accessible');
  }
}

/**
 * Restore directly from a backup file on S3 to a new and empty CouchDB or Cloudant database.
 *
 * @param {S3Client} s3Client Object store client
 * @param {string} s3Bucket Backup source bucket
 * @param {string} s3Key Backup file name on S3
 * @param {string} targetUrl URL of database
 * @param {string} cloudantApiKey IAM API key for Cloudant authentication
 */
async function restoreFromS3(s3Client, s3Bucket, s3Key, targetUrl, cloudantApiKey) {
  debug(`Starting direct stream restore from ${s3Bucket}/${s3Key} to ${s(targetUrl)}`);
  const inputStream = await s3Client.send(new GetObjectCommand({
    Bucket: s3Bucket,
    Key: s3Key
  }));

  const restorePromise = new Promise((resolve, reject) => {
    const params = {
      iamApiKey: cloudantApiKey,
      ...(process.env.CLOUDANT_IAM_TOKEN_URL && { iamTokenUrl: process.env.CLOUDANT_IAM_TOKEN_URL }),
    };
    const restoreStream = restore(
      inputStream.Body,
      targetUrl,
      params,
      (err, done) => {
        if (err) {
          reject(err);
        } else {
          resolve(done);
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
