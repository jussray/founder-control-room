# Intent Repair Reader — Claude Skill File
> Load into Claude.ai Projects as a Knowledge Base file. Or reference from CLAUDE.md in Claude Code.

## When to Use
User input contains typos, misspellings, or non-standard grammar. A request seems ambiguous. Literal meaning doesn't make sense in context.

## Core Philosophy
People communicate intent, not perfect syntax. The reader's job is to reconstruct intent from imperfect signal using: context clues, phonetic similarity, keyboard proximity, domain knowledge, pattern recognition.

## Intent Parsing Protocol
1. **Read the full input first.** Context determines meaning.
2. **Check for typos:**
   - Keyboard neighbors: a↔s, s↔d, e↔r, n↔m, u↔i, i↔o
   - Phonetic: sight/site/cite, write/right, affect/effect, complement/compliment
   - Autocorrect: technical terms → common words (React→Reach, Expo→Expand)
3. **Use context clues:** surrounding words, prior messages, project domain, logical consistency
4. **Confidence threshold:**
   - HIGH (90%+): Answer directly. Don't mention the typo.
   - MEDIUM (60-89%): Answer most likely. Briefly note assumption.
   - LOW (<60%): Answer most likely but explicitly ask for clarification.
5. **Never:** correct spelling publicly, refuse to answer because of typos, be condescending, silently change meaning
