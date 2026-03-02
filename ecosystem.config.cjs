module.exports = {
  apps: [
    {
      name: 'pixelpoker',
      script: 'app.ts',
      interpreter: process.env.HOME + '/.bun/bin/bun',
      cwd: __dirname + '/server',
      env: {
        NODE_ENV: 'production',
        PORT: 8000,
      },
    },
  ],
};
