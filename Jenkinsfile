def setupNodeAndTest(version) {
    node {
        // Install nvm
        sh 'wget -qO- https://raw.githubusercontent.com/creationix/nvm/v0.33.2/install.sh | bash'
        // Unstash the built content
        unstash name: 'built'
        // run tests using creds
        withCredentials([[$class: 'UsernamePasswordMultiBinding', credentialsId: 'clientlibs-test', usernameVariable: 'DB_USER', passwordVariable: 'DB_PASSWORD']]) {
            withEnv(["COUCH_URL=https://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_USER}.cloudant.com", "NVM_DIR=${env.HOME}/.nvm"]) {
                try {
                    // Run in a single sh to preserve nvm Node version
                    // Load NVM
                    // Install/use required Node.js version
                    // Install mocha-junit-reporter so that we can get junit style output
                    // Run the unit tests
                    // Test the backup
                    sh """
                        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
                        nvm install ${version}
                        nvm use ${version}
                        npm install mocha-junit-reporter --save-dev
                        ./node_modules/mocha/bin/mocha test --reporter mocha-junit-reporter
                        cd citest
                        ./test_backup.sh
                    """
                } finally {
                    junit 'test-results.xml'
                }
            }
        }
    }
}

stage('Build') {
    // Checkout, build
    node {
        checkout scm
        sh 'npm install'
        stash name: 'built'
    }
}

stage('QA') {
    // Use the oldest supported version of Node
    def axes = [ Node4x : {setupNodeAndTest('lts/argon')}] //4.x LTS
    // Add some other versions (possibly just do this for master later)
    axes.putAll(
            Node6x : { setupNodeAndTest('lts/boron') }, // 6.x LTS
            Node : { setupNodeAndTest('node') } // Current
            )
    // Run the required axes in parallel
    parallel(axes)
}
