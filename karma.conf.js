var Path = require('path');

module.exports = function(config) {
    config.set({
        port: 9876,
        logLevel: config.LOG_WARNING,
        autoWatch: true,
        singleRun: false,
        browsers: [ 'Chrome' ],
        frameworks: [ 'chai', 'mocha' ],
        files: [
            'tests.bundle.js',
        ],

        preprocessors: {
            'tests.bundle.js': [ 'webpack', 'sourcemap' ]
        },

        plugins: [
            'karma-chai',
            'karma-chrome-launcher',
            'karma-mocha',
            'karma-sourcemap-loader',
            'karma-webpack',
        ],

        reporters: [ 'progress' ],

        webpack: {
            mode: 'development',
            module: {
                rules: [
                    {
                        test: /\.jsx?$/,
                        loader: 'babel-loader',
                        exclude: /node_modules/,
                        query: {
                            presets: [
                                'env',
                                'react',
                                'stage-0',
                            ],
                            plugins: [
                                'syntax-async-functions',
                                'syntax-class-properties',
                                'transform-regenerator',
                                'transform-runtime',
                            ]
                        }
                    }
                ]
            },
        },

        webpackMiddleware: {
            noInfo: true,
        },
    })
};
