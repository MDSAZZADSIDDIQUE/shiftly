export { cn } from "cn"

/** "branch" -> "branches", "site" -> "sites" */
export function plural(word: string) {
  return /(s|x|z|ch|sh)$/i.test(word) ? `${word}es` : `${word}s`
}
