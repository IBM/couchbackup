stage('Build') {
    // Checkout, build
    node {
        checkout scm
        sh 'npm install'
        stash name: 'built'
    }
}

stage('QA') {
    node {
        // Unstash the built content
        unstash name: 'built'
        // run tests using creds
        withCredentials([[$class: 'UsernamePasswordMultiBinding', credentialsId: 'clientlibs-test', usernameVariable: 'DB_USER', passwordVariable: 'DB_PASSWORD']]) {
            try {
                // install mocha-junit-reporter so that we can get junit style output
                sh 'npm install mocha'
                sh 'npm install mocha-junit-reporter --save-dev'
                // run unit tests
                sh './node_modules/mocha/bin/mocha test --reporter mocha-junit-reporter'
            } finally {
                junit 'test-results.xml'
            }
        }
    }
}
