// Derived from the name rather than assigned, so everyone in the room sees the
// same person in the same colour without the server having to track it — and it
// survives a reconnect, which an assigned colour wouldn't.
const DIAL_COLOURS = ['#ffb56b', '#5eead4', '#f472b6', '#a5b4fc', '#fcd34d', '#86efac'];

function colourFor(name) {
  const text = String(name || '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return DIAL_COLOURS[hash % DIAL_COLOURS.length];
}

export { colourFor };
