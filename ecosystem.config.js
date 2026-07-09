module.exports = {
  apps: [
    {
      name: 'gitfitbot',
      script: './dist/src/index.js',
      // Start pm2 while the correct Node is active in your shell (nvm use 22).
      // Or force it: pm2 start ecosystem.config.js --interpreter $(which node)
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
