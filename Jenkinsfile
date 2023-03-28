#!groovy
// Copyright © 2017, 2023 IBM Corp. All rights reserved.
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

def getEnvForSuite(suiteName) {

  def envVars = []

  // Add test suite specific environment variables
  switch(suiteName) {
    case 'test':
      break
    case 'toxytests/toxy':
      envVars.add("TEST_TIMEOUT_MULTIPLIER=50")
      break
      case 'test-iam':
        envVars.add("CLOUDANT_IAM_TOKEN_URL=${SDKS_TEST_IAM_URL}")
        break
    default:
      error("Unknown test suite environment ${suiteName}")
  }

  return envVars
}



// NB these registry URLs must have trailing slashes

// url of registry for public uploads
def getRegistryPublic() {
    return "https://registry.npmjs.org/"
}

// url of registry for artifactory down
def getRegistryArtifactoryDown() {
    return "${Artifactory.server('taas-artifactory').getUrl()}/api/npm/cloudant-sdks-npm-virtual/"
}

def noScheme(str) {
    return str.substring(str.indexOf(':') + 1)
}

def withNpmEnv(registry, closure) {
  withEnv(['NPMRC_REGISTRY=' + noScheme(registry),
           'NPM_CONFIG_REGISTRY=' + registry,
           'NPM_CONFIG_USERCONFIG=.npmrc-jenkins']) {
    closure()
  }
}

def nodeYaml(version) {
    return """
    - name: node${version}
      image: ${globals.ARTIFACTORY_DOCKER_REPO_VIRTUAL}/node:${version}
      command: ['sh', '-c', 'sleep 99d']
      imagePullPolicy: Always
      resources:
        requests:
          memory: "2Gi"
          cpu: "650m"
        limits:
          memory: "4Gi"
          cpu: "4"
"""
}

def workspace = 0

def setupNodeAndTest(version, filter='', testSuite='test') {

  return {

  container("node${version}") {
    
    dir("workspace-${workspace++}") {

    if (testSuite == 'lint') {
      sh 'npm run lint'
    } else {
      // Run tests using creds
      withEnv(getEnvForSuite("${testSuite}")) {
        withCredentials([usernamePassword(credentialsId: 'testServerLegacy', usernameVariable: 'DB_USER', passwordVariable: 'DB_PASSWORD'),
                         usernamePassword(credentialsId: 'artifactory', usernameVariable: 'ARTIFACTORY_USER', passwordVariable: 'ARTIFACTORY_PW'),
                         string(credentialsId: 'testServerIamApiKey', variable: "${(testSuite == 'test-iam') ? 'COUCHBACKUP_TEST_IAM_API_KEY' : 'IAM_API_KEY'}")]) {
          try {
            // For the IAM tests we want to run the normal 'test' suite, but we
            // want to keep the report named 'test-iam'
            def testRun = (testSuite != 'test-iam') ? testSuite : 'test'
            def dbPassword = java.net.URLEncoder.encode(DB_PASSWORD, "UTF-8")
            
            // Actions:
            //  3. Install mocha-jenkins-reporter so that we can get junit style output
            //  4. Fetch database compare tool for CI tests
            //  5. Run tests using filter
            withCredentials([usernamePassword(usernameVariable: 'NPMRC_USER', passwordVariable: 'NPMRC_TOKEN', credentialsId: 'artifactory')]) {
              withEnv(['NPMRC_EMAIL=' + env.NPMRC_USER]) {
                withNpmEnv(registryArtifactoryDown) {
                  sh """
                    npm install mocha-jenkins-reporter --save-dev
                    set +x
                    export COUCH_BACKEND_URL="https://\${DB_USER}:${dbPassword}@\${SDKS_TEST_SERVER_HOST}"
                    export COUCH_URL="${(testSuite == 'toxytests/toxy') ? 'http://localhost:3000' : ((testSuite == 'test-iam') ? '${SDKS_TEST_SERVER_URL}' : '${COUCH_BACKEND_URL}')}"
                    set -x
                    ./node_modules/mocha/bin/mocha.js --reporter mocha-jenkins-reporter --reporter-options junit_report_path=./test/test-results.xml,junit_report_stack=true,junit_report_name=${testSuite} ${filter} ${testRun}
                  """
                }
              }
            }
          } finally {
            junit '**/*test-results.xml'
          }
        }
      }
    }
  }
  }
  }
}

