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
'use strict';

const cliutils = require('./cliutils.js');
const config = require('./config.js');
const error = require('./error.js');
const path = require('path');
const pkg = require('../package.json');

function parseBackupArgs() {
  var program = require('commander');

  var defaults = config.cliDefaults();
  config.applyEnvironmentVariables(defaults);

  program
    .version(pkg.version)
    .description('Backup a CouchDB/Cloudant database to a backup text file.')
    .usage('[options...]')
    .option('-b, --buffer-size <n>',
      cliutils.getUsage('number of documents fetched at once', defaults.bufferSize),
      Number, defaults.bufferSize)
    .option('-d, --db <db>',
      cliutils.getUsage('name of the database to backup', defaults.db),
      defaults.db)
    .option('-k, --iam-api-key <API key>',
      cliutils.getUsage('IAM API key to access the Cloudant server'),
      defaults.iamApiKey)
    .option('-l, --log <file>',
      cliutils.getUsage('file to store logging information during backup', 'a temporary file'),
      path.normalize, defaults.log)
    .option('-m, --mode <mode>',
      cliutils.getUsage('"shallow" if only a superficial backup is done (ignoring conflicts and revision tokens), else "full" for complete backup', defaults.mode),
      (mode) => { return mode.toLowerCase(); }, defaults.mode)
    .option('-o, --output <file>',
      cliutils.getUsage('file name to store the backup data', 'stdout'),
      path.normalize, defaults.output)
    .option('-p, --parallelism <n>',
      cliutils.getUsage('number of HTTP requests to perform in parallel when performing a backup', defaults.parallelism),
      Number, defaults.parallelism)
    .option('-r, --resume',
      cliutils.getUsage('continue a previous backup from its last known position', defaults.resume),
      defaults.resume)
    .option('-u, --url <url>',
      cliutils.getUsage('URL of the CouchDB/Cloudant server', defaults.url),
      defaults.url)
    .parse(process.argv);

  if (program.resume && (program.log === defaults.log)) {
    // If resuming and the log file arg is the newly generated tmp name from defaults then we know that --log wasn't specified.
    // We have to do this check here for the CLI case because of the default.
    error.terminationCallback(new error.BackupError('NoLogFileName', 'To resume a backup, a log file must be specified'));
  }

  return program;
}

function parseRestoreArgs() {
  var program = require('commander');

  var defaults = config.cliDefaults();
  config.applyEnvironmentVariables(defaults);

  program
    .version(pkg.version)
    .description('Restore a CouchDB/Cloudant database from a backup text file.')
    .usage('[options...]')
    .option('-b, --buffer-size <n>',
      cliutils.getUsage('number of documents restored at once', defaults.bufferSize),
      Number, defaults.bufferSize)
    .option('-d, --db <db>',
      cliutils.getUsage('name of the new, existing database to restore to', defaults.db),
      defaults.db)
    .option('-k, --iam-api-key <API key>',
      cliutils.getUsage('IAM API key to access the Cloudant server'),
      defaults.iamApiKey)
    .option('-p, --parallelism <n>',
      cliutils.getUsage('number of HTTP requests to perform in parallel when restoring a backup', defaults.parallelism),
      Number, defaults.parallelism)
    .option('-u, --url <url>',
      cliutils.getUsage('URL of the CouchDB/Cloudant server', defaults.url),
      defaults.url)
    .parse(process.argv);

  return program;
}

module.exports = {
  parseBackupArgs: parseBackupArgs,
  parseRestoreArgs: parseRestoreArgs
};
