/** Stable matching key for Japanese vocabulary entries, not a primary key. */
export function normalizedKey(input: {word: string; reading: string; partOfSpeech?: string | null}) {
  return [input.word, input.reading, input.partOfSpeech || ""]
    .map((value) => value.normalize("NFKC").toLowerCase().trim())
    .join("|");
}
