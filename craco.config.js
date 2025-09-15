module.exports = {
    webpack: {
      configure: (webpackConfig) => {
        webpackConfig.resolve = webpackConfig.resolve || {};
        webpackConfig.resolve.fallback = {
          ...webpackConfig.resolve.fallback,
          crypto: require.resolve('crypto-browserify'),
          util: require.resolve('util/'),
          buffer: require.resolve('buffer/'),
          stream: require.resolve('stream-browserify'),
        };
        return webpackConfig;
      },
    },
  };