// Copyright © 2017 IBM Corp. All rights reserved.
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

var theconfig = require('./defaults.js').legacyDefaults();
var path = require('path');

// if we have a custom CouchDB url
if (typeof process.env.COUCH_URL !== 'undefined') {
  theconfig.COUCH_URL = process.env.COUCH_URL;
}

// if we have a specified databases
if (typeof process.env.COUCH_DATABASE !== 'undefined') {
  theconfig.COUCH_DATABASE = process.env.COUCH_DATABASE;
}

// if we have a specified buffer size
if (typeof process.env.COUCH_BUFFER_SIZE !== 'undefined') {
  theconfig.COUCH_BUFFER_SIZE = parseInt(process.env.COUCH_BUFFER_SIZE);
}

// if we have a specified parallelism
if (typeof process.env.COUCH_PARALLELISM !== 'undefined') {
  theconfig.COUCH_PARALLELISM = parseInt(process.env.COUCH_PARALLELISM);
}

// if we have a specified log file
if (typeof process.env.COUCH_LOG !== 'undefined') {
  theconfig.COUCH_LOG = path.normalize(process.env.COUCH_LOG);
}

// if we are instructed to resume
if (typeof process.env.COUCH_RESUME !== 'undefined' && process.env.COUCH_RESUME === 'true') {
  theconfig.COUCH_RESUME = true;
}

// if we are given an output filename
if (typeof process.env.COUCH_OUTPUT !== 'undefined') {
  theconfig.COUCH_OUTPUT = path.normalize(process.env.COUCH_OUTPUT);
}

// if we only want a shallow copy
if (typeof process.env.COUCH_MODE !== 'undefined' && process.env.COUCH_MODE === 'shallow') {
  theconfig.COUCH_MODE = 'shallow';
}

module.exports = theconfig;
