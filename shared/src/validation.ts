export const MAX_NICKNAME_LENGTH = 12;

const NICKNAME_PATTERN = /^[A-Za-z0-9_\u3007\u3400-\u4DBF\u4E00-\u9FFF]{1,12}$/;

export function isValidNickname(value: string): boolean {
  return NICKNAME_PATTERN.test(value);
}
