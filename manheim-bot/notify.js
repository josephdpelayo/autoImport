const { execFile } = require('child_process');

const IMESSAGE_TARGET = 'arik_52@hotmail.com';

function escapeForAppleScript(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function notify(title, message) {
  const script = `display notification "${escapeForAppleScript(message)}" with title "${escapeForAppleScript(title)}" sound name "Glass"`;
  execFile('osascript', ['-e', script], (err) => {
    if (err) console.error('No se pudo mostrar la notificación:', err.message);
  });
}

function notifyPhone(message) {
  const script = `tell application "Messages" to send "${escapeForAppleScript(message)}" to buddy "${IMESSAGE_TARGET}" of (1st service whose service type = iMessage)`;
  execFile('osascript', ['-e', script], (err) => {
    if (err) console.error('No se pudo enviar el iMessage:', err.message);
  });
}

module.exports = { notify, notifyPhone };
