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

var path = require('path');
var tmp = require('tmp');

/**
  Return API default settings.
*/
function apiDefaults() {
  return {
    parallelism: 5,
    bufferSize: 500,
    log: tmp.fileSync().name,
    resume: false,
    mode: 'full'
  };
}

/**
  Return CLI default settings.
*/
function cliDefaults() {
  var defaults = apiDefaults();

  // add additional legacy settings
  defaults.db = 'test';
  defaults.url = 'http://localhost:5984';

  return defaults;
}

/**
  Override settings **in-place** with environment variables.
*/
function applyEnvironmentVariables(opts) {
  // if we have a custom CouchDB url
  if (typeof process.env.COUCH_URL !== 'undefined') {
    opts.url = process.env.COUCH_URL;
  }

  // if we have a specified databases
  if (typeof process.env.COUCH_DATABASE !== 'undefined') {
    opts.db = process.env.COUCH_DATABASE;
  }

  // if we have a specified buffer size
  if (typeof process.env.COUCH_BUFFER_SIZE !== 'undefined') {
    opts.bufferSize = parseInt(process.env.COUCH_BUFFER_SIZE);
  }

  // if we have a specified parallelism
  if (typeof process.env.COUCH_PARALLELISM !== 'undefined') {
    opts.parallelism = parseInt(process.env.COUCH_PARALLELISM);
  }

  // if we have a specified log file
  if (typeof process.env.COUCH_LOG !== 'undefined') {
    opts.log = path.normalize(process.env.COUCH_LOG);
  }

  // if we are instructed to resume
  if (typeof process.env.COUCH_RESUME !== 'undefined' && process.env.COUCH_RESUME === 'true') {
    opts.resume = true;
  }

  // if we are given an output filename
  if (typeof process.env.COUCH_OUTPUT !== 'undefined') {
    opts.output = path.normalize(process.env.COUCH_OUTPUT);
  }

  // if we only want a shallow copy
  if (typeof process.env.COUCH_MODE !== 'undefined' && process.env.COUCH_MODE === 'shallow') {
    opts.mode = 'shallow';
  }

  // if we have a specified API key
  if (typeof process.env.CLOUDANT_IAM_API_KEY !== 'undefined') {
    opts.iamApiKey = process.env.CLOUDANT_IAM_API_KEY;
  }

  // if we have a specified IAM token endpoint
  if (typeof process.env.CLOUDANT_IAM_TOKEN_URL !== 'undefined') {
    opts.iamTokenUrl = process.env.CLOUDANT_IAM_TOKEN_URL;
  }
}

module.exports = {
  apiDefaults: apiDefaults,
  cliDefaults: cliDefaults,
  applyEnvironmentVariables: applyEnvironmentVariables
};
