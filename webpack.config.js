
const path = require('path');

module.exports = {
  watch: false,
  entry: './app/scripts/main.js',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, './server/dist/scripts'),
  },
  resolve: {
    extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"]
  },
  devtool: '#inline-source-map',
  module: {
    loaders: [
      {
      test: /\.ts?$/,
      loader: 'awesome-typescript-loader'
    }
    ]
  }
};
