const { spawn } = require('node:child_process');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

spawn(electron, ['.'], { env, detached: true, windowsHide: true, stdio: 'ignore' }).unref();
