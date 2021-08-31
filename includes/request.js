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
const http = require('http');
const https = require('https');
const { CloudantV1, CouchdbSessionAuthenticator } = require('@ibm-cloud/cloudant');
const { IamAuthenticator, NoAuthAuthenticator } = require('ibm-cloud-sdk-core');
const retryPlugin = require('retry-axios');

const userAgent = 'couchbackup-cloudant/' + pkg.version + ' (Node.js ' +
      process.version + ')';

module.exports = {
  client: function(rawUrl, opts) {
    const url = new URL(rawUrl);
    var protocol = (url.protocol.match(/^https/)) ? https : http;
    const keepAliveAgent = new protocol.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: opts.parallelism
    });
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
        username: url.username,
        password: url.password
      });
    } else {
      authenticator = new NoAuthAuthenticator();
    }
    const serviceOpts = {
      authenticator: authenticator,
      timeout: opts.requestTimeout,
      headers: { 'User-Agent': userAgent },
      // Axios performance options
      maxContentLength: -1
    };
    if (url.protocol === 'https') {
      serviceOpts.httpsAgent = keepAliveAgent;
    } else {
      serviceOpts.httpAgent = keepAliveAgent;
    }
    const service = new CloudantV1(serviceOpts);
    // Configure retries
    const maxRetries = 2; // for 3 total attempts
    service.requestWrapperInstance.axiosInstance.defaults.raxConfig = {
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
      instance: service.requestWrapperInstance.axiosInstance
    };
    retryPlugin.attach(service.requestWrapperInstance.axiosInstance);

    service.setServiceUrl(actUrl.toString());
    if (authenticator instanceof CouchdbSessionAuthenticator) {
      // Awkward workaround for known Couch issue with compression on _session requests
      // It is not feasible to disable compression on all requests with the amount of
      // data this lib needs to move, so override the property in the tokenManager instance.
      authenticator.tokenManager.requestWrapperInstance.compressRequestData = false;
    }
    return { service: service, db: dbName, url: actUrl.toString() };
  }
};
