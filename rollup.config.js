const Babel = require('rollup-plugin-babel');

module.exports = [
  'react',
  'preact',
].map((name) => {
  return {
    input: `src/${name}.mjs`,
    output: {
      file: `./${name}.js`,
      format: 'umd',
      name: 'RelaksHarvest',
      globals: {
        react: 'React',
        preact: 'Preact',
      }
    },
    plugins: [
      Babel({
        presets: [ '@babel/env' ],
      }),
    ],
    external: [ 'react', 'preact' ],
  };
});
