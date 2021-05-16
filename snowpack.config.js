/** @type {import("snowpack").SnowpackUserConfig } */
module.exports = {
  mount: {
   public: {url: '/', static: true},
   src: {url: '/dist'},
  },
  plugins: [ 
    '@snowpack/plugin-react-refresh', 
    '@snowpack/plugin-dotenv', 
    '@snowpack/plugin-typescript', // TS support
    '@snowpack/plugin-webpack',
  ],
  /* for local SPA fallback routing support, more below */
  routes: [
    {"match": "routes", "src": ".*", "dest": "/index.html"},
  ],
  devOptions: {
    port: 3000,
  },
};
  