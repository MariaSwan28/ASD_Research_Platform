"""Deterministic preprocessing following the supplied text thesis.

Regex tokenization avoids downloading Punkt at runtime. Stopwords are a pinned
local NLTK Russian list; original training used pymorphy3 normalization.
"""
from functools import lru_cache
from pathlib import Path
import re

@lru_cache(maxsize=1)
def resources():
    import pymorphy3
    words = (Path(__file__).resolve().parents[1]/'resources/russian_stopwords.txt').read_text(encoding='utf-8').splitlines()
    return pymorphy3.MorphAnalyzer(), frozenset(words)

def prepare_sentences(text):
    morph, stopwords = resources()
    output = []
    for sentence in re.split(r'[.!?\n]+', text):
        sentence = sentence.strip()
        if not sentence: continue
        # Preserve original sentence for the report; normalize only model input.
        tokens = re.findall(r'[а-яёa-z]+', sentence.lower())
        lemmas = [morph.parse(word)[0].normal_form for word in tokens]
        cleaned = ' '.join(word for word in lemmas if word not in stopwords)
        output.append({'text': sentence, 'normalized': cleaned})
    return output
