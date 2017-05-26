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

import groovy.json.JsonSlurper

def getEnv(envName) {
          // Base environment variables
          def envVars = [
            "COUCH_URL_COMPARE=https://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_USER}.cloudant.com",
            "DBCOMPARE_NAME=DatabaseCompare",
            "DBCOMPARE_VERSION=1.0.0",
            "NVM_DIR=${env.HOME}/.nvm",
            "TEST_LIMIT=900"
          ]

          // Add test suite specific environment variables
          switch(envName) {
            case 'test-default':
              envVars.add("COUCH_URL=https://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_USER}.cloudant.com")
              break
            case 'toxy-default':
              envVars.add("COUCH_URL=http://localhost:3000") // proxy
              envVars.add("TEST_PROXY_BACKEND=https://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_USER}.cloudant.com")
              break
            default:
              error("Unknown test suite environment ${envName}")
          }

          return envVars
}

def setupNodeAndTest(version, testSuite='test', envName='default') {
    node {
        // Install NVM
        sh 'wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.2/install.sh | bash'
        // Unstash the built content
        unstash name: 'built'

        // Run tests using creds
        withCredentials([[$class: 'UsernamePasswordMultiBinding', credentialsId: 'clientlibs-test', usernameVariable: 'DB_USER', passwordVariable: 'DB_PASSWORD'],
                         [$class: 'UsernamePasswordMultiBinding', credentialsId: 'artifactory', usernameVariable: 'ARTIFACTORY_USER', passwordVariable: 'ARTIFACTORY_PW']]) {
          withEnv(getEnv("${testSuite}-${envName}")) {
            try {
              // Actions:
              //  - Load NVM
              //  - Install/use required Node.js version
              //  - Install mocha-junit-reporter so that we can get junit style output
              //  - Run unit tests
              //  - Fetch database compare tool for CI tests
              //  - Run test suite
              sh """
                [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                nvm install ${version}
                nvm use ${version}
                npm install mocha-junit-reporter --save-dev
                ./node_modules/mocha/bin/mocha test --reporter mocha-junit-reporter --reporter-options mochaFile=./test/unit-test-results.xml
                cd citest
                curl -O -u ${env.ARTIFACTORY_USER}:${env.ARTIFACTORY_PW} https://na.artifactory.swg-devops.com/artifactory/cloudant-sdks-maven-local/com/ibm/cloudant/${env.DBCOMPARE_NAME}/${env.DBCOMPARE_VERSION}/${env.DBCOMPARE_NAME}-${env.DBCOMPARE_VERSION}.zip
                unzip ${env.DBCOMPARE_NAME}-${env.DBCOMPARE_VERSION}.zip
                ../node_modules/mocha/bin/mocha ${testSuite} --reporter mocha-junit-reporter --reporter-options mochaFile=./ci-${testSuite}-results.xml
              """
            } finally {
              junit '**/*test-results.xml'
            }
          }
        }
    }
}

@NonCPS
def isReleaseVersion(packageText) {
  def info = new JsonSlurper().parseText(packageText)
  !info['version'].toUpperCase(Locale.ENGLISH).contains('SNAPSHOT')
}

def releaseVersion

stage('Build') {
    // Checkout, build
    node {
        checkout scm
        releaseVersion = isReleaseVersion(readFile('package.json'))
        sh 'npm install'
        stash name: 'built'
    }
}

stage('QA') {
  def axes = [
    Node4x:{ setupNodeAndTest('lts/argon') }, //4.x LTS
    Node6x:{ setupNodeAndTest('lts/boron') }, // 6.x LTS
    Node:{ setupNodeAndTest('node') } // Current
  ]
  // Add unreliable network tests for release builds
  if (releaseVersion) {
    axes.Network = { setupNodeAndTest('node', 'toxy') }
  }
  // Run the required axes in parallel
  parallel(axes)
}
