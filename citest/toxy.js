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

const tpoisons = toxy.poisons;
const trules = toxy.rules;

function setupProxy(poison) {
  var proxy = toxy({
    auth: url.parse(process.env.TEST_PROXY_BACKEND).auth,
    changeOrigin: true
  });

  switch (poison) {
    case 'normal':
      proxy
        .forward(process.env.TEST_PROXY_BACKEND)
        .all('/*');
      break;
    case 'abort':
      // https://github.com/h2non/toxy#abort-connection
      proxy
        .forward(process.env.TEST_PROXY_BACKEND)
        .poison(tpoisons.abort())
        .withRule(trules.timeThreshold({ duration: 1000, threshold: 5000 }))
        .all('/*');
      break;
    case 'bandwidth-limit':
      // https://github.com/h2non/toxy#bandwidth
      proxy
        .forward(process.env.TEST_PROXY_BACKEND)
        .poison(tpoisons.bandwidth({ bps: 2048 }))
        .all('/*');
      break;
    case 'latency':
      // https://github.com/h2non/toxy#latency
      proxy
        .forward(process.env.TEST_PROXY_BACKEND)
        .poison(tpoisons.latency({ max: 20000, min: 100 }))
        .withRule(trules.probability(50))
        .all('/*');
      break;
    case 'rate-limit':
      // https://github.com/h2non/toxy#rate-limit
      proxy
        .forward(process.env.TEST_PROXY_BACKEND)
        .poison(tpoisons.rateLimit({ limit: 5, threshold: 1000 }))
        .withRule(trules.probability(90))
        .all('/*');
      break;
    case 'slow-read':
      // https://github.com/h2non/toxy#slow-read
      proxy
        .forward(process.env.TEST_PROXY_BACKEND)
        .poison(tpoisons.slowRead({ bps: 1024, threshold: 100 }))
        .withRule(trules.probability(90))
        .all('/*');
      break;
    case 'unexpected-errors':
      // https://github.com/h2non/toxy#inject-response
      proxy
        .forward(process.env.TEST_PROXY_BACKEND)
        .poison(tpoisons.inject({
          code: 503,
          body: '{"error": "toxy injected error"}',
          headers: { 'Content-Type': 'application/json' }
        }))
        .withRule(trules.probability(90))
        .all('/*');
      break;
    default:
      throw Error('Unknown toxy poison ' + poison);
  }

  return proxy;
}

const poisons = [
  'normal'
  //
  //  FIXME: Fix unreliable network tests
  //         [https://github.com/cloudant/couchbackup/issues/79]
  //
  //  'abort',
  //  'bandwidth-limit',
  //  'latency',
  //  'rate-limit',
  //  'slow-read',
  //  'unexpected-errors'
];

poisons.forEach(function(poison) {
  describe('unreliable network tests (using toxy poison ' + poison + ')', function() {
    var proxy;

    before('start toxy server', function() {
      proxy = setupProxy(poison);
      console.log('Using toxy poison ' + poison);

      // For these tests COUCH_URL points to the toxy proxy on localhost whereas
      // TEST_PROXY_BACKEND is the real CouchDb instance.

      proxy.listen(url.parse(process.env.COUCH_URL).port);
    });

    after('stop toxy server', function() {
      proxy.close();
    });

    require('./test.js');
  });
});
