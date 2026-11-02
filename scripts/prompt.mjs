// Terminal questions for the scripts run by the project owner. A hidden answer (a password) is never echoed,
// stored or printed. On a keyboard (TTY) characters are read one by one in raw mode; otherwise (input from a file,
// used by the tests on the emulators) one line per answer.
import { stdin, stdout } from "node:process";

let pending = "";          // characters received and not yet consumed
const waiting = [];        // resolvers of the questions in progress, in order

function drain() {
  while (waiting.length) {
    const end = pending.search(/[\r\n\u0004]/);
    if (end < 0) return;
    const line = pending.slice(0, end);
    pending = pending.slice(end + 1).replace(/^\n/, ""); // \r\n counts once
    waiting.shift()(line);
  }
}

function onData(chunk) {
  for (const ch of chunk) {
    if (ch === "\u0003") { stdout.write("\n"); process.exit(130); }
    if (ch === "\u007f" || ch === "\b") pending = pending.slice(0, -1);
    else pending += ch;
  }
  drain();
}

function ask(question, hidden) {
  return new Promise((resolve) => {
    stdout.write(question);
    if (stdin.isTTY) stdin.setRawMode(hidden);
    if (!stdin.listenerCount("data")) { stdin.setEncoding("utf8"); stdin.on("data", onData); }
    stdin.resume();
    waiting.push((answer) => {
      if (stdin.isTTY) stdin.setRawMode(false);
      if (hidden || !stdin.isTTY) stdout.write("\n");
      if (!waiting.length) stdin.pause();
      resolve(answer);
    });
    drain();
  });
}

export const askHidden = (question) => ask(question, true);
export const askLine = (question) => ask(question, false);
