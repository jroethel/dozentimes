# Question cards

A stage that needs the human asks through one card, which the graph shows with no deadline.
End the reply with one line that starts `JRIT-ASK ` and carries a compact JSON object on that same line, with nothing after it.
The JSON is `{"questions":[...]}` with 1 to 4 questions, this chain's cap (cezar allows up to 20); each question is `{"header":"...","question":"...","options":[...]}`, and each option is `{"label":"...","description":"..."}`.
The limits are cezar 0.15.0's own card schema: header 1 to 12 characters, question 1 to 400 (keep it under 380, because the extractor prefixes the first question with its card number), 2 to 10 options per question, label 1 to 60, description at most 280.
Question texts are unique within the card, option labels are unique within a question, and the only other key allowed on a question is `"multiSelect": true`.
Keep the whole JSON line under 3,500 characters, because the graph reads only the last 4,000 characters of the reply.
The header names the decision in a word or two, the question is one short sentence ending in "?", and each description is one line saying what the option means or costs.
Put the recommended option first and end its label with " (recommended)".
Ask one decision per question; a scope change gets its own question.
Background the answer depends on goes in the option descriptions, and anything longer goes in a committed file the question names by path.
A card that fails cezar's schema reaches the human as a text card asking for a resend, so check every limit above before you print it.
The answer arrives as one `<header>: <label>` line per question, or as free text the human typed below the card.
Outside the card, narrate in one-line status updates: no reports, tables, or summaries in the session.
Never write JRIT-ASK in a reply that does not ask.
