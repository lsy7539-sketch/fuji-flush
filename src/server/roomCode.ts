// Excludes visually ambiguous characters (0/O, 1/I) since codes are read aloud/typed by hand.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;

export function generateRoomCode(isTaken: (code: string) => boolean): string {
  let code: string;
  do {
    code = randomCode();
  } while (isTaken(code));
  return code;
}

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
