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
  var proxy = toxy({
    auth: url.parse(process.env.COUCH_BACKEND_URL).auth,
    changeOrigin: true
  });

  switch (poison) {
    case 'normal':
      proxy
        .forward(process.env.COUCH_BACKEND_URL)
        .all('/*');
      break;
    case 'bandwidth-limit':
      // https://github.com/h2non/toxy#bandwidth
      proxy
        .forward(process.env.COUCH_BACKEND_URL)
        .poison(tpoisons.bandwidth({ bps: 256 * 1024 })) // 256 kB/s
        .all('/*');
      break;
    case 'latency':
      // https://github.com/h2non/toxy#latency
      proxy
        .forward(process.env.COUCH_BACKEND_URL)
        .poison(tpoisons.latency({ max: 10000, min: 100 }))
        .withRule(trules.probability(50))
        .all('/*');
      break;
    case 'slow-read':
      // https://github.com/h2non/toxy#slow-read
      proxy
        .forward(process.env.COUCH_BACKEND_URL)
        .poison(tpoisons.slowRead({ bps: 1024, threshold: 100 }))
        .withRule(trules.probability(50))
        .all('/*');
      break;
    default:
      throw Error('Unknown toxy poison ' + poison);
  }

  return proxy;
}

const poisons = [
  'normal',
  'bandwidth-limit',
  'latency',
  'slow-read'
];

poisons.forEach(function(poison) {
  describe('unreliable network tests (using toxy poison ' + poison + ')', function() {
    var proxy;

    before('start toxy server', function() {
      proxy = setupProxy(poison);
      console.log('Using toxy poison ' + poison);

      // For these tests COUCH_URL points to the toxy proxy on localhost whereas
      // COUCH_BACKEND_URL is the real CouchDb instance.

      proxy.listen(url.parse(process.env.COUCH_URL).port);
    });

    after('stop toxy server', function() {
      proxy.close();
    });

    delete require.cache[require.resolve('../test/ci_e2e.js')];
    require('../test/ci_e2e.js');
  });
});
