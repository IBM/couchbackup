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

/* global after before describe */
'use strict';

const url = require('url');
const toxy = require('toxy');
// Import the common hooks
require('../test/hooks.js');

const tpoisons = toxy.poisons;
const trules = toxy.rules;

function setupProxy(poison) {
  const backendUrl = new url.URL(process.env.COUCH_BACKEND_URL);
  const proxy = toxy({
    auth: `${backendUrl.username}:${backendUrl.password}`,
    changeOrigin: true
  });

  // Forward traffic to DB
  proxy.forward(process.env.COUCH_BACKEND_URL);

  switch (poison) {
    case 'normal':
      // No poisons to add
      break;
    case 'bandwidth-limit':
      // https://github.com/h2non/toxy#bandwidth
      // Note the implementation of bandwidth is simplistic and the threshold
      // delay is applied to every write of the buffer, so use the smallest
      // delay possible and adjust the rate using the bytes size instead.
      proxy
        .poison(tpoisons.bandwidth({ bytes: 512, threshold: 1 })); // 0.5 MB/s
      break;
    case 'latency':
      // https://github.com/h2non/toxy#latency
      proxy
        .poison(tpoisons.latency({ max: 1500, min: 250 }))
        .withRule(trules.probability(60));
      break;
    case 'slow-read':
      // https://github.com/h2non/toxy#slow-read
      // Note this only impacts read of data from requests so only for non-GET
      // In practice this means that it impacts restore much more than backup
      // since although backup POSTs to _bulk_get the content is much smaller
      // than what is POSTed to _bulk_docs for a restore.
      // Similarly to bandwidth-limit use a 1 ms threshold
      proxy
        .poison(tpoisons.slowRead({ chunk: 256, threshold: 1 }))
        // Slow read for 10 % of the time e.g. 10 ms in every 100
        .withRule(trules.timeThreshold({ duration: 10, period: 100 }));
      break;
    case 'rate-limit':
      // https://github.com/h2non/toxy#rate-limit
      // Simulate the Cloudant free plan with 20 lookups ps and 10 writes ps
      proxy.post('/*/_bulk_get')
        .poison(tpoisons.rateLimit({ limit: 20, threshold: 1000 }));
      proxy.post('/*/_bulk_docs')
        .poison(tpoisons.rateLimit({ limit: 10, threshold: 1000 }));
      break;
    default:
      throw Error('Unknown toxy poison ' + poison);
  }

  // Catch remaining traffic
  proxy.all('/*');
  return proxy;
}

const poisons = [
  'normal',
  'bandwidth-limit',
  'latency',
  'slow-read',
  'rate-limit'
];

poisons.forEach(function(poison) {
  describe('unreliable network tests (using toxy poison ' + poison + ')', function() {
    let proxy;

    before('start toxy server', function() {
      proxy = setupProxy(poison);
      console.log('Using toxy poison ' + poison);

      // For these tests COUCH_URL points to the toxy proxy on localhost whereas
      // COUCH_BACKEND_URL is the real CouchDb instance.
      const toxyUrl = new url.URL(process.env.COUCH_URL);
      // Listen on the specified hostname only, so if using localhost we don't
      // need external connections.
      proxy.listen(toxyUrl.port, toxyUrl.hostname);
    });

    after('stop toxy server', function() {
      proxy.close();
    });

    delete require.cache[require.resolve('../test/ci_e2e.js')];
    require('../test/ci_e2e.js');
  });
});
