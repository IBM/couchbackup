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

const pkg = require('../package.json');
const stream = require('stream');
const { CloudantV1, CouchdbSessionAuthenticator } = require('@ibm-cloud/cloudant');
const { IamAuthenticator, NoAuthAuthenticator } = require('ibm-cloud-sdk-core');
const retryPlugin = require('retry-axios');

const userAgent = 'couchbackup-cloudant/' + pkg.version + ' (Node.js ' +
      process.version + ')';

// Class for streaming _changes error responses into
// In general the response is a small error/reason JSON object
// so it is OK to have this in memory.
class ResponseWriteable extends stream.Writable {
  constructor(options) {
    super(options);
    this.data = [];
  }

  _write(chunk, encoding, callback) {
    this.data.push(chunk);
    callback();
  }

  stringBody() {
    return Buffer.concat(this.data).toString();
  }
}

// An interceptor function to help augment error bodies with a little
// extra information so we can continue to use consistent messaging
// after the ugprade to @ibm-cloud/cloudant
const errorHelper = async function(err) {
  let method;
  let requestUrl;
  if (err.response) {
    if (err.response.config.url) {
      requestUrl = err.response.config.url;
      method = err.response.config.method;
    }
    // Override the status text with an improved message
    let errorMsg = `${err.response.status} ${err.response.statusText || ''}: ` +
    `${method} ${requestUrl}`;
    if (err.response.data) {
      // Check if we have a JSON response and try to get the error/reason
      if (err.response.headers['content-type'] === 'application/json') {
        if (!err.response.data.error && err.response.data.pipe) {
          // If we didn't find a JSON object with `error` then we might have a stream response.
          // Detect the stream by the presence of `pipe` and use it to get the body and parse
          // the error information.
          const p = new Promise((resolve, reject) => {
            const errorBody = new ResponseWriteable();
            err.response.data.pipe(errorBody)
              .on('finish', () => { resolve(JSON.parse(errorBody.stringBody())); })
              .on('error', () => { reject(err); });
          });
          // Replace the stream on the response with the parsed object
          err.response.data = await p;
        }
        // Append the error/reason if available
        if (err.response.data.error) {
          // Override the status text with our more complete message
          errorMsg += ` - Error: ${err.response.data.error}`;
          if (err.response.data.reason) {
            errorMsg += `, Reason: ${err.response.data.reason}`;
          }
        }
      } else {
        errorMsg += err.response.data;
      }
      // Set a new message for use by the node-sdk-core
      // We use the errors array because it gets processed
      // ahead of all other service errors.
      err.response.data.errors = [{ message: errorMsg }];
    }
  } else if (err.request) {
    if (!err.message.includes(err.config.url)) {
      // Augment the message with the URL and method
      // but don't do it again if we already have the URL.
      err.message = `${err.message}: ${err.config.method} ${err.config.url}`;
    }
  }
  return Promise.reject(err);
};

module.exports = {
  client: function(rawUrl, opts) {
    const url = new URL(rawUrl);
    // Split the URL to separate service from database
    // Use origin as the "base" to remove auth elements
    const actUrl = new URL(url.pathname.substr(0, url.pathname.lastIndexOf('/')), url.origin);
    const dbName = url.pathname.substr(url.pathname.lastIndexOf('/') + 1);
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
      authenticator: authenticator,
      timeout: opts.requestTimeout,
      // Axios performance options
      maxContentLength: -1
    };

    const service = new CloudantV1(serviceOpts);
    // Configure retries
    const maxRetries = 2; // for 3 total attempts
    service.getHttpClient().defaults.raxConfig = {
      // retries for status codes
      retry: maxRetries,
      // retries for non-response e.g. ETIMEDOUT
      noResponseRetries: maxRetries,
      backoffType: 'exponential',
      httpMethodsToRetry: ['GET', 'HEAD', 'POST'],
      statusCodesToRetry: [
        [429, 429],
        [500, 599]
      ],
      shouldRetry: err => {
        const cfg = retryPlugin.getConfig(err);
        // cap at max retries regardless of response/non-response type
        if (cfg.currentRetryAttempt >= maxRetries) {
          return false;
        } else {
          return retryPlugin.shouldRetryRequest(err);
        }
      },
      instance: service.getHttpClient()
    };
    retryPlugin.attach(service.getHttpClient());

    service.setServiceUrl(actUrl.toString());
    if (authenticator instanceof CouchdbSessionAuthenticator) {
      // Awkward workaround for known Couch issue with compression on _session requests
      // It is not feasible to disable compression on all requests with the amount of
      // data this lib needs to move, so override the property in the tokenManager instance.
      authenticator.tokenManager.requestWrapperInstance.compressRequestData = false;
    }
    if (authenticator.tokenManager && authenticator.tokenManager.requestWrapperInstance) {
      authenticator.tokenManager.requestWrapperInstance.axiosInstance.interceptors.response.use(null, errorHelper);
    }
    // Add error interceptors to put URLs in error messages
    service.getHttpClient().interceptors.response.use(null, errorHelper);

    // Add request interceptor to add user-agent (adding it with custom request headers gets overwritten)
    service.getHttpClient().interceptors.request.use(function(requestConfig) {
      requestConfig.headers['User-Agent'] = userAgent;
      return requestConfig;
    }, null);

    return { service: service, db: dbName, url: actUrl.toString() };
  }
};
