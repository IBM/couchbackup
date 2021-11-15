// Copyright © 2017, 2021 IBM Corp. All rights reserved.
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
  const program = require('commander');

  // Option CLI defaults
  const defaults = config.cliDefaults();

  // Options set by environment variables
  const envVarOptions = {};
  config.applyEnvironmentVariables(envVarOptions);

  program
    .version(pkg.version)
    .description('Backup a CouchDB/Cloudant database to a backup text file.')
    .usage('[options...]')
    .option('-b, --buffer-size <n>',
      cliutils.getUsage('number of documents fetched at once', defaults.bufferSize),
      Number)
    .option('-d, --db <db>',
      cliutils.getUsage('name of the database to backup', defaults.db))
    .option('-k, --iam-api-key <API key>',
      cliutils.getUsage('IAM API key to access the Cloudant server'))
    .option('-l, --log <file>',
      cliutils.getUsage('file to store logging information during backup; invalid in "shallow" mode', 'a temporary file'),
      path.normalize)
    .option('-m, --mode <mode>',
      cliutils.getUsage('"shallow" if only a superficial backup is done (ignoring conflicts and revision tokens), else "full" for complete backup', defaults.mode),
      (mode) => { return mode.toLowerCase(); })
    .option('-o, --output <file>',
      cliutils.getUsage('file name to store the backup data', 'stdout'),
      path.normalize)
    .option('-p, --parallelism <n>',
      cliutils.getUsage('number of HTTP requests to perform in parallel when performing a backup; ignored in "shallow" mode', defaults.parallelism),
      Number)
    .option('-q, --quiet',
      cliutils.getUsage('suppress batch messages', defaults.quiet))
    .option('-r, --resume',
      cliutils.getUsage('continue a previous backup from its last known position; invalid in "shallow" mode', defaults.resume))
    .option('-t, --request-timeout <n>',
      cliutils.getUsage('milliseconds to wait for a response to a HTTP request before retrying the request', defaults.requestTimeout),
      Number)
    .option('-u, --url <url>',
      cliutils.getUsage('URL of the CouchDB/Cloudant server', defaults.url))
    .parse(process.argv);

  // Remove defaults that don't apply when using shallow mode
  if (program.opts().mode === 'shallow' || envVarOptions.mode === 'shallow') {
    delete defaults.parallelism;
    delete defaults.log;
    delete defaults.resume;
  }

  // Apply the options in order so that the CLI overrides env vars and env variables
  // override defaults.
  const opts = Object.assign({}, defaults, envVarOptions, program.opts());

  if (opts.resume && (opts.log === defaults.log)) {
    // If resuming and the log file arg is the newly generated tmp name from defaults then we know that --log wasn't specified.
    // We have to do this check here for the CLI case because of the default.
    error.terminationCallback(new error.BackupError('NoLogFileName', 'To resume a backup, a log file must be specified'));
  }

  return opts;
}

function parseRestoreArgs() {
  const program = require('commander');

  // Option CLI defaults
  const defaults = config.cliDefaults();

  // Options set by environment variables
  const envVarOptions = {};
  config.applyEnvironmentVariables(envVarOptions);

  program
    .version(pkg.version)
    .description('Restore a CouchDB/Cloudant database from a backup text file.')
    .usage('[options...]')
    .option('-b, --buffer-size <n>',
      cliutils.getUsage('number of documents restored at once', defaults.bufferSize),
      Number)
    .option('-d, --db <db>',
      cliutils.getUsage('name of the new, existing database to restore to', defaults.db))
    .option('-k, --iam-api-key <API key>',
      cliutils.getUsage('IAM API key to access the Cloudant server'))
    .option('-p, --parallelism <n>',
      cliutils.getUsage('number of HTTP requests to perform in parallel when restoring a backup', defaults.parallelism),
      Number)
    .option('-q, --quiet',
      cliutils.getUsage('suppress batch messages', defaults.quiet))
    .option('-t, --request-timeout <n>',
      cliutils.getUsage('milliseconds to wait for a response to a HTTP request before retrying the request', defaults.requestTimeout),
      Number)
    .option('-u, --url <url>',
      cliutils.getUsage('URL of the CouchDB/Cloudant server', defaults.url))
    .parse(process.argv);

  // Apply the options in order so that the CLI overrides env vars and env variables
  // override defaults.
  const opts = Object.assign({}, defaults, envVarOptions, program.opts());

  return opts;
}

module.exports = {
  parseBackupArgs: parseBackupArgs,
  parseRestoreArgs: parseRestoreArgs
};
