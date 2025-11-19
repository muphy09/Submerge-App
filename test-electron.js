const { app } = require('electron');

console.log('app type:', typeof app);
console.log('app:', app);

if (app && app.whenReady) {
  app.whenReady().then(() => {
    console.log('Electron is ready!');
    app.quit();
  });
} else {
  console.error('app is undefined or missing whenReady');
  process.exit(1);
}
