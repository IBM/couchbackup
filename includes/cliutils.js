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

/**
 * Utility methods for the command line interface.
 * @module cliutils
 * @see module:cliutils
 */

const url = require('url');

module.exports = {

  /**
   * Combine a base URL and a database name, ensuring at least single slash
   * between root and database name. This allows users to have Couch behind
   * proxies that mount Couch's / endpoint at some other mount point.
   * @param {string} root - root URL
   * @param {string} databaseName - database name
   * @return concatenated URL.
   *
   * @private
   */
  databaseUrl: function databaseUrl(root, databaseName) {
    if (!root.endsWith('/')) {
      root = root + '/';
    }
    return new url.URL(encodeURIComponent(databaseName), root).toString();
  },

  /**
   * Generate CLI argument usage text.
   *
   * @param {string} description - argument description.
   * @param {string} defaultValue - default argument value.
   *
   * @private
   */
  getUsage: function getUsage(description, defaultValue) {
    return `${description} ${defaultValue !== undefined ? ` (default: ${defaultValue})` : ''}`;
  }
};
