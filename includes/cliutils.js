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
    return url.resolve(root, encodeURIComponent(databaseName));
  },

  /**
   * Copy an attribute between objects if it is defined on the source,
   * overwriting any existing property on the target.
   *
   * @param {object} src - source object.
   * @param {string} srcProperty - source property name.
   * @param {object} target - target object.
   * @param {string} targetProperty - target property name.
   *
   * @private
   */
  copyIfDefined: function copyIfDefined(src, srcProperty, target, targetProperty) {
    if (typeof src[srcProperty] !== 'undefined') {
      target[targetProperty] = src[srcProperty];
    }
  }
};
