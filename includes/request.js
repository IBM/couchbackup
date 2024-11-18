// Copyright © 2017, 2024 IBM Corp. All rights reserved.
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

const pkg = require('../package.json');
const { CloudantV1, CouchdbSessionAuthenticator } = require('@ibm-cloud/cloudant');
const { IamAuthenticator, NoAuthAuthenticator } = require('ibm-cloud-sdk-core');
const debug = require('debug')('couchbackup:request');

const userAgent = 'couchbackup-cloudant/' + pkg.version + ' (Node.js ' +
      process.version + ')';

// An interceptor function to help augment error bodies with a little
// extra information so we can continue to use consistent messaging
// after the ugprade to @ibm-cloud/cloudant
function errorHelper(err) {
  debug('Entering error helper interceptor');
  let method;
  let requestUrl;
  if (err.response) {
    debug('Error has a response');
    if (err.response.config.url) {
      debug('Getting request URL and method for error');
      requestUrl = err.response.config.url;
      method = err.response.config.method;
    }
    debug('Applying response error message with status, url, and method');
    // Override the status text with an improved message
    let errorMsg = `${err.response.status} ${method} ${requestUrl}`;
    if (err.response.data) {
      debug('Found response data');
      // Check if we have a JSON response and try to get the error/reason
      if (err.response.headers['content-type'] === 'application/json') {
        debug('Response data is JSON');
        // Append the 'errors' message if available
        if (err.response.data.errors && err.response.data.errors.length > 0) {
          const originalError = err.response.data.errors[0];
          originalError.message = `${errorMsg} - Error: ${originalError.message}`;
        }
      } else {
        errorMsg += err.response.data;
        // Set a new message for use by the node-sdk-core
        // We use the errors array because it gets processed
        // ahead of all other service errors.
        err.response.data.errors = [{ message: errorMsg }];
      }
    }
  } else if (err.request) {
    debug('Error did not include a response');
    if (!err.message.includes(err.config.url)) {
      debug('Augmenting request error message with URL and method');
      // Augment the message with the URL and method
      // but don't do it again if we already have the URL.
      err.message = `${err.message}: ${err.config.method} ${err.config.url}`;
    } else {
      debug('Request error message already augmented');
    }
  }
  return Promise.reject(err);
}

// Interceptor function to add the User-Agent header.
// An interceptor is used because setting UA in headers
// option during client initialization means it gets overwritten
// by the default value during a request.
// This interceptor is further along the chain and able to
// replace the default value.
function userAgentHelper(requestConfig) {
  requestConfig.headers['User-Agent'] = userAgent;
  return requestConfig;
}

function newSimpleClient(rawUrl, opts) {
  const url = new URL(rawUrl);
  // Split the URL to separate service from database
  // Use origin as the "base" to remove auth elements
  const actUrl = new URL(url.pathname.substring(0, url.pathname.lastIndexOf('/')), url.origin);
  const dbName = url.pathname.substring(url.pathname.lastIndexOf('/') + 1);
  let authenticator;
  // Default to cookieauth unless an IAM key is provided
  if (opts.iamApiKey) {
    const iamAuthOpts = { apikey: opts.iamApiKey };
    if (opts.iamTokenUrl) {
      iamAuthOpts.url = opts.iamTokenUrl;
    }
    authenticator = new IamAuthenticator(iamAuthOpts);
  } else if (url.username) {
    authenticator = new CouchdbSessionAuthenticator({
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password)
    });
  } else {
    authenticator = new NoAuthAuthenticator();
  }
  const serviceOpts = {
    authenticator,
    timeout: opts.requestTimeout,
    // Axios performance options
    maxContentLength: -1
  };

  const service = new CloudantV1(serviceOpts);
  service.setServiceUrl(actUrl.toString());
  if (authenticator instanceof CouchdbSessionAuthenticator) {
    // Awkward workaround for known Couch issue with compression on _session requests
    // It is not feasible to disable compression on all requests with the amount of
    // data this lib needs to move, so override the property in the tokenManager instance.
    authenticator.tokenManager.requestWrapperInstance.compressRequestData = false;
  }
  return { service, dbName, actUrl };
}

function newClient(rawUrl, opts) {
  const { service, dbName, actUrl } = newSimpleClient(rawUrl, opts);
  const authenticator = service.getAuthenticator();

  // Add interceptors
  // Request interceptor to set the User-Agent header
  // Response interceptor to put URLs in error messages
  // Add for the token manager if present
  if (authenticator.tokenManager && authenticator.tokenManager.requestWrapperInstance) {
    authenticator.tokenManager.requestWrapperInstance.axiosInstance.interceptors.request.use(userAgentHelper, null);
    authenticator.tokenManager.requestWrapperInstance.axiosInstance.interceptors.response.use(null, errorHelper);
  }
  // and add for the client
  service.getHttpClient().interceptors.request.use(userAgentHelper, null);
  service.getHttpClient().interceptors.response.use(null, errorHelper);

  // Configure retries
  // Note: this MUST happen last after all other interceptors have been registered
  const maxRetries = 2; // for 3 total attempts
  service.enableRetries({ maxRetries });

  return { service, dbName, url: actUrl.toString() };
}

module.exports = {
  newSimpleClient,
  newClient
};
