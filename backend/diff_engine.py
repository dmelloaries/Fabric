import re
from difflib import SequenceMatcher
from typing import List, Dict, Any


def compute_word_diff(old_text: str, new_text: str) -> List[Dict[str, str]]:
    """
    Computes deterministic word-level diff using Python's SequenceMatcher.
    Returns a sequence of tokens with type: 'equal', 'delete', or 'insert'.
    Zero hallucination, 100% reproducible.
    """
    if not old_text and not new_text:
        return []
    if not old_text:
        return [{"type": "insert", "text": new_text}]
    if not new_text:
        return [{"type": "delete", "text": old_text}]

    # Tokenize preserving whitespace and punctuation
    old_words = re.findall(r'\S+|\s+', old_text)
    new_words = re.findall(r'\S+|\s+', new_text)

    matcher = SequenceMatcher(None, old_words, new_words)
    diff_tokens: List[Dict[str, str]] = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            text = "".join(old_words[i1:i2])
            diff_tokens.append({"type": "equal", "text": text})
        elif tag == 'delete':
            text = "".join(old_words[i1:i2])
            diff_tokens.append({"type": "delete", "text": text})
        elif tag == 'insert':
            text = "".join(new_words[j1:j2])
            diff_tokens.append({"type": "insert", "text": text})
        elif tag == 'replace':
            del_text = "".join(old_words[i1:i2])
            ins_text = "".join(new_words[j1:j2])
            diff_tokens.append({"type": "delete", "text": del_text})
            diff_tokens.append({"type": "insert", "text": ins_text})

    return diff_tokens