pipeline {
  agent {
    kubernetes {
      yaml """
apiVersion: v1
kind: Pod
metadata:
  name: sdks-custom-couchbackup
spec:
  imagePullSecrets:
    - name: artifactory
  containers:
    - name: jnlp
      image: ${globals.ARTIFACTORY_DOCKER_REPO_VIRTUAL}/sdks-full-agent
      imagePullPolicy: Always
      resources:
        requests:
          memory: "2Gi"
          cpu: "650m"
        limits:
          memory: "4Gi"
          cpu: "4"
${nodeYaml(14)}
${nodeYaml(16)}
${nodeYaml(18)}
${nodeYaml(19)}
  restartPolicy: Never
status: {}
"""
    }
  }
  stages {
    stage('Build') {
      steps {
        withCredentials([usernamePassword(usernameVariable: 'NPMRC_USER', passwordVariable: 'NPMRC_TOKEN', credentialsId: 'artifactory')]) {
          withEnv(['NPMRC_EMAIL=' + env.NPMRC_USER]) {
            withNpmEnv(registryArtifactoryDown) {
              sh "npm ci"
            }
          }
        }
      }
    }
    stage('QA') {

      steps {

        script {
          // Allow a supplied a test filter, but provide a reasonable default.
          String filter;
          if (env.TEST_FILTER == null) {
            // The set of default tests includes unit and integration tests, but
            // not ones tagged #slower, #slowest.
            filter = '-i -g \'#slowe\''
          } else {
            filter = env.TEST_FILTER
          }

          def axes = [
            Node14x: setupNodeAndTest('14', filter), // 14.x Maintenance LTS
            Node16x: setupNodeAndTest('16', filter), // 16.x Maintenance LTS
            Node18x: setupNodeAndTest('18', filter), // 18.x Active LTS
            Node: setupNodeAndTest('19', filter), // Current
            // Test IAM on the current Node.js version. Filter out unit tests and the
            // slowest integration tests.
            Iam: setupNodeAndTest('18', '-i -g \'#unit|#slowe\'', 'test-iam'),
            Lint: setupNodeAndTest('14', '', 'lint')
          ]
          // Add unreliable network tests if specified
          if (env.RUN_TOXY_TESTS && env.RUN_TOXY_TESTS.toBoolean()) {
            axes.Network = setupNodeAndTest('node', '', 'toxytests/toxy')
          }
          // Run the required axes in parallel
          parallel(axes)
        }
      }
    }
    stage('SonarQube analysis') {
      when {
        beforeAgent true
        allOf {
          expression { env.BRANCH_NAME }
          not {
            expression { env.BRANCH_NAME.startsWith('dependabot/') }
          }
        }
      }
      steps {
        script {
          def scannerHome = tool 'SonarQubeScanner';
          withSonarQubeEnv(installationName: 'SonarQubeServer') {
            sh "${scannerHome}/bin/sonar-scanner -X -Dsonar.qualitygate.wait=true -Dsonar.projectKey=couchbackup -Dsonar.branch.name=${env.BRANCH_NAME}"
          }
        }
      }
    }
    // Publish the primary branch
    stage('Publish') {
      when {
        beforeAgent true
        branch 'main'
      }
      steps {
        script {
          def v = com.ibm.cloudant.integrations.VersionHelper.readVersion(this, 'package.json')
          String version = v.version
          boolean isReleaseVersion = v.isReleaseVersion

          // Upload using the NPM creds
          withCredentials([string(credentialsId: 'npm-mail', variable: 'NPMRC_EMAIL'),
                          usernamePassword(credentialsId: 'npm-creds', passwordVariable: 'NPMRC_TOKEN', usernameVariable: 'NPMRC_USER')]) {
            // Actions:
            // 1. add the build ID to any snapshot version for uniqueness
            // 2. publish the build to NPM adding a snapshot tag if pre-release
            sh "${isReleaseVersion ? '' : ('npm version --no-git-tag-version ' + version + '.' + env.BUILD_ID)}"
            withNpmEnv(registryPublic) {
              sh "npm publish ${isReleaseVersion ? '' : '--tag snapshot'}"
            }
          }
          // Run the gitTagAndPublish which tags/publishes to github for release builds
          gitTagAndPublish {
              versionFile='package.json'
              releaseApiUrl='https://api.github.com/repos/cloudant/couchbackup/releases'
          }
        }
      }
    }
  }
}
