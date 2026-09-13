/**
 * Character-level Tokenizer with Special Tokens for Local Brain Lab.
 * Inspired directly by Andrej Karpathy's Shakespeare character-level nanoGPT tokenizer.
 * 
 * Benefits:
 * - 100% transparent and inspectable (no hidden subword black boxes)
 * - Zero external download required
 * - Perfect for training and observing transformer mechanics from scratch
 * - Robust handling of Spanish (á, é, í, ó, ú, ñ, ¿, ¡), Portuguese (ã, õ, ç, ê),
 *   Lua code syntax (==, ~=, ..), numbers and symbols.
 */

export const SPECIAL_TOKENS = {
  PAD: '<|pad|>',
  START: '<|startoftext|>',
  USER: '<|user|>',
  ASSISTANT: '<|assistant|>',
  END: '<|endoftext|>',
  UNKNOWN: '<|unk|>',
} as const;

export interface TokenDetail {
  id: number;
  text: string;
  isSpecial: boolean;
}

export class NanoTokenizer {
  vocab: string[];
  charToId: Map<string, number>;
  idToChar: Map<number, string>;
  specialTokenMap: Map<string, number>;

  constructor(customChars?: string[]) {
    this.vocab = [];
    this.charToId = new Map();
    this.idToChar = new Map();
    this.specialTokenMap = new Map();

    this.initVocab(customChars);
  }

  private initVocab(customChars?: string[]) {
    // Standard base characters
    const specialTokens = [
      SPECIAL_TOKENS.PAD,
      SPECIAL_TOKENS.START,
      SPECIAL_TOKENS.USER,
      SPECIAL_TOKENS.ASSISTANT,
      SPECIAL_TOKENS.END,
      SPECIAL_TOKENS.UNKNOWN,
    ];

    const standardChars = [
      '\n', ' ', '\t',
      '!', '"', '#', '$', '%', '&', '\'', '(', ')', '*', '+', ',', '-', '.', '/',
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      ':', ';', '<', '=', '>', '?', '@',
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
      '[', '\\', ']', '^', '_', '`',
      'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
      '{', '|', '}', '~',
      // Spanish & Portuguese accents & punctuation
      'á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', 'Á', 'É', 'Í', 'Ó', 'Ú', 'Ñ', '¿', '¡',
      'ã', 'õ', 'ç', 'ê', 'â', 'ô', 'à', 'Ã', 'Õ', 'Ç', 'Ê', 'Â', 'Ô',
    ];

    const all: string[] = [...specialTokens];
    for (const c of standardChars) {
      if (!all.includes(c)) all.push(c);
    }

    if (customChars) {
      for (const c of customChars) {
        if (!all.includes(c)) all.push(c);
      }
    }

    this.vocab = all;
    this.charToId.clear();
    this.idToChar.clear();
    this.specialTokenMap.clear();

    for (let i = 0; i < this.vocab.length; i++) {
      const token = this.vocab[i];
      this.charToId.set(token, i);
      this.idToChar.set(i, token);
      if (token.startsWith('<|') && token.endsWith('|>')) {
        this.specialTokenMap.set(token, i);
      }
    }
  }

  get vocabSize(): number {
    return this.vocab.length;
  }

  get specialTokens() {
    return {
      pad: this.charToId.get(SPECIAL_TOKENS.PAD) ?? 0,
      start: this.charToId.get(SPECIAL_TOKENS.START) ?? 1,
      user: this.charToId.get(SPECIAL_TOKENS.USER) ?? 2,
      assistant: this.charToId.get(SPECIAL_TOKENS.ASSISTANT) ?? 3,
      end: this.charToId.get(SPECIAL_TOKENS.END) ?? 4,
      unk: this.charToId.get(SPECIAL_TOKENS.UNKNOWN) ?? 5,
    };
  }

  encode(text: string): number[] {
    const tokens: number[] = [];
    let i = 0;
    while (i < text.length) {
      // Check for special token match first
      let matchedSpecial = false;
      for (const [special, id] of this.specialTokenMap.entries()) {
        if (text.startsWith(special, i)) {
          tokens.push(id);
          i += special.length;
          matchedSpecial = true;
          break;
        }
      }
      if (matchedSpecial) continue;

      const char = text[i];
      const id = this.charToId.get(char);
      if (id !== undefined) {
        tokens.push(id);
      } else {
        tokens.push(this.specialTokens.unk);
      }
      i++;
    }
    return tokens;
  }

  decode(tokens: number[]): string {
    let result = '';
    for (const token of tokens) {
      const char = this.idToChar.get(token);
      if (char !== undefined) {
        result += char;
      }
    }
    return result;
  }

  inspect(tokens: number[]): TokenDetail[] {
    return tokens.map(id => {
      const text = this.idToChar.get(id) ?? '?';
      const isSpecial = text.startsWith('<|') && text.endsWith('|>');
      return { id, text, isSpecial };
    });
  }

  formatConversation(userInput: string, assistantOutput?: string): string {
    let prompt = `${SPECIAL_TOKENS.USER}${userInput}${SPECIAL_TOKENS.ASSISTANT}`;
    if (assistantOutput !== undefined) {
      prompt += `${assistantOutput}${SPECIAL_TOKENS.END}`;
    }
    return prompt;
  }
}
